
import React from 'react';
import { View } from '../types';
import { ICONS } from '../constants';

interface SidebarProps {
  currentView: View;
  setCurrentView: (view: View) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setCurrentView }) => {
  const navItems = [
    { id: View.DASHBOARD, label: 'Overview', icon: ICONS.Dashboard },
    { id: View.REMINDERS, label: 'Reminders', icon: ICONS.Reminders },
    { id: View.HABITS, label: 'Habit Tracker', icon: ICONS.Habits },
    { id: View.PASSWORDS, label: 'Vault', icon: ICONS.Passwords },
    { id: View.WATCH_LATER, label: 'Watch Later', icon: ICONS.WatchLater },
    { id: View.FINANCE, label: 'Finance', icon: ICONS.Finance },
  ];

  return (
    <aside className="w-20 md:w-64 flex flex-col h-screen shrink-0 relative z-10 bg-transparent text-white pt-4">
      <div className="p-6 flex items-center gap-3 mb-6">
        <div className="size-10 bg-white rounded-full flex items-center justify-center text-slate-800 font-bold">
          <span className="text-xs">aved</span>
        </div>
        <div>
          <h1 className="hidden md:block text-xl font-bold text-white leading-tight">LifeSync</h1>
          <p className="hidden md:block text-[8px] font-bold text-white/50 tracking-widest uppercase">Ultimate V2.0</p>
        </div>
      </div>

      <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            className={`w-full flex items-center gap-4 px-6 py-3 rounded-full transition-all ${currentView === item.id
              ? 'bg-white/20 text-white font-bold'
              : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
          >
            <item.icon />
            <span className="hidden md:block text-sm font-semibold">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="p-4">
        <button
          onClick={() => setCurrentView(View.SETTINGS)}
          className={`w-full flex items-center gap-4 px-6 py-3 rounded-full transition-all ${currentView === View.SETTINGS
            ? 'bg-white/20 text-white font-bold'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
        >
          <ICONS.Settings />
          <span className="hidden md:block text-sm font-semibold">Settings</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
