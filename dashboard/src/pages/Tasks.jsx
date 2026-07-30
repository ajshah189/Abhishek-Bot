import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db, USER_ID } from '../config/firebase';
import TaskCard from '../components/TaskCard';
import { isPast, isToday } from 'date-fns';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  return new Date(ts);
}

const STATUSES = ['pending', 'completed', 'archived'];

export default function Tasks() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pending');
  const [sortBy, setSortBy] = useState('deadline');

  useEffect(() => {
    const q = query(collection(db, 'tasks'), where('userId', '==', USER_ID));
    const unsub = onSnapshot(q, snap => {
      setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const filtered = tasks
    .filter(t => t.status === filterStatus || (filterStatus === 'pending' && !t.status))
    .sort((a, b) => {
      if (sortBy === 'deadline') {
        const da = tsToDate(a.deadline);
        const db_ = tsToDate(b.deadline);
        if (!da && !db_) return 0;
        if (!da) return 1;
        if (!db_) return -1;
        return da - db_;
      }
      const pOrder = { high: 0, medium: 1, low: 2 };
      return (pOrder[a.priority] ?? 1) - (pOrder[b.priority] ?? 1);
    });

  const overdue = filtered.filter(t => {
    const d = tsToDate(t.deadline);
    return d && isPast(d) && !isToday(d) && t.status === 'pending';
  });
  const rest = filtered.filter(t => !overdue.includes(t));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-bold text-white">Tasks</h2>
        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="text-xs bg-[#1a1a2e] border border-white/10 text-slate-300 rounded-lg px-3 py-2 focus:outline-none"
          >
            <option value="deadline">Sort: Deadline</option>
            <option value="priority">Sort: Priority</option>
          </select>
        </div>
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-[#1a1a2e] rounded-lg p-1 w-fit">
        {STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setFilterStatus(s)}
            className={`text-xs px-3 py-1.5 rounded-md font-medium capitalize transition-colors ${
              filterStatus === s ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">No {filterStatus} tasks.</p>
      ) : (
        <div className="space-y-2">
          {overdue.length > 0 && (
            <>
              <p className="text-xs font-semibold text-rose-400 uppercase tracking-wider px-1 mt-4">Overdue ({overdue.length})</p>
              {overdue.map(t => <TaskCard key={t.id} task={t} />)}
              {rest.length > 0 && <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mt-4">Upcoming</p>}
            </>
          )}
          {rest.map(t => <TaskCard key={t.id} task={t} />)}
        </div>
      )}
    </div>
  );
}
