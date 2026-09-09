import assert from 'node:assert/strict';
import { parseISO, format } from 'date-fns';
import { filterByPeriod, getPeriodBounds, filterByPreviousPeriod } from '../src/lib/periods.js';
import { reportLink, readReportRange } from '../src/lib/reportRange.js';
import { billsDueThisWeek } from '../src/lib/billWindow.js';
import { totalsLink } from '../src/lib/totalsLink.js';
for (const [year, month, end] of [['2024', '02', '2024-02-29'], ['2026', '02', '2026-02-28'], ['2026', '01', '2026-01-31'], ['2026', null, '2026-12-31']]) {
  for (const type of [undefined, 'income', 'expense']) {
    const url = new URL(totalsLink(year, month, type), 'https://example.test');
    const range = readReportRange(url.search);
    assert.equal(url.pathname, '/finance');
    assert.equal(format(range.start, 'yyyy-MM-dd'), `${year}-${month || '01'}-01`);
    assert.equal(format(range.end, 'yyyy-MM-dd'), end);
    assert.equal(url.searchParams.get('type'), type || null);
  }
}
const anchor = parseISO('2026-09-08');
const transactions = ['2025-12-31','2026-08-10','2026-08-25','2026-08-26','2026-09-01','2026-09-02','2026-09-08'].map(date => ({date}));
for (const period of ['week','weekly','biweekly','month','3month','6month','year','lastyear','year-2025','all']) {
 const bounds=getPeriodBounds(period,anchor,transactions);
 const url=new URL(reportLink(period,anchor,transactions),'https://example.test');
 const range=readReportRange(url.search);
 assert.equal(format(range.start,'yyyy-MM-dd'),bounds.start);
 assert.equal(format(range.end,'yyyy-MM-dd'),bounds.end);
 assert.deepEqual(filterByPeriod(transactions,period,anchor),transactions.filter(t=>t.date>=bounds.start&&t.date<=bounds.end),period);
}
assert.equal(getPeriodBounds('biweekly',anchor).start,'2026-08-26');
assert.deepEqual(filterByPreviousPeriod(transactions,'biweekly',anchor).map(t=>t.date),['2026-08-25']);
assert.ok(reportLink('week',anchor,transactions,'income').startsWith('/finance?'));
for(const query of ['?start=2026-02-30&end=2026-03-01','?start=2026-09-08&end=2026-08-01','?start=no&end=yes']) assert.equal(readReportRange(query),null);
console.log('PASS: report dates match summary windows, income destination, and invalid-date handling');
assert.deepEqual(billsDueThisWeek([
 {due_date:'2026-09-07',amount:400},
 {due_date:'2026-09-08',amount:20},
 {due_date:'2026-09-14',amount:30},
 {due_date:'2026-09-15',amount:100},
 {due_date:'2026-09-10',amount:50,is_paid:true},
],anchor),{start:'2026-09-08',end:'2026-09-14',count:2,total:50});
console.log('PASS: weekly bills include today, exclude paid, overdue and following-week bills');
