export function escapeCSVCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// Parse records before detecting the header so quoted newlines remain one field.
export function parseCSV(text) {
  const records = [];
  let row = [], field = '', quoted = false;
  const input = String(text).replace(/^\uFEFF/, '');
  const finishRow = () => {
    row.push(field.trim());
    if (row.some(Boolean)) records.push(row);
    row = []; field = '';
  };
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '"') {
      if (quoted && input[i + 1] === '"') { field += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(field.trim()); field = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      finishRow();
    } else field += ch;
  }
  if (quoted) throw new Error('This CSV has an unfinished quoted field. Please export the statement again.');
  finishRow();
  const hints = ['date', 'time', 'amount', 'desc', 'merchant', 'memo', 'payee', 'note', 'debit', 'credit', 'type', 'category'];
  const headerIndex = records.slice(0, 20).findIndex(cells =>
    cells.filter(Boolean).length >= 2 && hints.some(h => cells.some(c => c.toLowerCase().includes(h))));
  const data = records.slice(Math.max(0, headerIndex));
  if (data.length < 2) return { headers: [], rows: [] };
  const rawHeaders = data[0];
  const headers = rawHeaders.filter(Boolean);
  if (new Set(headers).size !== headers.length) throw new Error('This CSV has duplicate column names. Please give each column a different name.');
  return { headers, rows: data.slice(1).map(values => Object.fromEntries(
    rawHeaders.flatMap((header, i) => header ? [[header, values[i] || '']] : [])
  )) };
}

export function statementRowKey(row) {
  return JSON.stringify([row.date, row.title, Math.abs(Number(row.amount)), row.type]);
}
