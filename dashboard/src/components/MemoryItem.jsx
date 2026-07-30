import { format } from 'date-fns';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  return new Date(ts);
}

export default function MemoryItem({ memory }) {
  const created = tsToDate(memory.createdAt);
  return (
    <div className="flex gap-4 p-4 rounded-lg border border-white/5 bg-white/2 hover:bg-white/4 transition-colors">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1 flex-wrap">
          {memory.key && (
            <span className="text-xs font-semibold text-indigo-300 bg-indigo-500/20 px-2 py-0.5 rounded-full">
              {memory.key}
            </span>
          )}
          {memory.category && (
            <span className="text-xs text-slate-500 bg-slate-700/40 px-2 py-0.5 rounded-full">
              {memory.category}
            </span>
          )}
          {memory.always && (
            <span className="text-xs text-amber-300 bg-amber-500/20 px-2 py-0.5 rounded-full">📌 pinned</span>
          )}
        </div>
        <p className="text-sm text-slate-300">{memory.value || memory.description}</p>
        {created && (
          <p className="text-[10px] text-slate-600 mt-1">{format(created, 'MMM d, yyyy')}</p>
        )}
      </div>
    </div>
  );
}
