// report.js — Report rendering, explanations, manual linking

const Report = (() => {

  const EXPLANATION_TYPES = [
    { value: '', label: '— Select reason —' },
    { value: 'outstanding_chq', label: '📋 Outstanding Cheque (issued but not deposited yet)' },
    { value: 'timing', label: '📅 Timing Difference (different period)' },
    { value: 'bank_charge', label: '🏦 Bank Charge (not yet recorded in ledger)' },
    { value: 'split', label: '✂️ Split Transaction (bank charges included)' },
    { value: 'deposit_transit', label: '🚚 Deposit in Transit (recorded but not yet cleared)' },
    { value: 'data_error', label: '⚠️ Data Entry Error' },
    { value: 'duplicate', label: '🔁 Duplicate Entry' },
    { value: 'already_cleared', label: '✅ Will appear / clear next period' },
    { value: 'journal_needed', label: '📝 Journal Entry Needed' },
    { value: 'other', label: '💬 Other (see notes)' },
  ];

  let _reconciliationResult = null;
  let _manualLinkSource = null; // { resultId, side }

  function render(reconciliationResult) {
    _reconciliationResult = reconciliationResult;
    _manualLinkSource = null;
    const { results, summary } = reconciliationResult;

    renderSummaryCards(summary);
    renderTabCounts(summary);
    renderAllTabs(results);
    renderReconciliationStatement(summary, results);

    // Show report section
    document.getElementById('report-section').classList.remove('hidden');
    document.getElementById('report-section').scrollIntoView({ behavior: 'smooth' });
  }

  function renderSummaryCards(summary) {
    document.getElementById('card-matched').querySelector('.card-count').textContent = summary.totalMatched;
    document.getElementById('card-review').querySelector('.card-count').textContent = summary.totalReview;
    document.getElementById('card-unmatched-bank').querySelector('.card-count').textContent = summary.totalUnmatchedBank;
    document.getElementById('card-unmatched-ledger').querySelector('.card-count').textContent = summary.totalUnmatchedLedger;

    const total = summary.totalMatched + summary.totalReview + summary.totalUnmatchedBank + summary.totalUnmatchedLedger;
    const pct = total > 0 ? Math.round((summary.totalMatched / total) * 100) : 0;
    document.getElementById('match-percent').textContent = `${pct}%`;
    document.getElementById('match-bar-fill').style.width = `${pct}%`;
  }

  function renderTabCounts(summary) {
    document.getElementById('tab-matched-count').textContent = summary.totalMatched;
    document.getElementById('tab-review-count').textContent = summary.totalReview;
    document.getElementById('tab-bank-count').textContent = summary.totalUnmatchedBank;
    document.getElementById('tab-ledger-count').textContent = summary.totalUnmatchedLedger;
  }

  function renderAllTabs(results) {
    renderTab('tab-content-matched', results.filter(r => r.status === 'matched'), 'matched');
    renderTab('tab-content-review', results.filter(r => r.status === 'review'), 'review');
    renderTab('tab-content-bank', results.filter(r => r.status === 'unmatched_bank'), 'unmatched_bank');
    renderTab('tab-content-ledger', results.filter(r => r.status === 'unmatched_ledger'), 'unmatched_ledger');
  }

  function renderTab(containerId, items, tabType) {
    const container = document.getElementById(containerId);
    if (items.length === 0) {
      container.innerHTML = `<div class="empty-state">
        <div class="empty-icon">✅</div>
        <div class="empty-msg">No items in this category</div>
      </div>`;
      return;
    }
    container.innerHTML = items.map(r => renderResultCard(r, tabType)).join('');
    // Attach event listeners
    container.querySelectorAll('.explanation-type-select').forEach(sel => {
      sel.addEventListener('change', onExplTypeChange);
    });
    container.querySelectorAll('.explanation-notes').forEach(ta => {
      ta.addEventListener('input', onNotesInput);
    });
    container.querySelectorAll('.resolve-btn').forEach(btn => {
      btn.addEventListener('click', onResolve);
    });
    container.querySelectorAll('.manual-link-btn').forEach(btn => {
      btn.addEventListener('click', onManualLinkClick);
    });
    container.querySelectorAll('.unmatch-btn').forEach(btn => {
      btn.addEventListener('click', onUnmatch);
    });
  }

  function renderResultCard(r, tabType) {
    const statusClass = {
      matched: 'status-matched',
      review: 'status-review',
      unmatched_bank: 'status-unmatched',
      unmatched_ledger: 'status-unmatched',
    }[r.status] || '';

    const resolvedClass = r.resolved ? 'card-resolved' : '';
    const bankRows = r.bankItems.map(t => renderTxnRow(t, 'bank')).join('');
    const ledgerRows = r.ledgerItems.map(t => renderTxnRow(t, 'ledger')).join('');
    const showExplain = r.status !== 'matched';

    const varianceHTML = r.variance !== 0
      ? `<span class="variance-badge">Variance: ${fmtAmt(Math.abs(r.variance))} BHD</span>`
      : '';
    const dateDiffHTML = r.dateDiff !== null && r.dateDiff > 0
      ? `<span class="date-diff-badge">${r.dateDiff} day${r.dateDiff !== 1 ? 's' : ''} apart</span>`
      : '';

    const manualLinkBtn = (r.status === 'unmatched_bank' || r.status === 'unmatched_ledger')
      ? `<button class="manual-link-btn btn-icon" data-result-id="${r.id}" title="Manually link to another item">🔗 Link</button>`
      : '';

    const unmatchBtn = (r.status === 'matched' || r.status === 'review')
      ? `<button class="unmatch-btn btn-icon" data-result-id="${r.id}" title="Unmatch this pair">🔓 Unmatch</button>`
      : '';

    return `
    <div class="result-card ${statusClass} ${resolvedClass}" id="card-${r.id}" data-result-id="${r.id}">
      <div class="card-header">
        <div class="card-header-left">
          <span class="match-type-badge ${r.type}">${r.matchLabel}</span>
          ${varianceHTML}${dateDiffHTML}
          ${r.resolved ? '<span class="resolved-badge">✅ Resolved</span>' : ''}
        </div>
        <div class="card-header-right">
          ${manualLinkBtn}
          ${unmatchBtn}
        </div>
      </div>
      <div class="card-body">
        <div class="txn-columns">
          <div class="txn-col bank-col">
            <div class="col-label">🏦 Bank Statement</div>
            ${bankRows || '<div class="empty-col">— No bank entry —</div>'}
          </div>
          <div class="txn-col-divider">
            ${r.status === 'matched' ? '✅' : r.status === 'review' ? '⚠️' : '❌'}
          </div>
          <div class="txn-col ledger-col">
            <div class="col-label">📒 Ledger</div>
            ${ledgerRows || '<div class="empty-col">— No ledger entry —</div>'}
          </div>
        </div>
        ${showExplain ? renderExplanationPanel(r) : ''}
      </div>
    </div>`;
  }

  function renderTxnRow(t, side) {
    const amtClass = t.normalized >= 0 ? 'amt-positive' : 'amt-negative';
    const debitCreditLabel = side === 'bank'
      ? (t.debit > 0 ? `<span class="dr-badge">DR ${fmtAmt(t.debit)}</span>` : `<span class="cr-badge">CR ${fmtAmt(t.credit)}</span>`)
      : (t.debit > 0 ? `<span class="dr-badge">DR ${fmtAmt(t.debit)}</span>` : `<span class="cr-badge">CR ${fmtAmt(t.credit)}</span>`);

    const chqBadge = t.chqNo ? `<span class="chq-badge">CHQ# ${t.chqNo}</span>` : '';
    const ref = t.reference ? `<span class="ref-text">${escHtml(t.reference)}</span>` : '';

    return `<div class="txn-row">
      <div class="txn-date">${t.dateStr}</div>
      <div class="txn-desc">${escHtml(t.description)} ${chqBadge} ${ref}</div>
      <div class="txn-amount ${amtClass}">${debitCreditLabel}</div>
    </div>`;
  }

  function renderExplanationPanel(r) {
    const opts = EXPLANATION_TYPES.map(o =>
      `<option value="${o.value}" ${r.explanationType === o.value ? 'selected' : ''}>${escHtml(o.label)}</option>`
    ).join('');

    return `
    <div class="explanation-panel">
      <div class="explain-row">
        <label class="explain-label">📝 Reason / Explanation</label>
        <select class="explanation-type-select" data-result-id="${r.id}">
          ${opts}
        </select>
      </div>
      <div class="explain-row">
        <label class="explain-label">💬 Notes</label>
        <textarea class="explanation-notes" data-result-id="${r.id}" rows="2" placeholder="Add clarification notes...">${escHtml(r.explanation)}</textarea>
      </div>
      <div class="explain-actions">
        <button class="resolve-btn btn-success" data-result-id="${r.id}" ${r.resolved ? 'disabled' : ''}>
          ${r.resolved ? '✅ Resolved' : '✅ Mark as Resolved'}
        </button>
      </div>
    </div>`;
  }

  function renderReconciliationStatement(summary, results) {
    const resolvedUnmatchedBank = results.filter(r => r.status === 'unmatched_bank' && r.resolved);
    const resolvedUnmatchedLedger = results.filter(r => r.status === 'unmatched_ledger' && r.resolved);

    const resolvedBankAmt = resolvedUnmatchedBank.reduce((s, r) => s + r.bankItems.reduce((a, t) => a + t.normalized, 0), 0);
    const resolvedLedgerAmt = resolvedUnmatchedLedger.reduce((s, r) => s + r.ledgerItems.reduce((a, t) => a + t.normalized, 0), 0);

    const isBalanced = Math.abs(summary.difference) < 0.005;

    const html = `
    <div class="reconciliation-statement">
      <h3 class="stmt-title">📊 Reconciliation Statement</h3>
      <table class="stmt-table">
        <tbody>
          <tr class="stmt-section-header"><td colspan="2">Bank Statement Net Movement</td></tr>
          <tr><td>Total Net (Bank)</td><td class="${summary.bankTotal >= 0 ? 'amt-positive' : 'amt-negative'}">${fmtAmt(summary.bankTotal)} BHD</td></tr>
          <tr class="stmt-section-header"><td colspan="2">Ledger Net Movement</td></tr>
          <tr><td>Total Net (Ledger)</td><td class="${summary.ledgerTotal >= 0 ? 'amt-positive' : 'amt-negative'}">${fmtAmt(summary.ledgerTotal)} BHD</td></tr>
          <tr class="stmt-section-header"><td colspan="2">Unmatched Items</td></tr>
          <tr><td>Unmatched Bank Entries</td><td class="amt-negative">${fmtAmt(summary.unmatchedBankAmt)} BHD (${summary.totalUnmatchedBank} items)</td></tr>
          <tr><td>Unmatched Ledger Entries</td><td class="amt-positive">${fmtAmt(summary.unmatchedLedgerAmt)} BHD (${summary.totalUnmatchedLedger} items)</td></tr>
          <tr class="stmt-total-row">
            <td><strong>Net Difference</strong></td>
            <td class="${Math.abs(summary.difference) < 0.005 ? 'diff-zero' : 'diff-nonzero'}">
              <strong>${fmtAmt(Math.abs(summary.difference))} BHD</strong>
            </td>
          </tr>
          <tr class="stmt-balance-row">
            <td colspan="2" class="balance-status ${isBalanced ? 'balanced' : 'unbalanced'}">
              ${isBalanced
                ? '✅ Reconciliation Balanced — Bank and Ledger net movements agree!'
                : `❌ Not Balanced — Difference of ${fmtAmt(Math.abs(summary.difference))} BHD needs investigation`}
            </td>
          </tr>
        </tbody>
      </table>
    </div>`;

    document.getElementById('reconciliation-statement').innerHTML = html;
  }

  // ─── Event Handlers ────────────────────────────────────────────────────────

  function onExplTypeChange(e) {
    const resultId = e.target.dataset.resultId;
    const result = findResult(resultId);
    if (result) {
      result.explanationType = e.target.value;
      AppState.markDirty();
    }
  }

  function onNotesInput(e) {
    const resultId = e.target.dataset.resultId;
    const result = findResult(resultId);
    if (result) {
      result.explanation = e.target.value;
      AppState.markDirty();
    }
  }

  function onResolve(e) {
    const resultId = e.target.dataset.resultId;
    const result = findResult(resultId);
    if (result && result.explanationType) {
      result.resolved = true;
      e.target.textContent = '✅ Resolved';
      e.target.disabled = true;
      const card = document.getElementById(`card-${resultId}`);
      if (card) {
        card.classList.add('card-resolved');
        const existingBadge = card.querySelector('.resolved-badge');
        if (!existingBadge) {
          const headerLeft = card.querySelector('.card-header-left');
          const badge = document.createElement('span');
          badge.className = 'resolved-badge';
          badge.textContent = '✅ Resolved';
          headerLeft.appendChild(badge);
        }
      }
      // Update summary statement
      renderReconciliationStatement(_reconciliationResult.summary, _reconciliationResult.results);
      AppState.markDirty();
    } else {
      showToast('Please select a reason before resolving', 'warning');
    }
  }

  function onManualLinkClick(e) {
    const resultId = e.target.dataset.resultId;
    const result = findResult(resultId);
    if (!result) return;

    if (_manualLinkSource) {
      // Second click — try to link
      if (_manualLinkSource.resultId === resultId) {
        // Cancel selection
        _manualLinkSource = null;
        document.querySelectorAll('.manual-link-btn.linking').forEach(b => b.classList.remove('linking'));
        showToast('Link cancelled', 'info');
        return;
      }
      // Link the two items
      manuallyLink(_manualLinkSource.resultId, resultId);
      _manualLinkSource = null;
      document.querySelectorAll('.manual-link-btn.linking').forEach(b => b.classList.remove('linking'));
    } else {
      // First click — select source
      _manualLinkSource = { resultId };
      e.target.classList.add('linking');
      showToast('Now click another item to link them together', 'info');
    }
  }

  function manuallyLink(id1, id2) {
    const r1 = findResult(id1);
    const r2 = findResult(id2);
    if (!r1 || !r2) return;

    // Merge into one review result
    const merged = {
      id: r1.id,
      type: 'manual',
      matchLabel: '🔗 Manually Linked',
      bankItems: [...r1.bankItems, ...r2.bankItems],
      ledgerItems: [...r1.ledgerItems, ...r2.ledgerItems],
      variance: 0,
      dateDiff: null,
      status: 'review',
      explanation: '',
      explanationType: '',
      resolved: false,
      manuallyLinked: true,
    };

    // Compute variance
    const bankSum = merged.bankItems.reduce((s, t) => s + t.normalized, 0);
    const ledgerSum = merged.ledgerItems.reduce((s, t) => s + t.normalized, 0);
    merged.variance = Math.round((bankSum - ledgerSum) * 1000) / 1000;
    merged.dateDiff = merged.bankItems.length && merged.ledgerItems.length
      ? Math.max(...merged.bankItems.flatMap(b => merged.ledgerItems.map(l => Math.abs((b.date - l.date) / 86400000))))
      : null;

    // Replace r1 and remove r2
    const idx1 = _reconciliationResult.results.findIndex(r => r.id === id1);
    const idx2 = _reconciliationResult.results.findIndex(r => r.id === id2);
    if (idx1 !== -1) _reconciliationResult.results[idx1] = merged;
    if (idx2 !== -1) _reconciliationResult.results.splice(idx2, 1);

    // Recompute summary
    _reconciliationResult.summary = recomputeSummary(_reconciliationResult.results);

    // Re-render
    renderSummaryCards(_reconciliationResult.summary);
    renderTabCounts(_reconciliationResult.summary);
    renderAllTabs(_reconciliationResult.results);
    renderReconciliationStatement(_reconciliationResult.summary, _reconciliationResult.results);
    showToast('Items linked successfully!', 'success');
  }

  function onUnmatch(e) {
    const resultId = e.target.dataset.resultId;
    const result = findResult(resultId);
    if (!result) return;

    // Split back into individual unmatched items
    const idx = _reconciliationResult.results.findIndex(r => r.id === resultId);
    if (idx === -1) return;

    const newItems = [];
    result.bankItems.forEach((bt, i) => {
      newItems.push({
        id: `${resultId}-u${i}`,
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
    result.ledgerItems.forEach((lt, i) => {
      newItems.push({
        id: `${resultId}-u${result.bankItems.length + i}`,
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

    _reconciliationResult.results.splice(idx, 1, ...newItems);
    _reconciliationResult.summary = recomputeSummary(_reconciliationResult.results);

    renderSummaryCards(_reconciliationResult.summary);
    renderTabCounts(_reconciliationResult.summary);
    renderAllTabs(_reconciliationResult.results);
    renderReconciliationStatement(_reconciliationResult.summary, _reconciliationResult.results);
    showToast('Items unmatched', 'info');
  }

  function recomputeSummary(results) {
    return {
      totalMatched: results.filter(r => r.status === 'matched').length,
      totalReview: results.filter(r => r.status === 'review').length,
      totalUnmatchedBank: results.filter(r => r.status === 'unmatched_bank').length,
      totalUnmatchedLedger: results.filter(r => r.status === 'unmatched_ledger').length,
      bankTotal: _reconciliationResult.summary.bankTotal,
      ledgerTotal: _reconciliationResult.summary.ledgerTotal,
      difference: _reconciliationResult.summary.difference,
      unmatchedBankAmt: results.filter(r => r.status === 'unmatched_bank')
        .reduce((s, r) => s + r.bankItems.reduce((a, t) => a + t.normalized, 0), 0),
      unmatchedLedgerAmt: results.filter(r => r.status === 'unmatched_ledger')
        .reduce((s, r) => s + r.ledgerItems.reduce((a, t) => a + t.normalized, 0), 0),
    };
  }

  function findResult(id) {
    return _reconciliationResult?.results.find(r => r.id === id);
  }

  function getResult() {
    return _reconciliationResult;
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────
  function fmtAmt(n) {
    return Math.abs(n).toLocaleString('en-BH', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(msg, type = 'info') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.className = `toast toast-${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3000);
  }

  return { render, getResult, showToast, fmtAmt, escHtml };
})();
