import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import { writeTransactionRows } from '../src/lib/pdfTransactionRows.js';
const doc = new jsPDF({ unit: 'pt', format: 'a4' });
doc.setFontSize(9);
const positions = [];
const originalText = doc.text.bind(doc);
doc.text = (text, x, y) => {
  positions.push({ page: doc.getNumberOfPages(), y, text });
  return originalText(text, x, y);
};
const rows = [
  { date: '2026-09-01', type: 'expense', amount: 42.75, category: 'food', title: 'LONG DESCRIPTION '.repeat(600) },
  { date: '2026-09-02', type: 'income', amount: 3000, category: 'salary', title: 'FINAL TRANSACTION' },
];
writeTransactionRows(doc, rows, 760, n => n.toFixed(2));
assert.ok(doc.getNumberOfPages() >= 3);
for (let i = 0; i < positions.length; i++) {
  const p = positions[i];
  assert.ok(p.y >= 40 && p.y <= doc.internal.pageSize.getHeight() - 40);
  if (i && positions[i - 1].page === p.page) assert.ok(p.y - positions[i - 1].y >= 12);
}
assert.ok(positions.some(p => p.text.includes('FINAL TRANSACTION')));
assert.equal(positions.map(p => p.text).join(' ').match(/LONG DESCRIPTION/g).length, 600);
if (process.argv[2]) doc.save(process.argv[2]);
console.log('PASS: wrapped descriptions retain all text, avoid overlap, and paginate within margins');
