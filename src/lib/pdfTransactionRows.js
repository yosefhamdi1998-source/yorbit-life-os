// Advance for every wrapped line, including descriptions longer than a page.
export function writeTransactionRows(doc, transactions, startY, formatAmount) {
  const width = doc.internal.pageSize.getWidth();
  const bottom = doc.internal.pageSize.getHeight() - 40;
  let y = startY;
  for (const transaction of transactions) {
    const sign = transaction.type === 'income' ? '+' : '-';
    const text = `${transaction.date}   ${sign}$${formatAmount(transaction.amount)}   ${transaction.title || ''}   (${transaction.category || 'other'})`;
    const lines = doc.splitTextToSize(text, width - 80);
    for (const line of lines) {
      if (y > bottom) { doc.addPage(); y = 50; }
      doc.text(line, 40, y);
      y += 12;
    }
    y += 5;
  }
  return y;
}
