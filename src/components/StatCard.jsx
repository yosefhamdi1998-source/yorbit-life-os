export default function StatCard({ title, value, subtitle, icon: Icon, gradient, className = '' }) {
  return (
    <div className={`relative overflow-hidden rounded-2xl p-5 text-white glow-card ${gradient} ${className}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-white/70 text-xs font-medium uppercase tracking-wider">{title}</p>
          <p className="text-2xl font-black mt-1">{value}</p>
          {subtitle && <p className="text-white/70 text-xs mt-1">{subtitle}</p>}
        </div>
        {Icon && (
          <div className="bg-white/20 rounded-xl p-2.5">
            <Icon className="w-5 h-5 text-white" />
          </div>
        )}
      </div>
      <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-white/10 rounded-full" />
      <div className="absolute -bottom-8 -right-8 w-28 h-28 bg-white/5 rounded-full" />
    </div>
  );
}