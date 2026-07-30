import { format, subDays, isSameDay } from 'date-fns';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  return new Date(ts);
}

export default function HabitCard({ habit }) {
  const streak = habit.streak || 0;
  const lastCompleted = tsToDate(habit.lastCompleted);
  const completedDates = (habit.completionHistory || []).map(tsToDate).filter(Boolean);

  // Last 7 days dots
  const dots = Array.from({ length: 7 }).map((_, i) => {
    const day = subDays(new Date(), 6 - i);
    const done = completedDates.some(d => isSameDay(d, day));
    return { day, done };
  });

  return (
    <div className="p-5 rounded-xl border border-white/5 bg-[#1a1a2e] hover:border-white/10 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {streak >= 7 && <span className="text-base">🔥</span>}
            {streak >= 3 && streak < 7 && <span className="text-base">✨</span>}
            <h3 className="text-sm font-semibold text-slate-200 truncate">{habit.name || habit.title}</h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 capitalize">{habit.frequency || habit.recurrence || 'daily'}</p>
        </div>
        <div className="text-right shrink-0 ml-3">
          <p className="text-xl font-bold text-white">{streak}</p>
          <p className="text-[10px] text-slate-500">day streak</p>
        </div>
      </div>

      {/* 7-day dots */}
      <div className="flex gap-1.5 mt-3">
        {dots.map(({ day, done }, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className={`w-5 h-5 rounded-full ${done ? 'bg-emerald-500' : 'bg-slate-700'}`} />
            <span className="text-[9px] text-slate-600">{format(day, 'E')[0]}</span>
          </div>
        ))}
      </div>

      {lastCompleted && (
        <p className="text-[10px] text-slate-600 mt-3">
          Last done: {format(lastCompleted, 'MMM d, h:mm a')}
        </p>
      )}
    </div>
  );
}
