// app.js — Main application controller and state management

const AppState = {
  bankRaw: null,      // { headers, rows }
  ledgerRaw: null,    // { headers, rows }
  bankMapping: null,
  ledgerMapping: null,
  bankTransactions: [],
  ledgerTransactions: [],
  reconciliationResult: null,
  dateTolerance: 7,
  splitTolerance: 15,
  isDirty: false,
  markDirty() { this.isDirty = true; },
};

// ─── Step Navigation ────────────────────────────────────────────────────────
function goToStep(step) {
  document.querySelectorAll('.step-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.steps-container .step').forEach((s, i) => {
    s.classList.toggle('active', i + 1 === step);
    s.classList.toggle('done', i + 1 < step);
  });
  const panel = document.getElementById(`step-${step}`);
  if (panel) {
    panel.classList.add('active');
    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

// ─── Step 1: File Upload ────────────────────────────────────────────────────
function initUpload() {
  ['bank', 'ledger'].forEach(side => {
    const zone = document.getElementById(`${side}-dropzone`);
    const input = document.getElementById(`${side}-file-input`);

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file) handleFileUpload(side, file);
    });
    zone.addEventListener('click', () => input.click());
    input.addEventListener('change', e => {
      if (e.target.files[0]) handleFileUpload(side, e.target.files[0]);
    });
  });

  document.getElementById('btn-next-to-step2').addEventListener('click', () => {
    if (!AppState.bankRaw || !AppState.ledgerRaw) {
      Report.showToast('Please upload both Bank Statement and Ledger files', 'warning');
      return;
    }
    buildColumnMappingUI();
    goToStep(2);
  });
}

async function handleFileUpload(side, file) {
  const zone = document.getElementById(`${side}-dropzone`);
  const label = document.getElementById(`${side}-file-label`);

  try {
    zone.classList.add('loading');
    label.textContent = `Loading ${file.name}...`;
    const parsed = await Parser.parseFile(file);
    if (side === 'bank') AppState.bankRaw = parsed;
    else AppState.ledgerRaw = parsed;

    zone.classList.remove('loading');
    zone.classList.add('uploaded');
    label.textContent = `✅ ${file.name} (${parsed.rows.length} rows)`;
    zone.querySelector('.drop-icon').textContent = '📄';
    Report.showToast(`${side === 'bank' ? 'Bank Statement' : 'Ledger'} loaded: ${parsed.rows.length} rows`, 'success');

    // Check if both uploaded
    if (AppState.bankRaw && AppState.ledgerRaw) {
      document.getElementById('btn-next-to-step2').classList.add('ready');
    }
  } catch (err) {
    zone.classList.remove('loading');
    label.textContent = `❌ Error: ${err.message}`;
    Report.showToast(err.message, 'error');
  }
}

// ─── Step 2: Column Mapping ─────────────────────────────────────────────────
function buildColumnMappingUI() {
  ['bank', 'ledger'].forEach(side => {
    const raw = side === 'bank' ? AppState.bankRaw : AppState.ledgerRaw;
    const autoMap = Parser.autoDetectMapping(raw.headers, side);
    renderMappingForm(side, raw.headers, autoMap);
    renderPreviewTable(side, raw);
  });

  document.getElementById('btn-back-to-step1').addEventListener('click', () => goToStep(1));
  document.getElementById('btn-next-to-step3').addEventListener('click', () => {
    if (collectMappings()) goToStep(3);
  });
}

function renderMappingForm(side, headers, autoMap) {
  const container = document.getElementById(`${side}-mapping-form`);
  const opts = ['', ...headers].map(h => `<option value="${h}">${h || '— Not mapped —'}</option>`).join('');

  const fields = [
    { key: 'date', label: '📅 Date Column', required: true },
    { key: 'description', label: '📝 Description / Narration', required: false },
    { key: 'debit', label: '💸 Debit Column (money out)', required: false },
    { key: 'credit', label: '💰 Credit Column (money in)', required: false },
    { key: 'amount', label: '💲 Single Amount Column (if no separate debit/credit)', required: false },
    { key: 'chqNo', label: '📋 Cheque Number', required: false },
    { key: 'reference', label: '🏷️ Reference / Doc No.', required: false },
  ];

  container.innerHTML = `
    <div class="mapping-grid">
      ${fields.map(f => `
        <div class="mapping-field">
          <label class="map-label">${f.label}${f.required ? ' <span class="req">*</span>' : ''}</label>
          <select class="map-select" data-side="${side}" data-key="${f.key}" id="map-${side}-${f.key}">
            ${opts}
          </select>
        </div>
      `).join('')}
      <div class="mapping-field">
        <label class="map-label">💱 Amount Mode</label>
        <select class="map-select" data-side="${side}" data-key="amountMode" id="map-${side}-amountMode">
          <option value="split">Separate Debit & Credit columns</option>
          <option value="single">Single Amount column (+/-)</option>
        </select>
      </div>
    </div>`;

  // Set auto-detected values
  Object.entries(autoMap).forEach(([key, val]) => {
    const sel = document.getElementById(`map-${side}-${key}`);
    if (sel && val) sel.value = val;
  });
}

function renderPreviewTable(side, raw) {
  const container = document.getElementById(`${side}-preview`);
  const previewRows = raw.rows.slice(0, 5);
  if (previewRows.length === 0) { container.innerHTML = '<p>No data rows found.</p>'; return; }

  container.innerHTML = `
    <div class="preview-scroll">
      <table class="preview-table">
        <thead><tr>${raw.headers.map(h => `<th>${Report.escHtml(h)}</th>`).join('')}</tr></thead>
        <tbody>${previewRows.map(row =>
          `<tr>${raw.headers.map(h => `<td>${Report.escHtml(row[h] || '')}</td>`).join('')}</tr>`
        ).join('')}</tbody>
      </table>
    </div>
    <p class="preview-note">Showing first ${previewRows.length} of ${raw.rows.length} rows</p>`;
}

function collectMappings() {
  for (const side of ['bank', 'ledger']) {
    const mapping = {};
    document.querySelectorAll(`[data-side="${side}"].map-select`).forEach(sel => {
      mapping[sel.dataset.key] = sel.value;
    });

    if (!mapping.date) {
      Report.showToast(`Please map the Date column for ${side === 'bank' ? 'Bank Statement' : 'Ledger'}`, 'warning');
      return false;
    }

    const hasDebitCredit = mapping.debit || mapping.credit;
    const hasSingleAmt = mapping.amount;
    if (!hasDebitCredit && !hasSingleAmt) {
      Report.showToast(`Please map at least one amount column for ${side === 'bank' ? 'Bank Statement' : 'Ledger'}`, 'warning');
      return false;
    }

    if (side === 'bank') AppState.bankMapping = mapping;
    else AppState.ledgerMapping = mapping;
  }
  return true;
}

// ─── Step 3: Settings & Reconcile ──────────────────────────────────────────
function initStep3() {
  document.getElementById('btn-back-to-step2').addEventListener('click', () => goToStep(2));
  document.getElementById('date-tolerance').addEventListener('change', e => {
    const n = parseInt(e.target.value);
    AppState.dateTolerance = Number.isNaN(n) ? 7 : n;
  });
  document.getElementById('split-tolerance').addEventListener('change', e => {
    const n = parseInt(e.target.value);
    AppState.splitTolerance = Number.isNaN(n) ? 15 : n;
  });
  document.getElementById('btn-run-reconcile').addEventListener('click', runReconciliation);
}

function runReconciliation() {
  try {
    const btn = document.getElementById('btn-run-reconcile');
    btn.textContent = '⏳ Processing...';
    btn.disabled = true;

    // Build transactions
    AppState.bankTransactions = Parser.buildTransactions(
      AppState.bankRaw.rows, AppState.bankMapping, 'bank'
    );
    AppState.ledgerTransactions = Parser.buildTransactions(
      AppState.ledgerRaw.rows, AppState.ledgerMapping, 'ledger'
    );

    if (AppState.bankTransactions.length === 0) {
      throw new Error('No valid bank transactions found. Please check column mapping.');
    }
    if (AppState.ledgerTransactions.length === 0) {
      throw new Error('No valid ledger transactions found. Please check column mapping.');
    }

    // Run engine
    setTimeout(() => {
      try {
        AppState.reconciliationResult = Engine.reconcile(
          AppState.bankTransactions,
          AppState.ledgerTransactions,
          { dateTolerance: AppState.dateTolerance, splitTolerance: AppState.splitTolerance }
        );

        // Render report
        Report.render(AppState.reconciliationResult);
        goToStep(4);
        btn.textContent = '▶ Run Reconciliation';
        btn.disabled = false;
        Report.showToast(`Reconciliation complete! Processed ${AppState.bankTransactions.length} bank + ${AppState.ledgerTransactions.length} ledger transactions`, 'success');
      } catch (err) {
        btn.textContent = '▶ Run Reconciliation';
        btn.disabled = false;
        Report.showToast('Error: ' + err.message, 'error');
        console.error(err);
      }
    }, 50);
  } catch (err) {
    Report.showToast('Error: ' + err.message, 'error');
    console.error(err);
  }
}

// ─── Step 4: Report ─────────────────────────────────────────────────────────
function initStep4() {
  document.getElementById('btn-back-to-step3').addEventListener('click', () => goToStep(3));

  // Tab switching
  document.querySelectorAll('.report-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      document.querySelectorAll('.report-tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`tab-content-${target}`).classList.add('active');
    });
  });

  // Export buttons
  document.getElementById('btn-export-pdf').addEventListener('click', () => {
    if (AppState.reconciliationResult) Exporter.exportPDF(AppState.reconciliationResult);
  });
  document.getElementById('btn-export-csv').addEventListener('click', () => {
    if (AppState.reconciliationResult) Exporter.exportCSV(AppState.reconciliationResult);
  });

  // Re-run button
  document.getElementById('btn-rerun').addEventListener('click', () => goToStep(1));
}

// ─── Init ───────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  goToStep(1);
  initUpload();
  initStep3();
  initStep4();
  const footerYear = document.getElementById('footer-year');
  if (footerYear) footerYear.textContent = new Date().getFullYear();
  console.log('Bank Reconciliation App initialized');
});
