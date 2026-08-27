import { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { Upload, CheckCircle, AlertTriangle, ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';

const EXPENSE_CATS = ['housing', 'food', 'transport', 'entertainment', 'health', 'shopping', 'education', 'other'];
const INCOME_CATS = ['salary', 'freelance', 'investment', 'other'];
const ALL_CATS = [...new Set([...EXPENSE_CATS, ...INCOME_CATS])];

function parseCSV(text) {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };
  const headers = lines[0].split(',').map(h => h.replace(/['"]/g, '').trim());
  const rows = lines.slice(1).map(line => {
    const vals = [];
    let cur = '', inQ = false;
    for (const ch of line) {
      if (ch === '"') { inQ = !inQ; }
      else if (ch === ',' && !inQ) { vals.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    vals.push(cur.trim());
    return headers.reduce((obj, h, i) => { obj[h] = (vals[i] || '').replace(/^"(.*)"$/, '$1').trim(); return obj; }, {});
  });
  return { headers, rows };
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

export default function CSVImport() {
  const navigate = useNavigate();
  const fileRef = useRef();
  const [step, setStep] = useState('upload'); // upload | map | preview | done
  const [headers, setHeaders] = useState([]);
  const [rawRows, setRawRows] = useState([]);
  const [mapping, setMapping] = useState({ date: '', description: '', amount: '', category: '' });
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  const [error, setError] = useState('');

  const handleFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.csv')) { setError('Please upload a .csv file.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers: h, rows: r } = parseCSV(ev.target.result);
      if (h.length === 0) { setError('Could not parse CSV. Make sure it has headers.'); return; }
      if (r.length > 200) {
        setError(`Your file has ${r.length} rows. For now, import up to 200 transactions at a time. Please trim your CSV and try again.`);
        return;
      }
      setHeaders(h);
      setRawRows(r);
      // Auto-guess mapping
      const guess = (keywords) => h.find(hh => keywords.some(k => hh.toLowerCase().includes(k))) || '';
      setMapping({
        date: guess(['date', 'time', 'posted']),
        description: guess(['desc', 'merchant', 'name', 'memo', 'payee', 'narration']),
        amount: guess(['amount', 'debit', 'credit', 'value']),
        category: guess(['category', 'type', 'label']),
      });
      setError('');
      setStep('map');
    };
    reader.readAsText(file);
  };

  const buildPreview = () => {
    if (!mapping.date || !mapping.amount) { setError('Please map at least Date and Amount.'); return; }
    const rows = rawRows.map((row, i) => {
      const rawAmt = String(row[mapping.amount] || '').replace(/[^0-9.-]/g, '');
      const amount = Math.abs(parseFloat(rawAmt)) || 0;
      const type = guessType(row[mapping.amount]);
      const description = row[mapping.description] || `Transaction ${i + 1}`;
      const category = mapping.category && row[mapping.category]
        ? (ALL_CATS.includes(row[mapping.category]?.toLowerCase()) ? row[mapping.category].toLowerCase() : 'other')
        : guessCategory(description);
      let date = row[mapping.date] || format(new Date(), 'yyyy-MM-dd');
      // Try to normalize date. Skip re-parsing values already in yyyy-MM-dd —
      // new Date('yyyy-MM-dd') parses as UTC midnight, which date-fns's format()
      // then renders in local time, shifting the date back a day in any
      // timezone behind UTC. Only non-ISO formats (e.g. bank CSVs using
      // MM/DD/YYYY, which new Date() parses as local time) need this round-trip.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        try {
          const d = new Date(date);
          if (!isNaN(d.getTime())) date = format(d, 'yyyy-MM-dd');
        } catch { date = format(new Date(), 'yyyy-MM-dd'); }
      }
      return { title: description, amount, type, category, date, _raw: row, _skip: amount === 0 };
    }).filter(r => !r._skip);
    setPreview(rows);
    setError('');
    setStep('preview');
  };

  const doImport = async () => {
    setImporting(true);
    setImportProgress(0);
    let imported = 0, skipped = 0, failed = 0;

    const existing = await base44.entities.Transaction.list('-date', 500);
    const existingKeys = new Set(existing.map(t => `${t.date}|${t.title}|${t.amount}`));
    const toImport = preview.filter(r => !existingKeys.has(`${r.date}|${r.title}|${r.amount}`));
    skipped = preview.length - toImport.length;

    for (let i = 0; i < toImport.length; i++) {
      const { _raw, _skip, ...data } = toImport[i];
      try {
        await base44.entities.Transaction.create(data);
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

  return (
    <div className="py-6 lg:py-10">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate('/finance')} className="min-h-[44px] min-w-[44px]">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-black">Import Transactions</h1>
          <p className="text-xs text-muted-foreground">Upload your bank CSV to add transactions</p>
        </div>
      </div>

      {/* Steps indicator */}
      <div className="flex items-center gap-2 mb-6">
        {['upload', 'map', 'preview', 'done'].map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all ${step === s ? 'bg-primary text-white' : ['upload', 'map', 'preview', 'done'].indexOf(step) > i ? 'bg-emerald-500 text-white' : 'bg-secondary text-muted-foreground'}`}>
              {['upload', 'map', 'preview', 'done'].indexOf(step) > i ? '✓' : i + 1}
            </div>
            {i < 3 && <div className={`h-0.5 w-6 rounded ${['upload', 'map', 'preview', 'done'].indexOf(step) > i ? 'bg-emerald-500' : 'bg-secondary'}`} />}
          </div>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="space-y-4">
          <input ref={fileRef} type="file" accept=".csv" onChange={handleFile} className="hidden" />
          <div
            onClick={() => fileRef.current?.click()}
            className="border-2 border-dashed border-primary/30 rounded-2xl p-10 sm:p-14 text-center cursor-pointer hover:border-primary/60 hover:bg-primary/5 transition-all"
          >
            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Upload className="w-8 h-8 text-primary/60" />
            </div>
            <p className="font-bold text-base mb-1">Upload Bank CSV</p>
            <p className="text-sm text-muted-foreground mb-5">Select your bank's exported CSV file</p>
            <Button onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }} className="gap-2">
              <Upload className="w-4 h-4" /> Choose File
            </Button>
          </div>
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-5">
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">How to export your CSV</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• <strong>Chase:</strong> Download Activity → CSV</li>
              <li>• <strong>Bank of America:</strong> Accounts → Download → CSV</li>
              <li>• <strong>Wells Fargo:</strong> Account Activity → Download</li>
              <li>• <strong>Any bank:</strong> Look for "Export", "Download", or "Statements"</li>
            </ul>
          </div>
        </div>
      )}

      {/* Step 2: Map columns */}
      {step === 'map' && (
        <div>
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <FileText className="w-4 h-4 text-primary" />
              <p className="text-base font-bold">Map Your Columns</p>
            </div>
            <p className="text-sm text-muted-foreground mb-5">We found <strong>{rawRows.length}</strong> rows. Match the CSV columns to the right fields.</p>
            <div className="space-y-4 sm:grid sm:grid-cols-2 sm:gap-4 sm:space-y-0">
              {[
                { key: 'date', label: 'Date *', required: true },
                { key: 'description', label: 'Description / Merchant *', required: true },
                { key: 'amount', label: 'Amount *', required: true },
                { key: 'category', label: 'Category (optional)', required: false },
              ].map(({ key, label, required }) => (
                <div key={key}>
                  <p className="text-sm font-medium mb-1.5">{label}</p>
                  <Select value={mapping[key]} onValueChange={v => setMapping(m => ({ ...m, [key]: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column…" />
                    </SelectTrigger>
                    <SelectContent>
                      {!required && <SelectItem value={null}>None</SelectItem>}
                      {headers.map(h => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {mapping[key] && rawRows[0] && (
                    <p className="text-xs text-muted-foreground mt-1">Preview: "{rawRows[0][mapping[key]]}"</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('upload')} className="flex-1">Back</Button>
            <Button onClick={buildPreview} disabled={!mapping.date || !mapping.description || !mapping.amount} className="flex-1">
              Preview Transactions
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 'preview' && (
        <div>
          <div className="bg-card border border-border rounded-2xl p-4 sm:p-6 mb-4">
            <p className="text-base font-bold mb-0.5">Preview ({preview.length} transactions)</p>
            <p className="text-sm text-muted-foreground mb-4">Review before importing. Duplicates will be skipped automatically.</p>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {preview.slice(0, 50).map((tx, i) => (
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
              {preview.length > 50 && (
                <p className="text-sm text-muted-foreground text-center py-2">…and {preview.length - 50} more</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setStep('map')} className="flex-1">Back</Button>
            <Button onClick={doImport} disabled={importing} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-1">
              {importing ? <><Loader2 className="w-4 h-4 animate-spin" /> {importProgress}%</> : `Import ${preview.length} Transactions`}
            </Button>
          </div>
        </div>
      )}

      {/* Step 4: Done */}
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
            <Button variant="outline" onClick={() => { setStep('upload'); setPreview([]); setRawRows([]); setHeaders([]); }}>
              Import Another
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