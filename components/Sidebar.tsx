
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
    <aside className="fixed bottom-0 inset-x-0 h-[72px] md:relative md:h-screen w-full md:w-20 lg:w-64 flex flex-row md:flex-col shrink-0 z-[100] bg-slate-900/95 backdrop-blur-md md:bg-transparent text-white pt-0 md:pt-4 border-t border-white/10 md:border-none">
      <div className="hidden md:flex p-6 items-center gap-3 mb-6">
        <div className="size-10 bg-slate-800 rounded-full flex items-center justify-center text-slate-800 font-bold shrink-0 overflow-hidden">
          <img src="/logo.png" alt="LifeSync" className="w-full h-full object-cover" />
        </div>
        <div>
          <h1 className="hidden lg:block text-xl font-bold text-white leading-tight">LifeSync</h1>
          <p className="hidden lg:block text-[8px] font-bold text-white/50 tracking-widest uppercase">Ultimate</p>
        </div>
      </div>

      <nav className="flex-1 flex flex-row md:flex-col items-center justify-start md:justify-start px-2 md:px-4 py-0 md:py-6 space-x-1 md:space-x-0 md:space-y-2 overflow-x-auto md:overflow-x-hidden md:overflow-y-auto no-scrollbar md:custom-scrollbar">
        {navItems.map((item) => (
          <button
            key={item.id}
            onClick={() => setCurrentView(item.id)}
            title={item.label}
            className={`flex-shrink-0 flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-4 px-3 md:px-6 py-2 md:py-3 rounded-2xl md:rounded-full transition-all ${currentView === item.id
              ? 'bg-white/20 text-white font-bold md:w-full'
              : 'text-white/70 hover:bg-white/10 hover:text-white md:w-full'
              }`}
          >
            <item.icon />
            <span className="text-[10px] md:text-sm font-semibold block md:hidden lg:block whitespace-nowrap">{item.label}</span>
          </button>
        ))}
        {/* Settings button specifically in the mobile nav */}
        <button
          onClick={() => setCurrentView(View.SETTINGS)}
          className={`flex-shrink-0 flex md:hidden flex-col items-center justify-center gap-1 px-3 py-2 rounded-2xl transition-all ${currentView === View.SETTINGS
            ? 'bg-white/20 text-white font-bold'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
        >
          <ICONS.Settings />
          <span className="text-[10px] font-semibold block whitespace-nowrap">Settings</span>
        </button>
      </nav>

      <div className="hidden md:block p-4 mt-auto">
        <button
          onClick={() => setCurrentView(View.SETTINGS)}
          className={`w-full flex items-center gap-4 px-6 py-3 rounded-full transition-all ${currentView === View.SETTINGS
            ? 'bg-white/20 text-white font-bold'
            : 'text-white/70 hover:bg-white/10 hover:text-white'
            }`}
        >
          <ICONS.Settings />
          <span className="hidden lg:block text-sm font-semibold">Settings</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
