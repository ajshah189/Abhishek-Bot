export default function SummaryCard({ icon, label, value, sub, color = 'indigo' }) {
  const colors = {
    indigo: 'from-indigo-600/20 to-indigo-500/5 border-indigo-500/20 text-indigo-400',
    emerald: 'from-emerald-600/20 to-emerald-500/5 border-emerald-500/20 text-emerald-400',
    amber: 'from-amber-600/20 to-amber-500/5 border-amber-500/20 text-amber-400',
    rose: 'from-rose-600/20 to-rose-500/5 border-rose-500/20 text-rose-400',
    violet: 'from-violet-600/20 to-violet-500/5 border-violet-500/20 text-violet-400',
  };
  return (
    <div className={`rounded-xl border bg-gradient-to-br p-5 ${colors[color]}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-slate-400 font-medium uppercase tracking-wider mb-1">{label}</p>
          <p className="text-3xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <span className="text-2xl">{icon}</span>
      </div>
    </div>
  );
}
