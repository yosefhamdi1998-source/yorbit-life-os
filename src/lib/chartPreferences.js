export const CHART_STYLES = [
  { key: 'bar', label: 'Bars', description: 'Compare income and spending' },
  { key: 'line', label: 'Line', description: 'Follow changes over time' },
  { key: 'pie', label: 'Split', description: 'See the share of total activity' },
];
export function getChartStyle() {
  try {
    const value = localStorage.getItem('yorbit.chartStyle');
    return CHART_STYLES.some(style => style.key === value) ? value : 'bar';
  } catch { return 'bar'; }
}
export function saveChartStyle(value) {
  if (!CHART_STYLES.some(style => style.key === value)) return;
  try { localStorage.setItem('yorbit.chartStyle', value); } catch { /* Still usable for this visit. */ }
}
