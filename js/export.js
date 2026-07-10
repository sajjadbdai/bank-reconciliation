// export.js — PDF and CSV export

const Exporter = (() => {

  function fmtAmt(n) {
    return Math.abs(n).toLocaleString('en-BH', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  function fmtDate(d) {
    if (!d) return '';
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    return `${dd}/${mm}/${d.getFullYear()}`;
  }

  // ─── PDF Export ────────────────────────────────────────────────────────────
  function exportPDF(reconciliationResult) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const { results, summary } = reconciliationResult;

    const now = new Date();
    const dateStr = `${String(now.getDate()).padStart(2,'0')}/${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`;

    // Header
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 297, 25, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Bank Reconciliation Report', 14, 12);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${dateStr}`, 14, 19);

    let y = 32;

    // Summary
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, y);
    y += 6;

    doc.autoTable({
      startY: y,
      head: [['Category', 'Count', 'Amount (BHD)']],
      body: [
        ['✅ Matched', summary.totalMatched, '—'],
        ['⚠️ Needs Review', summary.totalReview, '—'],
        ['❌ Unmatched Bank', summary.totalUnmatchedBank, fmtAmt(summary.unmatchedBankAmt)],
        ['❌ Unmatched Ledger', summary.totalUnmatchedLedger, fmtAmt(summary.unmatchedLedgerAmt)],
        ['Net Difference', '—', fmtAmt(summary.difference)],
      ],
      theme: 'striped',
      headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255] },
      columnStyles: { 0: { cellWidth: 80 }, 1: { cellWidth: 30, halign: 'center' }, 2: { cellWidth: 50, halign: 'right' } },
      margin: { left: 14 },
      styles: { fontSize: 9 },
    });

    y = doc.lastAutoTable.finalY + 10;

    // Sections
    const sections = [
      { label: '✅ Matched Transactions', status: 'matched', color: [22, 163, 74] },
      { label: '⚠️ Needs Review', status: 'review', color: [217, 119, 6] },
      { label: '❌ Unmatched — Bank Statement Only', status: 'unmatched_bank', color: [220, 38, 38] },
      { label: '❌ Unmatched — Ledger Only', status: 'unmatched_ledger', color: [220, 38, 38] },
    ];

    for (const section of sections) {
      const items = results.filter(r => r.status === section.status);
      if (items.length === 0) continue;

      // Check page space
      if (y > 170) { doc.addPage(); y = 15; }

      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(...section.color);
      doc.text(section.label, 14, y);
      y += 5;

      const rows = [];
      items.forEach(r => {
        r.bankItems.forEach(bt => {
          rows.push([
            'Bank', fmtDate(bt.date), bt.description, bt.chqNo || '', 
            bt.debit > 0 ? fmtAmt(bt.debit) : '',
            bt.credit > 0 ? fmtAmt(bt.credit) : '',
            r.matchLabel, r.explanation || '', r.explanationType || '',
          ]);
        });
        r.ledgerItems.forEach(lt => {
          rows.push([
            'Ledger', fmtDate(lt.date), lt.description, lt.chqNo || '',
            lt.debit > 0 ? fmtAmt(lt.debit) : '',
            lt.credit > 0 ? fmtAmt(lt.credit) : '',
            r.matchLabel, r.explanation || '', r.explanationType || '',
          ]);
        });
        if (rows.length > 0) rows.push(new Array(9).fill(''));
      });

      if (rows.length === 0) continue;

      doc.autoTable({
        startY: y,
        head: [['Source', 'Date', 'Description', 'CHQ#', 'Debit', 'Credit', 'Match Type', 'Explanation', 'Reason']],
        body: rows,
        theme: 'grid',
        headStyles: { fillColor: section.color, textColor: [255, 255, 255], fontSize: 8 },
        styles: { fontSize: 7.5, cellPadding: 1.5 },
        columnStyles: {
          0: { cellWidth: 15 },
          1: { cellWidth: 20 },
          2: { cellWidth: 65 },
          3: { cellWidth: 18 },
          4: { cellWidth: 22, halign: 'right' },
          5: { cellWidth: 22, halign: 'right' },
          6: { cellWidth: 28 },
          7: { cellWidth: 45 },
          8: { cellWidth: 28 },
        },
        margin: { left: 14, right: 14 },
        pageBreak: 'auto',
      });

      y = doc.lastAutoTable.finalY + 8;
    }

    // Reconciliation Statement
    if (y > 160) { doc.addPage(); y = 15; }
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Reconciliation Statement', 14, y);
    y += 5;

    doc.autoTable({
      startY: y,
      body: [
        ['Bank Statement Net Movement', `${fmtAmt(summary.bankTotal)} BHD`],
        ['Ledger Net Movement', `${fmtAmt(summary.ledgerTotal)} BHD`],
        ['Unmatched Bank Items', `${fmtAmt(summary.unmatchedBankAmt)} BHD`],
        ['Unmatched Ledger Items', `${fmtAmt(summary.unmatchedLedgerAmt)} BHD`],
        ['Net Difference', `${fmtAmt(summary.difference)} BHD`],
        [Math.abs(summary.difference) < 0.005 ? '✅ RECONCILED' : '❌ NOT RECONCILED', ''],
      ],
      theme: 'striped',
      styles: { fontSize: 9 },
      columnStyles: { 0: { cellWidth: 90 }, 1: { halign: 'right', cellWidth: 50 } },
      margin: { left: 14 },
    });

    doc.save(`bank_reconciliation_${dateStr.replace(/\//g, '-')}.pdf`);
    Report.showToast('PDF exported successfully!', 'success');
  }

  // ─── CSV Export ────────────────────────────────────────────────────────────
  function exportCSV(reconciliationResult) {
    const { results } = reconciliationResult;
    const rows = [
      ['Source', 'Date', 'Description', 'CHQ Number', 'Debit (BHD)', 'Credit (BHD)', 'Match Status', 'Match Type', 'Date Difference (Days)', 'Variance (BHD)', 'Explanation Type', 'Notes', 'Resolved']
    ];

    results.forEach(r => {
      const addRow = (t, source) => {
        rows.push([
          source,
          fmtDate(t.date),
          t.description,
          t.chqNo || '',
          t.debit > 0 ? t.debit.toFixed(3) : '',
          t.credit > 0 ? t.credit.toFixed(3) : '',
          r.status,
          r.matchLabel,
          r.dateDiff !== null ? r.dateDiff : '',
          r.variance !== 0 ? r.variance.toFixed(3) : '',
          r.explanationType,
          r.explanation,
          r.resolved ? 'Yes' : 'No',
        ]);
      };
      r.bankItems.forEach(t => addRow(t, 'Bank'));
      r.ledgerItems.forEach(t => addRow(t, 'Ledger'));
    });

    const csv = rows.map(r =>
      r.map(cell => {
        const s = String(cell || '');
        return s.includes(',') || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"`
          : s;
      }).join(',')
    ).join('\r\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    a.download = `bank_reconciliation_${dateStr}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    Report.showToast('CSV exported successfully!', 'success');
  }

  return { exportPDF, exportCSV };
})();
