import { format, isPast, isToday } from 'date-fns';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  return new Date(ts);
}

const PRIORITY = {
  high: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
  medium: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  low: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
};

const STATUS = {
  pending: 'bg-indigo-500/20 text-indigo-300',
  completed: 'bg-emerald-500/20 text-emerald-300',
  archived: 'bg-slate-500/20 text-slate-400',
};

export default function TaskCard({ task }) {
  const deadline = tsToDate(task.deadline);
  const overdue = deadline && isPast(deadline) && task.status === 'pending' && !isToday(deadline);
  const dueToday = deadline && isToday(deadline);

  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg border transition-colors ${
      overdue ? 'border-rose-500/30 bg-rose-500/5' :
      dueToday ? 'border-amber-500/30 bg-amber-500/5' :
      'border-white/5 bg-white/2 hover:bg-white/5'
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-1">
          <span className="text-sm font-medium text-slate-200 truncate">{task.title}</span>
          {overdue && <span className="text-[10px] font-semibold text-rose-400 bg-rose-500/20 px-2 py-0.5 rounded-full">OVERDUE</span>}
          {dueToday && <span className="text-[10px] font-semibold text-amber-400 bg-amber-500/20 px-2 py-0.5 rounded-full">TODAY</span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap text-[11px]">
          {deadline && (
            <span className={overdue ? 'text-rose-400' : 'text-slate-500'}>
              {format(deadline, 'MMM d, yyyy')}
            </span>
          )}
          {!deadline && <span className="text-slate-600">No deadline</span>}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1 shrink-0">
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY[task.priority] || PRIORITY.medium}`}>
          {task.priority || 'medium'}
        </span>
        <span className={`text-[10px] px-2 py-0.5 rounded-full ${STATUS[task.status] || STATUS.pending}`}>
          {task.status || 'pending'}
        </span>
      </div>
    </div>
  );
}
