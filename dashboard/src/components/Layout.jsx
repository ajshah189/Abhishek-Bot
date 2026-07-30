import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, CheckSquare, DollarSign,
  Target, Brain, Menu, Mic
} from 'lucide-react';
import { useState } from 'react';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/tasks', icon: CheckSquare, label: 'Tasks' },
  { to: '/expenses', icon: DollarSign, label: 'Expenses' },
  { to: '/habits', icon: Target, label: 'Habits' },
  { to: '/memory', icon: Brain, label: 'Memory' },
  { to: '/voice', icon: Mic, label: 'Voice' },
];

const linkClass = ({ isActive }) =>
  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all ${
    isActive
      ? 'bg-indigo-600/30 text-indigo-300 border border-indigo-500/30'
      : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
  }`;

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const sidebar = (
    <div className="flex flex-col h-full p-4 gap-1">
      <div className="px-4 py-5 mb-2">
        <h1 className="text-lg font-bold text-white tracking-tight">Abhishek</h1>
        <p className="text-xs text-slate-500 mt-0.5">Personal Dashboard</p>
      </div>
      {NAV.map(({ to, icon: Icon, label }) => (
        <NavLink key={to} to={to} end={to === '/'} className={linkClass} onClick={() => setMobileOpen(false)}>
          <Icon size={17} />
          {label}
        </NavLink>
      ))}
    </div>
  );

  return (
    <div className="flex min-h-screen bg-[#0f0f1a]">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 bg-[#1a1a2e] border-r border-white/5">
        {sidebar}
      </aside>

      {/* Mobile sidebar overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden">
          <div className="w-56 bg-[#1a1a2e] border-r border-white/5 flex flex-col">{sidebar}</div>
          <div className="flex-1 bg-black/60" onClick={() => setMobileOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile topbar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#1a1a2e] border-b border-white/5">
          <button onClick={() => setMobileOpen(true)} className="text-slate-400 hover:text-white">
            <Menu size={20} />
          </button>
          <span className="text-sm font-semibold text-white">Abhishek Dashboard</span>
        </div>

        <main className="flex-1 p-4 md:p-6 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
