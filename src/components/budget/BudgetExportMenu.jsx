import { useState } from 'react';
import { Download, FileText, FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from '@/components/ui/use-toast';
import { jsPDF } from 'jspdf';
import { saveFile } from '@/lib/saveFile';

function buildRows(rows, totalSpent, totalBudget) {
  const header = ['Category', 'Spent', 'Budget Limit', 'Remaining', 'Status'];
  const body = rows.map(({ cat, spent, budget }) => {
    const limit = budget?.monthly_limit || 0;
    const remaining = limit > 0 ? limit - spent : 0;
    const status = limit === 0 ? 'No limit' : spent > limit ? 'Over' : spent / limit >= 0.75 ? 'Close' : 'On track';
    return [cat, spent.toFixed(2), limit.toFixed(2), remaining.toFixed(2), status];
  });
  body.push(['TOTAL', totalSpent.toFixed(2), totalBudget.toFixed(2), (totalBudget - totalSpent).toFixed(2), '']);
  return { header, body };
}

export default function BudgetExportMenu({ rows, totalSpent, totalBudget, month }) {
  const [open, setOpen] = useState(false);
  const { header, body } = buildRows(rows, totalSpent, totalBudget);

  const exportCSV = () => deliver(async () => {
    const csv = [header, ...body].map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    return saveFile(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `budget-${month}.csv`);
  }, `budget-${month}.csv`);

  const exportPDF = () => deliver(async () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text('Monthly Budget Report', 14, 20);
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text(`Month: ${month}`, 14, 28);
    doc.setTextColor(0);

    let y = 40;
    const colX = [14, 70, 110, 150, 185];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    header.forEach((h, i) => doc.text(h, colX[i], y));
    doc.setFont('helvetica', 'normal');
    y += 7;
    body.forEach(row => {
      row.forEach((c, i) => doc.text(String(c), colX[i], y));
      y += 7;
      if (y > 270) { doc.addPage(); y = 20; }
    });
    return saveFile(doc.output('blob'), `budget-${month}.pdf`);
  }, `budget-${month}.pdf`);

  // Closes the menu and reports the real outcome: saved, dismissed (no
  // message), or failed - never a success message for a file that went nowhere.
  const deliver = async (produce, filename) => {
    setOpen(false);
    try {
      if (await produce()) toast({ title: 'Exported', description: `${filename} saved` });
    } catch {
      toast({ title: 'Export failed', description: 'Please try again.', variant: 'destructive' });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="icon" variant="outline" className="border-border min-h-[44px] min-w-[44px]" title="Export" aria-label="Export budget">
          <Download className="w-4 h-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-44 p-1">
        <button
          onClick={exportCSV}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg hover:bg-secondary active:bg-secondary/70 transition-colors"
        >
          <FileSpreadsheet className="w-4 h-4 text-emerald-500" /> CSV
        </button>
        <button
          onClick={exportPDF}
          className="w-full flex items-center gap-2 px-3 py-2.5 text-sm rounded-lg hover:bg-secondary active:bg-secondary/70 transition-colors"
        >
          <FileText className="w-4 h-4 text-red-500" /> PDF
        </button>
      </PopoverContent>
    </Popover>
  );
}