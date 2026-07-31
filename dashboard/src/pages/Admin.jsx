import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, USER_ID } from '../config/firebase';
import {
  BarChart, Bar, LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid
} from 'recharts';

export default function Admin() {
  const [stats, setStats] = useState({ tasks: 0, expenses: 0, habits: 0, contacts: 0, memories: 0 });
  const [msgPerDay, setMsgPerDay] = useState([]);
  const [spendPerDay, setSpendPerDay] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

        // Stat counts
        const [tasksSnap, expSnap, habSnap, contSnap, memSnap] = await Promise.all([
          getDocs(query(collection(db, 'tasks'), where('userId', '==', USER_ID))),
          getDocs(query(collection(db, 'expenses'), where('userId', '==', USER_ID))),
          getDocs(query(collection(db, 'habits'), where('userId', '==', USER_ID))),
          getDocs(query(collection(db, 'contacts'), where('userId', '==', USER_ID))),
          getDocs(query(collection(db, 'memories'), where('userId', '==', USER_ID))),
        ]);
        setStats({
          tasks: tasksSnap.size,
          expenses: expSnap.size,
          habits: habSnap.size,
          contacts: contSnap.size,
          memories: memSnap.size,
        });

        // Messages per day (last 30 days from conversation_logs)
        const logsSnap = await getDocs(
          query(
            collection(db, 'conversation_logs'),
            where('userId', '==', USER_ID),
            where('timestamp', '>=', since30),
            orderBy('timestamp', 'asc'),
            limit(1000)
          )
        );
        const dayCount = {};
        logsSnap.docs.forEach(d => {
          const ts = d.data().timestamp;
          const date = ts?.toDate ? ts.toDate() : new Date(ts);
          const key = date.toISOString().slice(0, 10);
          dayCount[key] = (dayCount[key] || 0) + 1;
        });
        const msgData = Object.entries(dayCount).map(([date, count]) => ({ date: date.slice(5), count }));
        setMsgPerDay(msgData);

        // Daily spending (last 30 days from expenses)
        const spendMap = {};
        expSnap.docs.forEach(d => {
          const data = d.data();
          const ts = data.createdAt || data.date;
          if (!ts) return;
          const date = ts?.toDate ? ts.toDate() : new Date(ts);
          if (date < since30) return;
          const key = date.toISOString().slice(0, 10);
          spendMap[key] = (spendMap[key] || 0) + (data.amount || 0);
        });
        const spendData = Object.entries(spendMap)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, amount]) => ({ date: date.slice(5), amount: Math.round(amount) }));
        setSpendPerDay(spendData);
      } catch (err) {
        console.error('Admin data load failed', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const STAT_CARDS = [
    { label: 'Tasks', value: stats.tasks, icon: '📋', color: 'indigo' },
    { label: 'Expenses', value: stats.expenses, icon: '💰', color: 'amber' },
    { label: 'Habits', value: stats.habits, icon: '🎯', color: 'emerald' },
    { label: 'Contacts', value: stats.contacts, icon: '📱', color: 'blue' },
    { label: 'Memories', value: stats.memories, icon: '🧠', color: 'purple' },
  ];

  const colors = {
    indigo: 'border-indigo-500/30 text-indigo-300',
    amber: 'border-amber-500/30 text-amber-300',
    emerald: 'border-emerald-500/30 text-emerald-300',
    blue: 'border-blue-500/30 text-blue-300',
    purple: 'border-purple-500/30 text-purple-300',
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-white mb-1">Admin Dashboard</h2>
        <p className="text-slate-500 text-sm">Data overview — last 30 days</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {STAT_CARDS.map(({ label, value, icon, color }) => (
          <div
            key={label}
            className={`bg-[#1a1a2e] rounded-xl border p-4 ${colors[color]}`}
          >
            <div className="text-2xl mb-2">{icon}</div>
            <div className="text-2xl font-bold text-white">{loading ? '—' : value}</div>
            <div className="text-xs text-slate-400 mt-1">{label}</div>
          </div>
        ))}
      </div>

      {/* Messages per day */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Messages Per Day (last 30 days)</h3>
        {loading ? (
          <div className="h-48 bg-white/5 rounded-lg animate-pulse" />
        ) : msgPerDay.length === 0 ? (
          <p className="text-slate-500 text-sm">No conversation data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={msgPerDay} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid #ffffff10', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#818cf8' }}
              />
              <Bar dataKey="count" fill="#6366f1" radius={[3, 3, 0, 0]} name="Messages" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily spending */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Daily Spending ₹ (last 30 days)</h3>
        {loading ? (
          <div className="h-48 bg-white/5 rounded-lg animate-pulse" />
        ) : spendPerDay.length === 0 ? (
          <p className="text-slate-500 text-sm">No expense data yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={spendPerDay} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff08" />
              <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} />
              <Tooltip
                contentStyle={{ background: '#1a1a2e', border: '1px solid #ffffff10', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#f59e0b' }}
              />
              <Line type="monotone" dataKey="amount" stroke="#f59e0b" strokeWidth={2} dot={false} name="Amount (₹)" />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
