import { useState, useEffect } from 'react';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs } from 'firebase/firestore';
import { db, USER_ID } from '../config/firebase';
import SummaryCard from '../components/SummaryCard';
import ActivityFeed from '../components/ActivityFeed';
import { isToday, isPast } from 'date-fns';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  return new Date(ts);
}

export default function Dashboard() {
  const [tasks, setTasks] = useState([]);
  const [expenses, setExpenses] = useState({});
  const [habits, setHabits] = useState([]);
  const [turns, setTurns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const unsubs = [];
    try {
      // Tasks
      const tq = query(collection(db, 'tasks'), where('userId', '==', USER_ID));
      unsubs.push(onSnapshot(tq, snap => {
        setTasks(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }));

      // Expenses (last 30 days)
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const eq = query(collection(db, 'expenses'), where('userId', '==', USER_ID), where('date', '>=', since));
      unsubs.push(onSnapshot(eq, snap => {
        const summary = {};
        snap.docs.forEach(d => {
          const e = d.data();
          summary[e.category || 'other'] = (summary[e.category || 'other'] || 0) + (e.amount || 0);
        });
        setExpenses(summary);
      }));

      // Habits
      const hq = query(collection(db, 'habits'), where('userId', '==', USER_ID));
      unsubs.push(onSnapshot(hq, snap => {
        setHabits(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }));

      // Conversation logs
      const cq = query(
        collection(db, 'conversation_logs'),
        where('userId', '==', USER_ID),
        orderBy('timestamp', 'desc'),
        limit(20)
      );
      unsubs.push(onSnapshot(cq, snap => {
        const data = snap.docs.map(d => d.data()).reverse();
        setTurns(data);
        setLoading(false);
      }));
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }

    return () => unsubs.forEach(u => u());
  }, []);

  const pendingTasks = tasks.filter(t => t.status === 'pending');
  const dueTodayTasks = pendingTasks.filter(t => {
    const d = tsToDate(t.deadline);
    return d && isToday(d);
  });
  const overdueTasks = pendingTasks.filter(t => {
    const d = tsToDate(t.deadline);
    return d && isPast(d) && !isToday(d);
  });
  const totalSpend = Object.values(expenses).reduce((s, v) => s + v, 0);

  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-rose-400 text-sm font-medium mb-2">Failed to connect to Firestore</p>
        <p className="text-slate-500 text-xs">{error}</p>
        <p className="text-slate-600 text-xs mt-2">Check your Firebase config in src/config/firebase.js</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Good {getGreeting()}</h2>
        <p className="text-slate-500 text-sm">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard icon="📋" label="Pending Tasks" value={loading ? '—' : pendingTasks.length} sub={dueTodayTasks.length > 0 ? `${dueTodayTasks.length} due today` : undefined} color="indigo" />
        <SummaryCard icon="🔴" label="Overdue" value={loading ? '—' : overdueTasks.length} sub="need attention" color="rose" />
        <SummaryCard icon="💰" label="Monthly Spend" value={loading ? '—' : `₹${Math.round(totalSpend).toLocaleString('en-IN')}`} color="amber" />
        <SummaryCard icon="🎯" label="Active Habits" value={loading ? '—' : habits.length} color="emerald" />
      </div>

      {/* Activity feed */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Recent Conversations</h3>
        {loading ? (
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-10 bg-white/5 rounded-lg animate-pulse" />)}
          </div>
        ) : (
          <ActivityFeed turns={turns} />
        )}
      </div>
    </div>
  );
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}
