// parser.js — File parsing and column mapping

const Parser = (() => {

  // Parse an uploaded File object (CSV or XLSX) and return { headers, rows[] }
  async function parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      return parseCSV(await file.text());
    } else if (['xlsx', 'xls', 'ods'].includes(ext)) {
      return parseExcel(await file.arrayBuffer());
    } else {
      throw new Error('Unsupported file type. Please upload CSV or Excel (.xlsx) files.');
    }
  }

  function parseCSV(text) {
    // Handle BOM
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) throw new Error('File is empty');
    const headers = splitCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const vals = splitCSVLine(lines[i]);
      if (vals.every(v => v === '')) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = (vals[idx] || '').trim(); });
      rows.push(row);
    }
    return { headers, rows };
  }

  function splitCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i+1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  }

  function parseExcel(arrayBuffer) {
    const wb = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    if (data.length === 0) throw new Error('Excel file is empty');
    const headers = data[0].map(h => String(h).trim());
    const rows = [];
    for (let i = 1; i < data.length; i++) {
      const rowArr = data[i];
      if (rowArr.every(v => String(v).trim() === '')) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = String(rowArr[idx] || '').trim(); });
      rows.push(row);
    }
    return { headers, rows };
  }

  // Parse amount string: "1,234.500" → 1234.5
  function parseAmount(str) {
    if (!str && str !== 0) return 0;
    const cleaned = String(str).replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 1000) / 1000;
  }

  // Parse date from various formats → Date object or null
  function parseDate(str) {
    if (!str) return null;
    str = String(str).trim();
    // Try ISO
    let d = new Date(str);
    if (!isNaN(d.getTime())) {
      // Make sure time is noon to avoid timezone issues
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    // Try DD/MM/YYYY or DD-MM-YYYY
    const m1 = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (m1) {
      const [, dd, mm, yy] = m1;
      const year = yy.length === 2 ? 2000 + parseInt(yy) : parseInt(yy);
      return new Date(year, parseInt(mm) - 1, parseInt(dd));
    }
    // Try MM/DD/YYYY
    const m2 = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (m2) {
      const [, mm, dd, yyyy] = m2;
      return new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
    }
    return null;
  }

  // Convert mapped rows to Transaction objects
  // mapping = { date, description, debit, credit, chqNo, reference, amountMode }
  // amountMode: 'split' (separate debit/credit cols) or 'single' (one amount col, +/-)
  // source: 'bank' | 'ledger'
  function buildTransactions(rows, mapping, source) {
    const transactions = [];
    rows.forEach((row, idx) => {
      const date = parseDate(row[mapping.date]);
      if (!date) return; // skip rows without date

      let debit = 0, credit = 0;
      if (mapping.amountMode === 'single') {
        const amt = parseAmount(row[mapping.amount]);
        if (amt >= 0) credit = amt;
        else debit = Math.abs(amt);
      } else {
        debit = parseAmount(row[mapping.debit]);
        credit = parseAmount(row[mapping.credit]);
      }

      // Skip if both debit and credit are zero (header rows etc.)
      if (debit === 0 && credit === 0) return;

      const description = mapping.description ? (row[mapping.description] || '') : '';
      const chqNo = mapping.chqNo ? (row[mapping.chqNo] || '').replace(/\s/g, '') : '';
      const reference = mapping.reference ? (row[mapping.reference] || '') : '';

      // Normalize: for bank: positive = credit (money in), negative = debit (money out)
      //            for ledger: positive = debit (asset up / receipt), negative = credit (payment)
      // In both cases: normalized positive means receipt, normalized negative means payment
      // Bank: normalized = credit - debit
      // Ledger: normalized = debit - credit
      let normalized;
      if (source === 'bank') {
        normalized = Math.round((credit - debit) * 1000) / 1000;
      } else {
        normalized = Math.round((debit - credit) * 1000) / 1000;
      }

      transactions.push({
        id: `${source}-${idx}`,
        date,
        dateStr: formatDate(date),
        description,
        debit,
        credit,
        normalized,
        chqNo: chqNo || null,
        reference,
        source,
        rawRow: row,
      });
    });
    return transactions;
  }

  function formatDate(d) {
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  // Auto-detect column mapping based on common header names
  function autoDetectMapping(headers, source) {
    const h = headers.map(x => x.toLowerCase().replace(/\s+/g, '_'));
    const find = (...keys) => {
      for (const k of keys) {
        const idx = h.findIndex(x => x.includes(k));
        if (idx !== -1) return headers[idx];
      }
      return '';
    };
    return {
      date: find('date', 'txn_date', 'transaction_date', 'value_date', 'posting_date'),
      description: find('narration', 'description', 'particulars', 'detail', 'remarks', 'memo'),
      debit: find('debit', 'withdrawal', 'dr', 'paid', 'payment'),
      credit: find('credit', 'deposit', 'cr', 'receipt', 'received'),
      chqNo: find('chq', 'cheque', 'check', 'chq_no', 'cheque_no', 'chk'),
      reference: find('ref', 'reference', 'doc', 'voucher', 'vch'),
      amount: find('amount', 'amt'),
      amountMode: 'split',
    };
  }

  return { parseFile, buildTransactions, autoDetectMapping, parseAmount, parseDate, formatDate };
})();
