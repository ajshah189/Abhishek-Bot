import { format } from 'date-fns';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  return new Date(ts);
}

export default function ActivityFeed({ turns }) {
  if (!turns.length) {
    return <p className="text-slate-500 text-sm text-center py-8">No conversation history yet.</p>;
  }

  // Group consecutive turns into exchanges
  const exchanges = [];
  let i = 0;
  while (i < turns.length) {
    const t = turns[i];
    if (t.role === 'user') {
      const next = turns[i + 1];
      exchanges.push({ user: t, assistant: next?.role === 'assistant' ? next : null });
      i += next?.role === 'assistant' ? 2 : 1;
    } else {
      i++;
    }
  }

  return (
    <div className="space-y-4">
      {exchanges.slice(0, 8).map((ex, idx) => (
        <div key={idx} className="space-y-2">
          {/* User message */}
          <div className="flex gap-3 items-start">
            <span className="shrink-0 w-7 h-7 rounded-full bg-indigo-600/30 border border-indigo-500/30 flex items-center justify-center text-xs text-indigo-300 font-bold">A</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-slate-300 leading-relaxed">{ex.user.content}</p>
              {ex.user.timestamp && (
                <p className="text-[10px] text-slate-600 mt-1">
                  {format(tsToDate(ex.user.timestamp), 'MMM d, h:mm a')}
                </p>
              )}
            </div>
          </div>
          {/* Assistant reply */}
          {ex.assistant && (
            <div className="flex gap-3 items-start pl-4">
              <span className="shrink-0 w-7 h-7 rounded-full bg-violet-600/30 border border-violet-500/30 flex items-center justify-center text-xs text-violet-300 font-bold">🤖</span>
              <p className="text-sm text-slate-400 leading-relaxed">{ex.assistant.content.slice(0, 200)}{ex.assistant.content.length > 200 ? '…' : ''}</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
