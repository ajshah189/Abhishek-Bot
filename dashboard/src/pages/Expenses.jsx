import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy, getDoc, doc } from 'firebase/firestore';
import { db, USER_ID } from '../config/firebase';
import ExpenseChart from '../components/ExpenseChart';
import { format } from 'date-fns';

function tsToDate(ts) {
  if (!ts) return null;
  if (ts.toDate) return ts.toDate();
  return new Date(ts);
}

const DEFAULT_BUDGETS = { food: 8000, travel: 5000, shopping: 5000, education: 3000, health: 3000, other: 3000 };

export default function Expenses() {
  const [expenses, setExpenses] = useState([]);
  const [budgets, setBudgets] = useState(DEFAULT_BUDGETS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const q = query(
      collection(db, 'expenses'),
      where('userId', '==', USER_ID),
      where('date', '>=', since)
    );
    const unsub = onSnapshot(q, snap => {
      const data = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => tsToDate(b.date) - tsToDate(a.date));
      setExpenses(data);
      setLoading(false);
    }, () => setLoading(false));

    // Load budgets
    getDoc(doc(db, 'settings', `budgets_${USER_ID}`))
      .then(d => { if (d.exists()) setBudgets({ ...DEFAULT_BUDGETS, ...d.data() }); })
      .catch(() => {});

    return unsub;
  }, []);

  const summary = {};
  expenses.forEach(e => {
    const cat = e.category || 'other';
    summary[cat] = (summary[cat] || 0) + (e.amount || 0);
  });
  const total = Object.values(summary).reduce((s, v) => s + v, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">Expenses</h2>
        <span className="text-sm text-slate-400">Last 30 days</span>
      </div>

      {/* Total */}
      <div className="p-5 rounded-xl border border-amber-500/20 bg-amber-500/5">
        <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Total This Month</p>
        <p className="text-4xl font-bold text-white">₹{Math.round(total).toLocaleString('en-IN')}</p>
      </div>

      {/* Chart */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">By Category</h3>
        {loading ? (
          <div className="h-48 bg-white/5 rounded-lg animate-pulse" />
        ) : (
          <ExpenseChart data={summary} budgets={budgets} />
        )}
      </div>

      {/* Budget vs actual */}
      {!loading && Object.keys(summary).length > 0 && (
        <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Budget vs Actual</h3>
          <div className="space-y-3">
            {Object.entries(summary).map(([cat, spent]) => {
              const budget = budgets[cat] || 0;
              const pct = budget ? Math.min(Math.round((spent / budget) * 100), 100) : 0;
              const over = budget && spent > budget;
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-300 capitalize">{cat}</span>
                    <span className={over ? 'text-rose-400' : 'text-slate-400'}>
                      ₹{Math.round(spent).toLocaleString()} {budget ? `/ ₹${budget.toLocaleString()}` : ''}
                    </span>
                  </div>
                  <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${over ? 'bg-rose-500' : pct > 80 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Transactions table */}
      <div className="bg-[#1a1a2e] rounded-xl border border-white/5 p-5">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Transactions</h3>
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-white/5 rounded animate-pulse" />)}</div>
        ) : expenses.length === 0 ? (
          <p className="text-slate-500 text-sm text-center py-6">No expenses recorded.</p>
        ) : (
          <div className="space-y-1">
            {expenses.map(e => (
              <div key={e.id} className="flex items-center gap-3 py-2.5 border-b border-white/4 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-slate-200 truncate">{e.description || e.merchant || '—'}</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {e.date && format(tsToDate(e.date), 'MMM d')} · <span className="capitalize">{e.category}</span>
                  </p>
                </div>
                <span className="text-sm font-semibold text-amber-300 shrink-0">₹{e.amount?.toLocaleString('en-IN')}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
