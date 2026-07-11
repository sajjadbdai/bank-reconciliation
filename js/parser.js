// parser.js — File parsing and column mapping

const Parser = (() => {

  // Parse an uploaded File object (CSV, XLSX, or PDF) and return { headers, rows[] }
  async function parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'csv') {
      return parseCSV(await file.text());
    } else if (['xlsx', 'xls', 'ods'].includes(ext)) {
      return parseExcel(await file.arrayBuffer());
    } else if (ext === 'pdf') {
      return parsePDF(await file.arrayBuffer());
    } else {
      throw new Error('Unsupported file type. Please upload CSV, Excel, or PDF files.');
    }
  }

  async function parsePDF(arrayBuffer) {
    if (typeof pdfjsLib === 'undefined') {
      throw new Error('PDF.js library is not loaded. Please check your internet connection.');
    }
    // Set worker
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
    
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    const allLines = [];

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const items = textContent.items;
      
      // Group text items by Y coordinate (vertical coordinate on page)
      const linesMap = {};
      items.forEach(item => {
        if (!item.str.trim()) return;
        // round to group items on same line (within 4 points tolerance)
        const y = Math.round(item.transform[5]);
        let foundY = Object.keys(linesMap).find(k => Math.abs(Number(k) - y) < 4);
        if (!foundY) {
          foundY = y;
          linesMap[foundY] = [];
        }
        linesMap[foundY].push(item);
      });

      // Sort vertical lines descending (top of page to bottom)
      const sortedYs = Object.keys(linesMap).map(Number).sort((a, b) => b - a);
      
      sortedYs.forEach(y => {
        // Sort items horizontally within the line (left to right)
        const lineItems = linesMap[y].sort((a, b) => a.transform[4] - b.transform[4]);
        // Join with multiple spaces to clearly delimit columns
        const lineText = lineItems.map(item => item.str.trim()).join('   ');
        allLines.push(lineText);
      });
    }

    // Now convert lines into structured tabular rows
    // We look for rows containing a date to identify transaction rows
    const dateRegex = /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b|\b\d{4}-\d{1,2}-\d{1,2}\b/;
    const txnLines = allLines.filter(line => dateRegex.test(line));

    if (txnLines.length === 0) {
      throw new Error('No transaction rows containing a date could be found in the PDF. Please check the PDF format.');
    }

    // Split each transaction line by 3 or more spaces
    const rowData = txnLines.map(line => {
      return line.split(/\s{3,}/).map(col => col.trim()).filter(col => col !== '');
    });

    // Find the max number of columns
    const maxCols = Math.max(...rowData.map(r => r.length));
    
    // Create headers: "Column 1", "Column 2", etc.
    const headers = [];
    for (let i = 1; i <= maxCols; i++) {
      headers.push(`Column ${i}`);
    }

    // Build row objects mapped to these headers
    const rows = rowData.map(cols => {
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = cols[idx] || '';
      });
      return row;
    });

    return { headers, rows };
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
    // raw:true preserves genuine Date objects for date cells (cellDates:true) instead of
    // reformatting them to text via the cell's stored Excel number-format code — that code
    // can be locale-ambiguous (e.g. m/d/yyyy) and would get silently misread as d/m/yyyy
    // by our parser downstream. We format dates ourselves (unambiguous dd/mm/yyyy) below.
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
    if (data.length === 0) throw new Error('Excel file is empty');
    const headers = data[0].map(h => cellToString(h).trim());
    const rows = [];
    for (let i = 1; i < data.length; i++) {
      const rowArr = data[i];
      if (rowArr.every(v => cellToString(v).trim() === '')) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = cellToString(rowArr[idx]).trim(); });
      rows.push(row);
    }
    return { headers, rows };
  }

  // Convert a raw SheetJS cell value to text. Date cells are formatted as DD/MM/YYYY
  // (this app's convention) instead of trusting the cell's original, possibly-ambiguous format.
  function cellToString(v) {
    if (v instanceof Date) return formatDate(v);
    if (v === undefined || v === null) return '';
    return String(v);
  }

  // Parse amount string: "1,234.500" → 1234.5
  function parseAmount(str) {
    if (!str && str !== 0) return 0;
    const cleaned = String(str).replace(/,/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : Math.round(num * 1000) / 1000;
  }

  // Parse date from various formats → Date object or null
  // This app always interprets ambiguous numeric dates as DD/MM/YYYY (never MM/DD/YYYY),
  // matching the dd/mm/yyyy format used throughout the app's inputs, display, and exports.
  function parseDate(str) {
    if (!str) return null;
    str = String(str).trim();
    if (!str) return null;

    // ISO format YYYY-MM-DD (unambiguous — always Year-Month-Day)
    const iso = str.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
    if (iso) {
      const [, yyyy, mm, dd] = iso;
      const d = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd));
      if (!isNaN(d.getTime())) return d;
    }

    // DD/MM/YYYY, DD-MM-YYYY or DD.MM.YYYY (this app's expected format)
    const dmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
    if (dmy) {
      const [, dd, mm, yy] = dmy;
      const year = yy.length === 2 ? 2000 + parseInt(yy) : parseInt(yy);
      const d = new Date(year, parseInt(mm) - 1, parseInt(dd));
      if (!isNaN(d.getTime())) return d;
    }

    // Fallback: let the browser parse other formats (e.g. "5 June 2026")
    const d = new Date(str);
    if (!isNaN(d.getTime())) {
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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
