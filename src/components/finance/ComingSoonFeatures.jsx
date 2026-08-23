const COMING_SOON = [
  { icon: '📊', label: 'Advanced Reports', desc: 'Deep-dive analytics on spending trends over time.' },
  { icon: '🤝', label: 'Bill Negotiation', desc: 'AI-powered tips to lower your recurring bills.' },
  { icon: '💳', label: 'Debt Payoff Planner', desc: 'A personalized plan to become debt-free faster.' },
  { icon: '📬', label: 'Weekly Summary', desc: 'A weekly email digest of your financial health.' },
];

export default function ComingSoonFeatures() {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 px-0.5">Coming Soon</p>
      <div className="grid grid-cols-2 gap-2.5">
        {COMING_SOON.map(({ icon, label, desc }) => (
          <div key={label} className="bg-white/50 border border-border/60 rounded-2xl p-3.5 opacity-75">
            <span className="text-xl mb-2 block">{icon}</span>
            <p className="text-xs font-bold mb-0.5 text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground leading-snug">{desc}</p>
            <span className="mt-2 inline-block text-[10px] font-semibold bg-secondary/80 text-muted-foreground px-2 py-0.5 rounded-full">Coming Soon</span>
          </div>
        ))}
      </div>
    </div>
  );
}