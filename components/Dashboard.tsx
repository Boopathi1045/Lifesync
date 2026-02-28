
import React from 'react';
import { Reminder, Account, Friend, View } from '../types';

interface DashboardProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  waterIntake: number;
  setWaterIntake: (val: number | ((prev: number) => number)) => void;
  waterGoal: number;
  accounts: Account[];
  friends: Friend[];
  setCurrentView: (view: View) => void;
  saveReminderToDB: (reminder: Reminder) => Promise<void>;
}

const Dashboard: React.FC<DashboardProps> = ({
  reminders,
  setReminders,
  waterIntake,
  setWaterIntake,
  waterGoal,
  accounts,
  friends,
  setCurrentView,
  saveReminderToDB
}) => {
  const totalReceivable = friends.filter(f => f.netBalance > 0).reduce((acc, curr) => acc + curr.netBalance, 0);
  const totalPayable = Math.abs(friends.filter(f => f.netBalance < 0).reduce((acc, curr) => acc + curr.netBalance, 0));

  const upcomingReminders = reminders.filter(r => !r.isDone).slice(0, 4);

  const handleReminderAction = async (id: string, action: 'DONE' | 'SKIP' | 'SNOOZE') => {
    const r = reminders.find(item => item.id === id);
    if (!r) return;

    let updated: Reminder = { ...r };
    if (action === 'DONE') updated.isDone = true;
    if (action === 'SNOOZE') {
      const newDate = new Date(r.dueDate);
      newDate.setMinutes(newDate.getMinutes() + 30);
      updated.dueDate = newDate.toISOString();
    }
    if (action === 'SKIP') {
      const nextDay = new Date(r.dueDate);
      nextDay.setDate(nextDay.getDate() + 1);
      updated.dueDate = nextDay.toISOString();
    }

    setReminders(prev => prev.map(item => item.id === id ? updated : item));
    await saveReminderToDB(updated);
  };

  return (
    <div className="p-6 md:p-10 space-y-8 max-w-7xl mx-auto pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4 text-white">
        <div>
          <h2 className="text-4xl font-black heading-gradient pb-1">Daily Pulse</h2>
          <p className="text-white/70 mt-1">Ready to seize the day? Here's your snapshot.</p>
        </div>
        <div className="text-right hidden md:block">
          <p className="text-sm font-bold text-white/50 uppercase tracking-widest">Today</p>
          <p className="text-lg font-black">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
        </div>
      </header>

      {/* Hero Welcome Banner */}
      <div className="w-full h-72 md:h-96 rounded-[2.5rem] overflow-hidden relative shadow-sm border border-white/5">
        <img src="/hero.jpg" alt="AI Workspace Banner" className="w-full h-full object-cover object-[50%_25%]" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b1121] via-[#0b1121]/40 to-transparent flex flex-col justify-end p-8 md:p-10 pointer-events-none">
          <h3 className="text-2xl md:text-4xl font-black text-white mb-2 shadow-sm">Your AI Copilot is Ready</h3>
          <p className="text-white/80 font-bold text-sm md:text-base max-w-xl">Supercharge your productivity, track your habits, and sync your life seamlessly with your new intelligent assistant.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Upcoming Reminders Section */}
        <div className="lg:col-span-1 bg-white p-8 rounded-[2.5rem] flex flex-col h-full shadow-sm text-slate-900">
          <div className="flex items-center justify-between mb-8">
            <h3 className="font-extrabold text-xl tracking-tight">Reminders</h3>
            <button
              onClick={() => setCurrentView(View.REMINDERS)}
              className="text-xs font-black text-slate-400 hover:text-slate-900 uppercase tracking-wider transition-colors"
            >
              View All
            </button>
          </div>

          <div className="space-y-4 flex-1 overflow-y-auto custom-scrollbar max-h-[400px] pr-2">
            {upcomingReminders.length > 0 ? upcomingReminders.map(reminder => (
              <div key={reminder.id} className="p-5 bg-slate-50/80 rounded-[1.5rem] border border-transparent hover:border-slate-200 transition-all">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={`size-2.5 rounded-full ${reminder.category === 'WORK' ? 'bg-orange-400' : 'bg-slate-800'}`} />
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{reminder.category}</span>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400">{new Date(reminder.dueDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <h4 className="font-bold text-sm mb-4 line-clamp-1">{reminder.title}</h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleReminderAction(reminder.id, 'DONE')}
                    className="flex-1 py-2.5 btn-primary rounded-xl text-[10px]"
                  >
                    Done
                  </button>
                  <button
                    onClick={() => handleReminderAction(reminder.id, 'SKIP')}
                    className="flex-1 py-2.5 rounded-xl bg-slate-200/50 text-slate-600 text-[10px] font-black hover:bg-slate-200 transition-colors"
                  >
                    Skip
                  </button>
                  <button
                    onClick={() => handleReminderAction(reminder.id, 'SNOOZE')}
                    className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 text-[10px] font-black hover:bg-slate-50 transition-colors"
                  >
                    Snooze
                  </button>
                </div>
              </div>
            )) : (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400 opacity-50">
                <p className="font-bold text-sm">No upcoming tasks</p>
              </div>
            )}
          </div>
        </div>

        {/* Habit Snapshot (Hydration) */}
        <div
          onClick={() => setCurrentView(View.HABITS)}
          className="cursor-pointer bg-[#fce1cd] text-slate-900 border-none p-8 rounded-[2.5rem] shadow-sm hover:shadow-md transition-shadow flex flex-col items-center justify-between"
        >
          <div className="w-full flex justify-between items-start mb-4">
            <h3 className="font-extrabold text-xl tracking-tight">Hydration</h3>
            <div className="bg-white/50 text-orange-600 px-3 py-1.5 rounded-full flex items-center gap-1.5">
              <span className="font-black text-[10px] uppercase tracking-widest">🔥 12 Streak</span>
            </div>
          </div>

          <div className="relative size-44 group-hover:scale-105 transition-transform">
            <svg className="size-full" viewBox="0 0 100 100">
              <circle className="text-white/60" strokeWidth="8" stroke="currentColor" fill="transparent" r="44" cx="50" cy="50" />
              <circle className="text-orange-500 transition-all duration-1000" strokeWidth="8" strokeDasharray={2 * Math.PI * 44} strokeDashoffset={2 * Math.PI * 44 * (1 - waterIntake / waterGoal)} strokeLinecap="round" stroke="currentColor" fill="transparent" r="44" cx="50" cy="50" style={{ transformOrigin: 'center', transform: 'rotate(-90deg)' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-5xl font-black">{waterIntake}</span>
              <span className="text-[11px] text-slate-500 uppercase font-black tracking-widest mt-1">of {waterGoal}</span>
            </div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setWaterIntake(prev => Math.min(waterGoal, prev + 1));
            }}
            className="mt-6 w-full py-4 text-xs font-black bg-white text-slate-900 rounded-2xl hover:bg-slate-50 transition-colors shadow-sm"
          >
            + Add Glass
          </button>
        </div>

        {/* Finance Snapshot */}
        <div
          onClick={() => setCurrentView(View.FINANCE)}
          className="cursor-pointer bg-white border-none p-8 rounded-[2.5rem] shadow-sm flex flex-col text-slate-900 hover:shadow-md transition-shadow relative overflow-hidden"
        >
          <div className="mb-6 relative z-10">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-extrabold text-xl tracking-tight">Accounts</h3>
              <div className="size-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                <span className="material-symbols-rounded">account_balance_wallet</span>
              </div>
            </div>

            <div className="space-y-3 max-h-[160px] overflow-y-auto custom-scrollbar pr-2">
              {accounts.map(acc => (
                <div key={acc.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <span className="text-xs font-bold text-slate-600">{acc.name}</span>
                  <span className="text-sm font-black tracking-tight">₹{acc.balance.toLocaleString()}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-auto relative z-10 pt-4">
            <div className={`p-4 rounded-2xl border flex flex-col justify-center ${totalReceivable > 0 ? 'bg-[#c1e5ed] border-transparent' : 'bg-slate-50 border-slate-100'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Receivables</p>
              <p className="text-sm font-bold leading-tight">
                {totalReceivable > 0 ? `Receive ₹${totalReceivable.toFixed(0)}` : "No pending returns"}
              </p>
            </div>
            <div className={`p-4 rounded-2xl border flex flex-col justify-center ${totalPayable > 0 ? 'bg-[#fce1cd] border-transparent' : 'bg-slate-50 border-slate-100'}`}>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-1">Payables</p>
              <p className="text-sm font-bold leading-tight">
                {totalPayable > 0 ? `You owe ₹${totalPayable.toFixed(0)}` : "All debts cleared"}
              </p>
            </div>
          </div>
        </div>

      </div>

      <div className="bg-[#c1e5ed] text-slate-900 border-none p-6 rounded-[2rem] flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm mt-8">
        <div className="flex items-center gap-4">
          <div className="size-12 rounded-full bg-white flex items-center justify-center text-slate-800 text-xl font-bold">✨</div>
          <div>
            <h4 className="font-bold">Need to focus?</h4>
            <p className="text-xs text-slate-600">Activate Work Mode to silence everything but essentials.</p>
          </div>
        </div>
        <button
          onClick={() => setCurrentView(View.SETTINGS)}
          className="bg-white px-8 py-4 font-black text-xs text-slate-900 rounded-2xl hover:bg-slate-50 transition-all shadow-sm"
        >
          Configure Focus
        </button>
      </div>
    </div>
  );
};

export default Dashboard;
