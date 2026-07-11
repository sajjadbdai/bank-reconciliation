// engine.js — Bank Reconciliation Matching Engine

const Engine = (() => {

  const AMOUNT_TOL = 0.005; // BHD tolerance for floating point

  function dateDiffDays(a, b) {
    return Math.abs((a.getTime() - b.getTime()) / 86400000);
  }

  function amountsMatch(a, b) {
    return Math.abs(a - b) <= AMOUNT_TOL;
  }

  // Main reconciliation entry point
  // options: { dateTolerance: number (days), splitTolerance: number (days) }
  function reconcile(bankTxns, ledgerTxns, options = {}) {
    const dateTol = options.dateTolerance ?? 7;
    const splitTol = options.splitTolerance ?? 10;

    // Work on clones to track matched state
    const bank = bankTxns.map((t, i) => ({ ...t, _matched: false, _idx: i }));
    const ledger = ledgerTxns.map((t, i) => ({ ...t, _matched: false, _idx: i }));

    const results = [];

    // ── PASS 1: Cheque Number Matching ────────────────────────────────────────
    const bankWithChq = bank.filter(t => t.chqNo && !t._matched);
    const ledgerWithChq = ledger.filter(t => t.chqNo && !t._matched);

    for (const bt of bankWithChq) {
      if (bt._matched) continue;
      for (const lt of ledgerWithChq) {
        if (lt._matched) continue;
        if (bt.chqNo === lt.chqNo) {
          const variance = Math.round((bt.normalized - lt.normalized) * 1000) / 1000;
          const dayDiff = dateDiffDays(bt.date, lt.date);
          bt._matched = true;
          lt._matched = true;
          results.push({
            id: `r-${results.length}`,
            type: 'chq',
            matchLabel: `Cheque #${bt.chqNo}`,
            bankItems: [bt],
            ledgerItems: [lt],
            variance,
            dateDiff: dayDiff,
            status: Math.abs(variance) <= AMOUNT_TOL && dayDiff <= dateTol
              ? 'matched'
              : 'review',
            explanation: '',
            explanationType: '',
            resolved: false,
            manuallyLinked: false,
          });
          break;
        }
      }
    }

    // ── PASS 2: Exact Amount + Exact Date (±1 day) ────────────────────────────
    const bankFree = bank.filter(t => !t._matched);
    const ledgerFree = ledger.filter(t => !t._matched);

    for (const bt of bankFree) {
      if (bt._matched) continue;
      for (const lt of ledgerFree) {
        if (lt._matched) continue;
        if (amountsMatch(bt.normalized, lt.normalized) && dateDiffDays(bt.date, lt.date) <= 1) {
          bt._matched = true;
          lt._matched = true;
          results.push({
            id: `r-${results.length}`,
            type: 'exact',
            matchLabel: 'Exact Match',
            bankItems: [bt],
            ledgerItems: [lt],
            variance: 0,
            dateDiff: dateDiffDays(bt.date, lt.date),
            status: 'matched',
            explanation: '',
            explanationType: '',
            resolved: false,
            manuallyLinked: false,
          });
          break;
        }
      }
    }

    // ── PASS 3: Near-Date Match (same amount, within dateTol days) ────────────
    const bankFree2 = bank.filter(t => !t._matched);
    const ledgerFree2 = ledger.filter(t => !t._matched);

    for (const bt of bankFree2) {
      if (bt._matched) continue;
      // Find all ledger candidates with same amount within tolerance
      const candidates = ledgerFree2
        .filter(lt => !lt._matched && amountsMatch(bt.normalized, lt.normalized))
        .map(lt => ({ lt, diff: dateDiffDays(bt.date, lt.date) }))
        .filter(c => c.diff <= dateTol)
        .sort((a, b) => a.diff - b.diff);

      if (candidates.length > 0) {
        const { lt, diff } = candidates[0];
        bt._matched = true;
        lt._matched = true;
        results.push({
          id: `r-${results.length}`,
          type: 'near_date',
          matchLabel: `Timing Difference (${diff} day${diff !== 1 ? 's' : ''})`,
          bankItems: [bt],
          ledgerItems: [lt],
          variance: 0,
          dateDiff: diff,
          status: 'review',
          explanation: diff > 1 ? 'Possible timing difference (e.g., outstanding cheque or bank processing delay).' : '',
          explanationType: diff > 1 ? 'timing' : '',
          resolved: false,
          manuallyLinked: false,
        });
      }
    }

    // ── PASS 4: Split Transaction Match ───────────────────────────────────────
    // One ledger entry = sum of multiple bank entries (or vice versa)
    // e.g., Ledger: 100.110 BHD = Bank: 100.000 + 0.110 (bank charges)
    const bankFree3 = bank.filter(t => !t._matched);
    const ledgerFree3 = ledger.filter(t => !t._matched);

    // Try: one ledger → multiple bank
    for (const lt of ledgerFree3) {
      if (lt._matched) continue;
      const bankCands = bankFree3.filter(bt =>
        !bt._matched &&
        dateDiffDays(bt.date, lt.date) <= splitTol &&
        Math.sign(bt.normalized) === Math.sign(lt.normalized)
      );
      // Find a subset that sums to lt.normalized
      const match = findSubsetSum(bankCands, lt.normalized, AMOUNT_TOL);
      if (match && match.length >= 2) {
        match.forEach(bt => { bt._matched = true; });
        lt._matched = true;
        const variance = Math.round((match.reduce((s, b) => s + b.normalized, 0) - lt.normalized) * 1000) / 1000;
        results.push({
          id: `r-${results.length}`,
          type: 'split',
          matchLabel: `Split Transaction (${match.length} bank entries → 1 ledger)`,
          bankItems: match,
          ledgerItems: [lt],
          variance,
          dateDiff: Math.max(...match.map(bt => dateDiffDays(bt.date, lt.date))),
          status: 'review',
          explanation: 'Bank recorded this as multiple entries (e.g., amount + bank charges), while ledger has a single combined entry.',
          explanationType: 'split',
          resolved: false,
          manuallyLinked: false,
        });
        continue;
      }
    }

    // Try: one bank → multiple ledger
    const bankFree4 = bank.filter(t => !t._matched);
    const ledgerFree4 = ledger.filter(t => !t._matched);

    for (const bt of bankFree4) {
      if (bt._matched) continue;
      const ledgerCands = ledgerFree4.filter(lt =>
        !lt._matched &&
        dateDiffDays(bt.date, lt.date) <= splitTol &&
        Math.sign(lt.normalized) === Math.sign(bt.normalized)
      );
      const match = findSubsetSum(ledgerCands, bt.normalized, AMOUNT_TOL);
      if (match && match.length >= 2) {
        match.forEach(lt => { lt._matched = true; });
        bt._matched = true;
        const variance = Math.round((bt.normalized - match.reduce((s, l) => s + l.normalized, 0)) * 1000) / 1000;
        results.push({
          id: `r-${results.length}`,
          type: 'split',
          matchLabel: `Split Transaction (1 bank → ${match.length} ledger entries)`,
          bankItems: [bt],
          ledgerItems: match,
          variance,
          dateDiff: Math.max(...match.map(lt => dateDiffDays(bt.date, lt.date))),
          status: 'review',
          explanation: 'Ledger recorded this as multiple entries while bank has a single transaction.',
          explanationType: 'split',
          resolved: false,
          manuallyLinked: false,
        });
      }
    }

    // ── PASS 5: Unmatched ─────────────────────────────────────────────────────
    bank.filter(t => !t._matched).forEach(bt => {
      results.push({
        id: `r-${results.length}`,
        type: 'unmatched',
        matchLabel: 'Unmatched',
        bankItems: [bt],
        ledgerItems: [],
        variance: bt.normalized,
        dateDiff: null,
        status: 'unmatched_bank',
        explanation: '',
        explanationType: '',
        resolved: false,
        manuallyLinked: false,
      });
    });

    ledger.filter(t => !t._matched).forEach(lt => {
      results.push({
        id: `r-${results.length}`,
        type: 'unmatched',
        matchLabel: 'Unmatched',
        bankItems: [],
        ledgerItems: [lt],
        variance: -lt.normalized,
        dateDiff: null,
        status: 'unmatched_ledger',
        explanation: '',
        explanationType: '',
        resolved: false,
        manuallyLinked: false,
      });
    });

    // Compute summary
    const summary = computeSummary(bank, ledger, results);

    return { results, summary, bankTxns: bank, ledgerTxns: ledger };
  }

  // Find a subset of items whose normalized sum ≈ target
  // Uses greedy approach for large sets, brute force for smaller pools
  // (larger pool/group size supports e.g. several days of cash receipts grouped into one bank deposit)
  function findSubsetSum(items, target, tol) {
    if (items.length === 0) return null;
    if (items.length > 12) {
      // Greedy: try to build sum greedily
      return greedySubset(items, target, tol);
    }
    // Brute force for small sets
    for (let size = 2; size <= Math.min(items.length, 6); size++) {
      const result = combinations(items, size).find(combo => {
        const sum = combo.reduce((s, t) => s + t.normalized, 0);
        return Math.abs(sum - target) <= tol;
      });
      if (result) return result;
    }
    return null;
  }

  function greedySubset(items, target, tol) {
    // Sort by normalized amount descending
    const sorted = [...items].sort((a, b) => Math.abs(b.normalized) - Math.abs(a.normalized));
    const selected = [];
    let remaining = target;
    for (const item of sorted) {
      if (Math.abs(item.normalized) <= Math.abs(remaining) + tol) {
        selected.push(item);
        remaining = Math.round((remaining - item.normalized) * 1000) / 1000;
        if (Math.abs(remaining) <= tol) break;
      }
    }
    if (Math.abs(remaining) <= tol && selected.length >= 2) return selected;
    return null;
  }

  function combinations(arr, k) {
    if (k === 1) return arr.map(x => [x]);
    const result = [];
    for (let i = 0; i <= arr.length - k; i++) {
      const rest = combinations(arr.slice(i + 1), k - 1);
      rest.forEach(combo => result.push([arr[i], ...combo]));
    }
    return result;
  }

  function computeSummary(bank, ledger, results) {
    const matched = results.filter(r => r.status === 'matched');
    const review = results.filter(r => r.status === 'review');
    const unmatchedBank = results.filter(r => r.status === 'unmatched_bank');
    const unmatchedLedger = results.filter(r => r.status === 'unmatched_ledger');

    // Bank balance: sum of all normalized (positive = credited to account, negative = debited)
    const bankTotal = bank.reduce((s, t) => s + t.normalized, 0);
    const ledgerTotal = ledger.reduce((s, t) => s + t.normalized, 0);

    // Unmatched adjustments
    const unmatchedBankAmt = unmatchedBank.reduce((s, r) => s + r.bankItems.reduce((a, t) => a + t.normalized, 0), 0);
    const unmatchedLedgerAmt = unmatchedLedger.reduce((s, r) => s + r.ledgerItems.reduce((a, t) => a + t.normalized, 0), 0);

    return {
      totalMatched: matched.length,
      totalReview: review.length,
      totalUnmatchedBank: unmatchedBank.length,
      totalUnmatchedLedger: unmatchedLedger.length,
      bankTotal: Math.round(bankTotal * 1000) / 1000,
      ledgerTotal: Math.round(ledgerTotal * 1000) / 1000,
      difference: Math.round((bankTotal - ledgerTotal) * 1000) / 1000,
      unmatchedBankAmt: Math.round(unmatchedBankAmt * 1000) / 1000,
      unmatchedLedgerAmt: Math.round(unmatchedLedgerAmt * 1000) / 1000,
    };
  }

  return { reconcile };
})();
