import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, CheckCircle, AlertTriangle, ArrowLeft, FileText, Loader2, FileSpreadsheet, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import * as pdfjsLib from 'pdfjs-dist';
// Vite emits the worker as its own asset and hands back its final URL —
// pdf.js can't parse on the main thread without pointing at this.
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'other'];
const INCOME_CATS = ['salary', 'freelance', 'investment', 'other'];
const ALL_CATS = [...new Set([...EXPENSE_CATS, ...INCOME_CATS])];

// Real exports (Venmo's especially) don't start with the column header row —
// Venmo's opens with a title line ("Account Statement - (@user)"), a
// beginning-balance line, and blank lines before the actual
// "ID,Datetime,Type,Status,Note,From,To,Amount (total),…" header. Blindly
// treating line 1 as the header, like a plain bank CSV, turned that title
// line into a single bogus column and broke everything downstream — so
// scan for the first line that actually looks like a header row instead.
const HEADER_HINTS = ['date', 'time', 'amount', 'desc', 'merchant', 'memo', 'payee', 'note', 'debit', 'credit', 'type', 'category'];
function findHeaderRowIndex(lines) {
  for (let i = 0; i < Math.min(lines.length, 20); i++) {
    const cells = lines[i].split(',').map(c => c.replace(/['"]/g, '').trim().toLowerCase()).filter(Boolean);
    if (cells.length >= 2 && HEADER_HINTS.some(h => cells.some(c => c.includes(h)))) return i;
  }
  return 0;
}

function parseCSV(text) {
  const allLines = text.trim().split('\n').filter(l => l.trim());
  const lines = allLines.slice(findHeaderRowIndex(allLines));
  if (lines.length < 2) return { headers: [], rows: [] };
  // Keep the raw (possibly-blank) header list for building each row object
  // positionally — Venmo's export leads with one unlabeled column, and
  // dropping it here would shift every later value one column to the left.
  const rawHeaders = lines[0].split(',').map(h => h.replace(/['"]/g, '').trim());
  const rows = lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    // Blank-named columns just get skipped — nothing can ever reference them
    // by name, and letting an empty string through as a header would later
    // crash a <SelectItem>, which requires a non-empty value.
    return rawHeaders.reduce((obj, h, i) => { if (h) obj[h] = (vals[i] || '').replace(/^"(.*)"$/, '$1').trim(); return obj; }, {});
  });
  return { headers: rawHeaders.filter(Boolean), rows };
}

// Second-pass fallback for when a column's own name doesn't say what it is
// (a bank's own jargon, an unlabeled export, a language mismatch). Instead
// of giving up and asking the user to pick manually, look at what's
// actually IN each column across a sample of rows — a column that's
// consistently date-shaped or dollar-shaped gives itself away regardless
// of what it's called.
const DATE_VALUE_RE = /^\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{2,4}|\d{1,2}-\d{1,2}-\d{2,4})/;
const AMOUNT_VALUE_RE = /^\s*[-(]?\$?\s*-?\d[\d,]*\.\d{1,2}\)?\s*$/;

function sniffColumn(rows, headers, predicate, exclude = []) {
  const sample = rows.slice(0, Math.min(rows.length, 25)).filter(r => headers.some(h => (r[h] || '').trim()));
  if (sample.length === 0) return '';
  let best = '', bestScore = 0;
  for (const h of headers) {
    if (exclude.includes(h)) continue;
    const hit = sample.filter(r => predicate((r[h] || '').trim())).length;
    const score = hit / sample.length;
    if (score > bestScore) { bestScore = score; best = h; }
  }
  return bestScore >= 0.6 ? best : '';
}

function guessType(amount) {
  const n = parseFloat(String(amount).replace(/[^0-9.-]/g, ''));
  if (isNaN(n)) return 'expense';
  return n < 0 ? 'expense' : 'income';
}

function guessCategory(description) {
  if (!description) return 'other';
  const d = description.toLowerCase();
  if (d.match(/rent|mortgage|hoa/)) return 'housing';
  if (d.match(/grocery|food|restaurant|cafe|coffee|starbucks|mcdonalds|pizza/)) return 'food';
  if (d.match(/uber|lyft|gas|fuel|parking|transit|metro|bus|train/)) return 'transport';
  if (d.match(/netflix|spotify|hulu|amazon|disney|apple|youtube|subscription/)) return 'entertainment';
  if (d.match(/doctor|pharmacy|medical|dental|health|hospital/)) return 'health';
  if (d.match(/amazon|walmart|target|shopping|store/)) return 'shopping';
  if (d.match(/salary|payroll|direct deposit|income|paycheck/)) return 'salary';
  if (d.match(/freelance|contract|invoice/)) return 'freelance';
  return 'other';
}

// A raw {date, description, amount} triple — however it was extracted —
// becomes one real transaction candidate here. Every source (CSV columns,
// PDF text lines) funnels through this one function so date parsing,
// amount cleanup, and category guessing only exist in one place.
function normalizeRow({ date: rawDate, description, amount: rawAmount }) {
  const rawAmt = String(rawAmount || '').replace(/[^0-9.-]/g, '');
  const amount = Math.abs(parseFloat(rawAmt)) || 0;
  if (!amount) return null;
  const type = guessType(rawAmount);
  const desc = (description || '').trim() || 'Transaction';
  const category = guessCategory(desc);
  let date = (rawDate || '').trim() || format(new Date(), 'yyyy-MM-dd');
  // Skip re-parsing values already in yyyy-MM-dd — new Date('yyyy-MM-dd')
  // parses as UTC midnight, which format() then renders in local time,
  // shifting the date back a day in any timezone behind UTC.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return null;
      date = format(d, 'yyyy-MM-dd');
    } catch { return null; }
  }
  return { title: desc, amount, type, category, date };
}

// pdf.js hands back individual text fragments with x/y positions, not
// lines — fragments on the same row have to be regrouped and sorted
// left-to-right before a per-line regex has anything sensible to match.
async function extractPdfLines(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rows = {};
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      (rows[y] ||= []).push(item);
    }
    const sortedY = Object.keys(rows).map(Number).sort((a, b) => b - a);
    for (const y of sortedY) {
      const line = rows[y].sort((a, b) => a.transform[4] - b.transform[4]).map(i => i.str).join(' ').replace(/\s+/g, ' ').trim();
      if (line) lines.push(line);
    }
  }
  return lines;
}

// Most bank/Venmo/Cash App statement lines read as
// "<date> <description...> <amount>" — pull the date off the front, the
// amount off the back, and whatever survives in the middle is the
// description. Lines with neither a date nor a dollar amount (headers,
// page numbers, disclaimers) are just noise and get skipped.
const PDF_DATE_RE = /^(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s*\d{0,4})/i;
const PDF_AMOUNT_RE = /(-?\(?\$?-?[\d,]+\.\d{2}\)?)\s*$/;

function parsePdfLinesToRows(lines) {
  const rows = [];
  for (const line of lines) {
    const dateMatch = line.match(PDF_DATE_RE);
    const amountMatch = line.match(PDF_AMOUNT_RE);
    if (!dateMatch || !amountMatch) continue;
    const descStart = dateMatch[0].length;
    const descEnd = line.length - amountMatch[0].length;
    if (descEnd <= descStart) continue;
    let desc = line.slice(descStart, descEnd).trim().replace(/^[-:•|,]+|[-:•|,]+$/g, '').trim();
    // A real transaction description never contains a URL — seeing one
    // means a page footer/disclaimer link that happened to land at the
    // same vertical position as a real row got merged into it by the
    // line-reconstruction above, which also means the "amount" this line
    // matched can't be trusted either. Drop the row rather than import a
    // real dollar figure under a corrupted description (this produced 16
    // bogus rows — same broken title, same batch timestamp — before it
    // was caught).
    if (/https?:\/\/|www\./i.test(desc)) continue;
    let amtRaw = amountMatch[1];
    const negative = amtRaw.includes('(') || amtRaw.trim().startsWith('-');
    amtRaw = amtRaw.replace(/[()$,-]/g, '');
    rows.push({ date: dateMatch[0], description: desc, amount: (negative ? '-' : '') + amtRaw });
  }
  return rows;
}

export default function CSVImport() {
  const navigate = useNavigate();
  const fileRef = useRef();
  const [step, setStep] = useState('upload'); // upload | processing | mapping | preview | importing | done
  const [collected, setCollected] = useState([]); // normalized {title, amount, type, category, date} rows
  const [fileSummaries, setFileSummaries] = useState([]); // [{name, count, kind, warning?}]
  const [pendingMapFiles, setPendingMapFiles] = useState([]); // CSVs whose columns couldn't be auto-detected
  const [mapIndex, setMapIndex] = useState(0);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState('');

  const processFiles = async (fileList) => {
    setStep('processing');
    setError('');
    const allNormalized = [];
    const needsMap = [];
    const summaries = [];

    for (const file of fileList) {
      const name = file.name;
      const lower = name.toLowerCase();
      try {
        if (lower.endsWith('.pdf')) {
          const lines = await extractPdfLines(file);
          const raw = parsePdfLinesToRows(lines);
          const norm = raw.map(normalizeRow).filter(Boolean);
          if (norm.length === 0) {
            summaries.push({ name, count: 0, kind: 'pdf', warning: "Couldn't find transaction rows in this PDF — its layout may not be supported yet." });
          } else {
            allNormalized.push(...norm);
            summaries.push({ name, count: norm.length, kind: 'pdf' });
          }
        } else if (lower.endsWith('.csv')) {
          const text = await file.text();
          const { headers, rows } = parseCSV(text);
          if (headers.length === 0) {
            summaries.push({ name, count: 0, kind: 'csv', warning: 'Could not read this CSV — make sure it has column headers.' });
            continue;
          }
          const guess = (keywords) => headers.find(hh => keywords.some(k => hh.toLowerCase().includes(k))) || '';
          const mapping = {
            date: guess(['date', 'time', 'posted']),
            // 'note' catches Venmo's own column name for this field —
            // without it, every real Venmo CSV export fell back to manual
            // mapping even though the date/amount columns auto-detected fine.
            description: guess(['desc', 'merchant', 'name', 'memo', 'payee', 'narration', 'note']),
            amount: guess(['amount', 'debit', 'credit', 'value']),
          };
          // Name-based guessing failed — before ever asking a person to
          // pick columns by hand, try reading the column by what's actually
          // in it. This is what makes an odd or unlabeled export still
          // "just work" instead of stopping to ask.
          if (!mapping.date) mapping.date = sniffColumn(rows, headers, v => DATE_VALUE_RE.test(v));
          if (!mapping.amount) mapping.amount = sniffColumn(rows, headers, v => AMOUNT_VALUE_RE.test(v), [mapping.date].filter(Boolean));
          if (mapping.date && mapping.amount) {
            const norm = rows.map(row => normalizeRow({
              date: row[mapping.date], description: row[mapping.description], amount: row[mapping.amount],
            })).filter(Boolean);
            allNormalized.push(...norm);
            summaries.push({ name, count: norm.length, kind: 'csv' });
          } else {
            // Couldn't confidently guess the columns — queue for a quick
            // one-time manual match instead of silently dropping the file.
            needsMap.push({ file, headers, rawRows: rows, mapping: { ...mapping, category: guess(['category', 'type', 'label']) } });
          }
        } else {
          summaries.push({ name, count: 0, kind: 'other', warning: 'Only .csv and .pdf files are supported.' });
        }
      } catch {
        summaries.push({ name, count: 0, kind: 'error', warning: "Couldn't read this file." });
      }
    }

    setCollected(allNormalized);
    setFileSummaries(summaries);

    if (needsMap.length > 0) {
      setPendingMapFiles(needsMap);
      setMapIndex(0);
      setStep('mapping');
    } else if (allNormalized.length > 0) {
      setStep('preview');
    } else {
      setError("Didn't find any transactions in those files. Double-check they're the right export, or try a different file.");
      setStep('upload');
    }
  };

  const handleFiles = (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    processFiles(files);
    e.target.value = '';
  };

  const updateCurrentMapping = (key, val) => {
    setPendingMapFiles(pf => pf.map((f, i) => i === mapIndex ? { ...f, mapping: { ...f.mapping, [key]: val } } : f));
  };

  const confirmCurrentMapping = () => {
    const current = pendingMapFiles[mapIndex];
    if (!current.mapping.date || !current.mapping.amount) { setError('Please match at least Date and Amount.'); return; }
    const norm = current.rawRows.map(row => normalizeRow({
      date: row[current.mapping.date], description: row[current.mapping.description], amount: row[current.mapping.amount],
    })).filter(Boolean);
    setCollected(c => [...c, ...norm]);
    setFileSummaries(s => [...s, { name: current.file.name, count: norm.length, kind: 'csv' }]);
    setError('');
    if (mapIndex + 1 < pendingMapFiles.length) {
      setMapIndex(i => i + 1);
    } else {
      setStep('preview');
    }
  };

  const doImport = async () => {
    setImporting(true);
    setImportProgress(0);
    let imported = 0, skipped = 0, failed = 0;

    const existing = await base44.entities.Transaction.list('-date', 50000);
    const existingKeys = new Set(existing.map(t => `${t.date}|${t.title}|${t.amount}`));
    const toImport = [];
    for (const r of collected) {
      const key = `${r.date}|${r.title}|${r.amount}`;
      if (existingKeys.has(key)) { skipped++; continue; }
      // Mark it seen immediately so the SAME transaction appearing twice
      // across overlapping statement files (a common real case — she
      // downloaded per-month files that can overlap by a few days) only
      // gets imported once, not counted as "new" every time it recurs.
      existingKeys.add(key);
      toImport.push(r);
    }

    for (let i = 0; i < toImport.length; i++) {
      try {
        await base44.entities.Transaction.create(toImport[i]);
        imported++;
      } catch {
        failed++;
      }
      setImportProgress(Math.round(((i + 1) / toImport.length) * 100));
    }

    setImportedCount(imported);
    setSkippedCount(skipped);
    setFailedCount(failed);
    setImporting(false);
    setStep('done');
  };

  const reset = () => {
    setStep('upload'); setCollected([]); setFileSummaries([]); setPendingMapFiles([]); setMapIndex(0); setError('');
  };

  const STEP_ORDER = ['upload', 'preview', 'done'];
  const stepIdx = STEP_ORDER.indexOf(step === 'processing' || step === 'mapping' ? 'upload' : step === 'importing' ? 'preview' : step);

  return (
    <div className="py-6 lg:py-10">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/finance')} className="min-h-[44px] min-w-[44px]">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-black">Upload Statement</h1>
          <p className="text-xs text-muted-foreground">Add transactions from a bank, Venmo, or Cash App file</p>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-6">
        {STEP_ORDER.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${stepIdx === i ? 'bg-primary text-white' : stepIdx > i ? 'bg-emerald-500 text-white' : 'bg-secondary text-muted-foreground'}`}>
              {stepIdx > i ? '✓' : i + 1}
            </div>
            {i < STEP_ORDER.length - 1 && <div className={`h-0.5 w-6 rounded ${stepIdx > i ? 'bg-emerald-500' : 'bg-secondary'}`} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <input ref={fileRef} type="file" accept=".csv,.pdf" multiple onChange={handleFiles} className="hidden" />
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-primary/30 rounded-2xl p-10 sm:p-14 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-primary/60" />
            </div>
            <p className="font-bold text-base mb-1">Upload your statements</p>
            <p className="text-sm text-muted-foreground mb-5">Pick one or more files — CSV or PDF, any bank or app</p>
            <Button onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} className="gap-2">
              <Upload className="w-4 h-4" /> Choose Files
            </Button>
          </div>
          <div className="sky-card rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Works with</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• <strong>Venmo:</strong> monthly PDF statements, or Settings → Download CSV</li>
              <li>• <strong>Cash App / PayPal:</strong> downloaded statement or activity export</li>
              <li>• <strong>Any bank:</strong> Chase, Bank of America, Wells Fargo — CSV or PDF</li>
            </ul>
            <p className="text-xs text-muted-foreground mt-3">You can select several files at once — everything gets combined into one review before anything is added.</p>
          </div>
        </div>
      )}

      {/* Step: Processing */}
      {step === 'processing' && (
        <div className="py-20 text-center">
          <Loader2 className="w-8 h-8 text-primary animate-spin mx-auto mb-4" />
          <p className="text-sm font-semibold text-muted-foreground">Reading your files…</p>
        </div>
      )}

      {/* Step: Manual mapping fallback — only shown for files we couldn't auto-read */}
      {step === 'mapping' && pendingMapFiles[mapIndex] && (
        <div>
          <div className="sky-card rounded-2xl p-4 sm:p-6 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <FileSpreadsheet className="w-4 h-4 text-primary" />
              <p className="text-base font-bold truncate">{pendingMapFiles[mapIndex].file.name}</p>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              We couldn't tell which columns are which in this one ({mapIndex + 1} of {pendingMapFiles.length} that need a quick check). Match them below.
            </p>
            <div className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
              {[
                { key: 'date', label: 'Date *' },
                { key: 'description', label: 'Description *' },
                { key: 'amount', label: 'Amount *' },
                { key: 'category', label: 'Category (optional)' },
              ].map(({ key, label }) => (
                <div key={key}>
                  <p className="text-sm font-medium mb-1.5">{label}</p>
                  <Select value={pendingMapFiles[mapIndex].mapping[key] || undefined} onValueChange={v => updateCurrentMapping(key, v)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column…" />
                    </SelectTrigger>
                    <SelectContent>
                      {pendingMapFiles[mapIndex].headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>
          </div>
          <Button onClick={confirmCurrentMapping} className="w-full">
            {mapIndex + 1 < pendingMapFiles.length ? 'Next File' : 'Continue to Review'}
          </Button>
        </div>
      )}

      {/* Step: Preview (combined across every file) */}
      {step === 'preview' && (
        <div>
          {fileSummaries.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {fileSummaries.map((f, i) => (
                <span key={i} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${f.warning ? 'bg-amber-500/10 text-amber-600' : 'bg-secondary text-muted-foreground'}`}>
                  {f.warning ? <AlertTriangle className="w-3 h-3 inline mr-1 -mt-0.5" /> : null}
                  {f.name} {f.warning ? '— ' + f.warning : `· ${f.count}`}
                </span>
              ))}
            </div>
          )}
          <div className="sky-card rounded-2xl p-4 sm:p-6 mb-4">
            <p className="text-base font-bold mb-0.5">Review ({collected.length} transactions found)</p>
            <p className="text-sm text-muted-foreground mb-4">Duplicates already in your account will be skipped automatically.</p>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {collected.slice(0, 50).map((tx, i) => (
                <div key={i} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{tx.title}</p>
                    <p className="text-xs text-muted-foreground capitalize">{tx.category} · {tx.date}</p>
                  </div>
                  <span className={`text-sm font-bold shrink-0 ${tx.type === 'income' ? 'text-emerald-500' : 'text-foreground'}`}>
                    {tx.type === 'income' ? '+' : '-'}${tx.amount.toFixed(2)}
                  </span>
                </div>
              ))}
              {collected.length > 50 && (
                <p className="text-sm text-muted-foreground text-center py-2">…and {collected.length - 50} more</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={reset} className="flex-1">Start Over</Button>
            <Button onClick={doImport} disabled={importing || collected.length === 0} className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground border-0 gap-1">
              {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> {importProgress}%</> : `Import ${collected.length} Transactions`}
            </Button>
          </div>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
        <div className="text-center py-10">
          <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <p className="text-2xl font-black mb-2">Import Complete!</p>
          <p className="text-base text-muted-foreground mb-1">
            Imported <span className="font-bold text-foreground">{importedCount}</span> transactions.
          </p>
          {skippedCount > 0 && <p className="text-sm text-muted-foreground">Skipped <span className="font-bold">{skippedCount}</span> duplicates.</p>}
          {failedCount > 0 && <p className="text-sm text-amber-600 mt-1">{failedCount} rows had errors and were skipped.</p>}
          <div className="flex gap-3 justify-center mt-8">
            <Button variant="outline" onClick={reset}>
              Upload More
            </Button>
            <Button onClick={() => navigate('/finance')} className="gap-2">
              View Transactions
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
