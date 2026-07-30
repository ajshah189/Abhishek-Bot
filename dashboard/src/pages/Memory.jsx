import { useState, useEffect } from 'react';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db, USER_ID } from '../config/firebase';
import MemoryItem from '../components/MemoryItem';
import { Search } from 'lucide-react';

export default function Memory() {
  const [memories, setMemories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'memories'), where('userId', '==', USER_ID));
    getDocs(q)
      .then(snap => {
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        data.sort((a, b) => {
          if (a.always && !b.always) return -1;
          if (!a.always && b.always) return 1;
          return 0;
        });
        setMemories(data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = memories.filter(m => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      (m.key || '').toLowerCase().includes(q) ||
      (m.value || '').toLowerCase().includes(q) ||
      (m.category || '').toLowerCase().includes(q) ||
      (m.description || '').toLowerCase().includes(q)
    );
  });

  const pinned = filtered.filter(m => m.always);
  const rest = filtered.filter(m => !m.always);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Memory</h2>
        <span className="text-sm text-slate-500">{memories.length} entries</span>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          placeholder="Search memories..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full bg-[#1a1a2e] border border-white/10 rounded-lg pl-9 pr-4 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-indigo-500/50"
        />
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-16 bg-white/5 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <p className="text-slate-500 text-sm text-center py-12">{search ? 'No matching memories.' : 'No memories stored yet.'}</p>
      ) : (
        <div className="space-y-2">
          {pinned.length > 0 && (
            <>
              <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider px-1">Pinned</p>
              {pinned.map(m => <MemoryItem key={m.id} memory={m} />)}
              {rest.length > 0 && <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1 mt-4">All Memories</p>}
            </>
          )}
          {rest.map(m => <MemoryItem key={m.id} memory={m} />)}
        </div>
      )}
    </div>
  );
}
