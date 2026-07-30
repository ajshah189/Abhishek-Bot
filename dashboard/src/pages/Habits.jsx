import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db, USER_ID } from '../config/firebase';
import HabitCard from '../components/HabitCard';

export default function Habits() {
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'habits'), where('userId', '==', USER_ID));
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (b.streak || 0) - (a.streak || 0));
      setHabits(data);
      setLoading(false);
    }, () => setLoading(false));
    return unsub;
  }, []);

  const totalStreak = habits.reduce((s, h) => s + (h.streak || 0), 0);
  const bestStreak = habits.reduce((m, h) => Math.max(m, h.streak || 0), 0);

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-white">Habits</h2>

      {!loading && habits.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          <div className="p-4 rounded-xl bg-[#1a1a2e] border border-white/5 text-center">
            <p className="text-2xl font-bold text-white">{habits.length}</p>
            <p className="text-xs text-slate-500 mt-1">Active habits</p>
          </div>
          <div className="p-4 rounded-xl bg-[#1a1a2e] border border-white/5 text-center">
            <p className="text-2xl font-bold text-white">🔥 {bestStreak}</p>
            <p className="text-xs text-slate-500 mt-1">Best streak</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="grid sm:grid-cols-2 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="h-36 bg-white/5 rounded-xl animate-pulse" />)}
        </div>
      ) : habits.length === 0 ? (
        <div className="text-center py-16">
          <p className="text-slate-500 text-sm">No habits yet.</p>
          <p className="text-slate-600 text-xs mt-1">Tell your bot "Add a habit to meditate daily"</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {habits.map(h => <HabitCard key={h.id} habit={h} />)}
        </div>
      )}
    </div>
  );
}
