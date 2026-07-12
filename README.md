# Bank Reconciliation Pro 🏦

A professional, fully client-side **Bank Reconciliation Automation** web application. Upload your bank statement and ledger, automatically match transactions, identify mismatches, and generate detailed reports with PDF/CSV export.

**🔒 Privacy First** — All data is processed locally in your browser. Nothing is sent to any server.

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📁 **File Upload** | CSV and Excel (.xlsx) support with drag-and-drop |
| 🗺️ **Column Mapping** | Auto-detects columns, manual override available |
| 🏷️ **Cheque Matching** | Matches by cheque number + amount (highest priority) |
| 📅 **Exact Matching** | Same amount + same date (±1 day processing window) |
| ⏱️ **Timing Differences** | Outstanding cheques, late deposits (configurable tolerance) |
| ✂️ **Split Transactions** | Bank charges: 100.000 + 0.110 matched to ledger 100.110 |
| 💬 **Explanations** | Dropdown + notes for every unmatched/review item |
| 🔗 **Manual Linking** | Manually link any bank entry to any ledger entry |
| 📊 **Reconciliation Statement** | Final balance check showing reconciled position |
| 📄 **PDF Export** | Professional landscape PDF with all sections |
| 📊 **CSV Export** | Full data export with explanations for further analysis |

---

## 🚀 Live Demo

**[→ Open App on GitHub Pages](https://YOUR_USERNAME.github.io/bank-reconciliation/)**

---

## 📋 How to Use

### Step 1 — Upload Files
- Upload your **Bank Statement** (CSV or Excel)
- Upload your **Ledger / Cashbook** (CSV or Excel)

### Step 2 — Map Columns
The app auto-detects column names. Verify and adjust:
- **Date** column (required)
- **Debit** and **Credit** columns (or single Amount column)
- **Cheque Number** column (optional but recommended)
- **Description/Narration** and **Reference** (optional)

### Step 3 — Configure & Run
- Set **Date Tolerance** (default: 7 days) for timing difference matching
- Click **Run Reconciliation**

### Step 4 — Review & Export
- **✅ Matched** tab: fully reconciled transaction pairs
- **⚠️ Needs Review** tab: timing differences, split transactions, cheque matches with variance
- **🏦 Unmatched Bank** tab: entries only in bank (e.g., bank charges not yet in ledger)
- **📒 Unmatched Ledger** tab: entries only in ledger (e.g., outstanding cheques not yet cleared)

For each unmatched/review item:
1. Select a **reason** from the dropdown (Outstanding Cheque, Bank Charge, Timing Difference, etc.)
2. Add **notes** for clarification
3. Click **Mark as Resolved**

Export the final report as **PDF** or **CSV**.

---

## 🔢 Sign Convention

| Bank Statement | Your Ledger |
|---|---|
| **Debit** (money out of bank) | **Credit** in your books |
| **Credit** (money into bank) | **Debit** in your books |

---

## 📁 File Format Requirements

### Bank Statement (CSV/Excel)
```
Date,Narration,Debit,Credit,Cheque No,Balance
30/06/2026,Transfer to Supplier XYZ,,5000.000,,
30/06/2026,Bank Charges,12.500,,,
01/07/2026,Cheque No 001234,500.000,,,CHQ001234
```

### Ledger / Cashbook (CSV/Excel)
```
Date,Particulars,Debit,Credit,Cheque No,Voucher
30/06/2026,Supplier XYZ Payment,,5000.000,,VCH001
30/06/2026,Supplier ABC Cheque,,300.000,CHQ001234,VCH002
```

---

## 🚀 Deploy to GitHub Pages

### Step 1 — Create a GitHub Repository
1. Go to [github.com/new](https://github.com/new)
2. Name it `bank-reconciliation`
3. Set to **Public**
4. Click **Create repository**

### Step 2 — Upload Files
**Option A — GitHub Web UI (simplest):**
1. Click **"uploading an existing file"** on the new repo page
2. Drag all files maintaining folder structure:
   ```
   index.html
   css/style.css
   js/parser.js
   js/engine.js
   js/report.js
   js/export.js
   js/app.js
   README.md
   ```
3. Click **Commit changes**

**Option B — Git CLI:**
```bash
cd bank-reconciliation
git init
git add .
git commit -m "Initial commit: Bank Reconciliation Pro"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/bank-reconciliation.git
git push -u origin main
```

### Step 3 — Enable GitHub Pages
1. Go to your repository → **Settings** → **Pages**
2. Under **Source**, select **Deploy from a branch**
3. Branch: **main**, Folder: **/ (root)**
4. Click **Save**
5. Your app will be live at: `https://YOUR_USERNAME.github.io/bank-reconciliation/`

*(GitHub Pages deployment usually takes 1–2 minutes)*

---

## 🖥️ Desktop App (Windows, no installation)

The same app can be packaged as a standalone Windows `.exe` — no installer, no admin rights, no separate browser or runtime needed on the target machine. It's an [Electron](https://www.electronjs.org/) shell that just loads the existing `index.html`/`css`/`js` unchanged, so it always matches the web version.

**Build it yourself:**
```bash
npm install
npm run build:win
```
The portable executable is written to `dist/BankReconciliationPro-Portable.exe` (~70 MB). Copy that single file anywhere on a Windows machine and double-click it to run — nothing else to install.

**Note:** it still needs internet access, because SheetJS, jsPDF, and PDF.js are loaded from CDN links in `index.html` (same as the web version) rather than bundled offline.

**If the build fails while downloading `winCodeSign`** with a `Cannot create symbolic link` error, your Windows account doesn't have symlink-creation privilege (needed to extract an unrelated macOS code-signing package that electron-builder fetches even for unsigned Windows builds). Either:
- Enable **Developer Mode** (Settings → Privacy & Security → For developers) and retry, or
- Set `CSC_IDENTITY_AUTO_DISCOVERY=false` before building, or
- As a last resort, wrap `node_modules/7zip-bin/win/x64/7za.exe` so it tolerates that specific symlink error (rename the real binary to `7za_real.exe` and replace `7za.exe` with a small shim that calls it and ignores `Cannot create symbolic link` failures — those files are macOS-only and never used on Windows).

Desktop-specific source lives in `desktop/main.js` and the root `package.json`; `node_modules/` and `dist/` are gitignored and never committed.

---

## 🛠️ Technology Stack

- **HTML5 + Vanilla CSS + Vanilla JavaScript** — No frameworks, no build step
- **[SheetJS (xlsx)](https://sheetjs.com/)** — Excel/CSV parsing via CDN
- **[jsPDF + AutoTable](https://github.com/parallax/jsPDF)** — PDF generation via CDN
- **Google Fonts (Inter)** — Typography

---

## 📁 Project Structure

```
bank-reconciliation/
├── index.html          # App shell & 4-step wizard UI
├── css/
│   └── style.css       # Premium dark theme with glassmorphism
├── js/
│   ├── parser.js       # File parsing (CSV/Excel) & column mapping
│   ├── engine.js       # Reconciliation matching engine
│   ├── report.js       # Report rendering & UI interactions
│   ├── export.js       # PDF & CSV export
│   └── app.js          # Main controller & state management
└── README.md
```

---

## 📄 License

MIT License — Free to use, modify, and distribute.
