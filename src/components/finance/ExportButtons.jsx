import { useState } from 'react';
import { Download, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from '@/components/ui/use-toast';
import { jsPDF } from 'jspdf';
import { format } from 'date-fns';

const fmt = (n) => (n || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

const csvEsc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export default function ExportButtons({ allTransactions, periodTransactions, categoryData, totalSpending, periodLabel }) {
  const [busy, setBusy] = useState(null);

  const exportCSV = () => {
    setBusy('csv');
    try {
      const rows = [];
      rows.push('Yorbit Finance Export');
      rows.push(`Period,${csvEsc(periodLabel)}`);
      rows.push(`Generated,${format(new Date(), "MMM d, yyyy h:mm a")}`);
      rows.push('');
      rows.push('--- Spending Summary (Selected Period) ---');
      rows.push('Category,Amount');
      categoryData.forEach((c) => rows.push(`${c.name},${c.spent}`));
      rows.push(`Total,${totalSpending}`);
      rows.push('');
      rows.push('--- Transaction History (All) ---');
      rows.push('Date,Title,Amount,Type,Category,Notes');
      allTransactions.forEach((t) => {
        rows.push([
          t.date, t.title, t.amount, t.type, t.category, t.notes || '',
        ].map(csvEsc).join(','));
      });

      const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yorbit-transactions-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: 'CSV exported', description: 'Opens in Google Sheets or Excel.' });
    } catch {
      toast({ title: 'Export failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  const exportPDF = () => {
    setBusy('pdf');
    try {
      const doc = new jsPDF({ unit: 'pt', format: 'a4' });
      const pageW = doc.internal.pageSize.getWidth();
      const right = pageW - 40;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(20);
      doc.text('Yorbit Spending Summary', 40, 50);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      doc.text(`Period: ${periodLabel}`, 40, 72);
      doc.text(`Generated: ${format(new Date(), 'MMM d, yyyy')}`, 40, 88);

      // Summary stats
      let y = 120;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text('Spending by Category', 40, y);
      y += 22;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(11);
      categoryData.forEach((c) => {
        doc.text(`${c.name}`, 40, y);
        doc.text(`$${fmt(c.spent)}`, right, y, { align: 'right' });
        y += 18;
      });
      doc.setLineWidth(0.5);
      doc.line(40, y - 6, right, y - 6);
      y += 14;
      doc.setFont('helvetica', 'bold');
      doc.text('Total Spent', 40, y);
      doc.text(`$${fmt(totalSpending)}`, right, y, { align: 'right' });
      y += 34;

      // Transactions for the period
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(13);
      doc.text(`Transactions (${periodTransactions.length})`, 40, y);
      y += 22;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const sorted = [...periodTransactions].sort((a, b) => (a.date < b.date ? 1 : -1));
      sorted.forEach((t) => {
        if (y > 780) { doc.addPage(); y = 50; }
        const sign = t.type === 'income' ? '+' : '-';
        const line = `${t.date}   ${sign}$${fmt(t.amount)}   ${t.title}   (${t.category})`;
        doc.text(line, 40, y, { maxWidth: pageW - 80 });
        y += 15;
      });

      doc.save(`yorbit-summary-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
      toast({ title: 'PDF exported', description: 'Saved to your downloads.' });
    } catch {
      toast({ title: 'Export failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex gap-1.5">
      <Button
        variant="outline"
        size="sm"
        onClick={exportCSV}
        disabled={busy !== null}
        className="h-9 px-3 gap-1.5 min-h-[44px]"
      >
        {busy === 'csv' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
        <span className="hidden sm:inline">CSV</span>
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={exportPDF}
        disabled={busy !== null}
        className="h-9 px-3 gap-1.5 min-h-[44px]"
      >
        {busy === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
        <span className="hidden sm:inline">PDF</span>
      </Button>
    </div>
  );
}