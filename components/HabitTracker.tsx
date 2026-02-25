
import React, { useState } from 'react';

interface HabitTrackerProps {
  waterIntake: number;
  setWaterIntake: (val: number | ((prev: number) => number)) => void;
  waterGoal: number;
}

const HabitTracker: React.FC<HabitTrackerProps> = ({ waterIntake, setWaterIntake, waterGoal }) => {
  const [analyticsTab, setAnalyticsTab] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
  const [showManualInput, setShowManualInput] = useState(false);
  const [tempIntake, setTempIntake] = useState(waterIntake.toString());

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(tempIntake);
    if (!isNaN(val)) {
      setWaterIntake(val);
      setShowManualInput(false);
    }
  };

  const weeklyData = [
    { day: 'Mon', val: 7 },
    { day: 'Tue', val: 8 },
    { day: 'Wed', val: 5 },
    { day: 'Thu', val: 8 },
    { day: 'Fri', val: 9 },
    { day: 'Sat', val: 4 },
    { day: 'Sun', val: waterIntake },
  ];

  const monthlyData = Array.from({ length: 30 }, (_, i) => ({
    day: i + 1,
    val: Math.floor(Math.random() * 5) + 4,
  }));

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="text-white">
          <h2 className="text-4xl font-black pb-1">Water Intake</h2>
          <p className="text-white/70 mt-1">Consistency is key to health. Keep the streak alive!</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => {
              setTempIntake(waterIntake.toString());
              setShowManualInput(true);
            }}
            className="bg-white/10 text-white px-5 py-2.5 font-bold text-[10px] hover:bg-white/20 transition-all uppercase tracking-widest rounded-full"
          >
            Manual Entry
          </button>
          <div className="bg-white/50 text-[#a86539] px-5 py-2.5 flex items-center gap-2 rounded-full">
            <span className="material-symbols-rounded text-base">local_fire_department</span>
            <span className="font-black text-[10px] uppercase tracking-widest">12 Day Streak</span>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Progress Card */}
        <div className="lg:col-span-7 bg-[#c1e5ed] p-12 text-slate-900 rounded-[3rem] shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-white/40">
            <div className="h-full bg-orange-400 transition-all duration-1000" style={{ width: `${Math.min(100, (waterIntake / waterGoal) * 100)}%` }} />
          </div>

          <div className="relative size-64 mb-10 mt-6">
            <svg className="size-full -rotate-90" viewBox="0 0 100 100">
              <circle className="text-white/60" strokeWidth="8" stroke="currentColor" fill="transparent" r="44" cx="50" cy="50" />
              <circle
                className="text-orange-400 transition-all duration-1000 ease-out"
                strokeWidth="8"
                strokeDasharray={2 * Math.PI * 44}
                strokeDashoffset={2 * Math.PI * 44 * (1 - waterIntake / waterGoal)}
                strokeLinecap="round"
                stroke="currentColor"
                fill="transparent"
                r="44" cx="50" cy="50"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-7xl font-black leading-none text-slate-900">{waterIntake}</span>
              <span className="text-xs text-[#5f7f8a] font-black uppercase tracking-widest mt-2">{((waterIntake / waterGoal) * 100).toFixed(0)}% Level</span>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <button
              onClick={() => setWaterIntake(Math.max(0, waterIntake - 1))}
              className="size-16 bg-white/50 text-slate-900 rounded-2xl flex items-center justify-center hover:bg-white transition-colors text-2xl font-bold"
            >
              -
            </button>
            <button
              onClick={() => setWaterIntake(prev => prev + 1)}
              className="h-16 px-12 bg-slate-800 text-white rounded-[2rem] font-bold text-[13px] tracking-widest uppercase shadow-md hover:-translate-y-0.5 transition-transform"
            >
              Add 250ml
            </button>
            <button
              onClick={() => setWaterIntake(prev => prev + 1)}
              className="size-16 bg-white/50 text-slate-900 rounded-2xl flex items-center justify-center hover:bg-white transition-colors text-2xl font-bold"
            >
              +
            </button>
          </div>

          <p className="mt-8 text-sm font-bold text-[#5f7f8a]">
            {waterIntake >= waterGoal ? "🎉 Goal Reached! Stay Hydrated." : `Keep going, ${waterGoal - waterIntake} more to go!`}
          </p>
        </div>

        {/* Analytics & Stats */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm text-slate-900">
            <div className="flex items-center justify-between mb-8">
              <h3 className="font-black text-xl tracking-tight">Analytics</h3>
              <div className="flex bg-slate-100 p-1 rounded-full">
                <button
                  onClick={() => setAnalyticsTab('WEEKLY')}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${analyticsTab === 'WEEKLY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Week
                </button>
                <button
                  onClick={() => setAnalyticsTab('MONTHLY')}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${analyticsTab === 'MONTHLY' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Month
                </button>
              </div>
            </div>

            <div className="h-48 flex items-end justify-between gap-1">
              {analyticsTab === 'WEEKLY' ? weeklyData.map((d, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                  <div className="relative w-full">
                    <div
                      className={`w-full rounded-t-xl transition-all duration-500 ${d.val >= waterGoal ? 'bg-orange-400' : 'bg-slate-100'}`}
                      style={{ height: `${(d.val / 10) * 100}%` }}
                    />
                    <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md font-bold">
                      {d.val}
                    </div>
                  </div>
                  <span className={`text-[10px] font-black uppercase tracking-widest ${i === 6 ? 'text-slate-900' : 'text-slate-400'}`}>{d.day.charAt(0)}</span>
                </div>
              )) : (
                <div className="w-full flex items-end gap-[2px]">
                  {monthlyData.map((d, i) => (
                    <div
                      key={i}
                      className={`flex-1 rounded-t-[2px] transition-all duration-500 ${d.val >= waterGoal ? 'bg-orange-300' : 'bg-slate-100'}`}
                      style={{ height: `${(d.val / 10) * 100}%` }}
                    />
                  ))}
                </div>
              )}
            </div>
            {analyticsTab === 'MONTHLY' && (
              <div className="flex justify-between mt-2 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Day 1</span>
                <span>Day 30</span>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="p-8 bg-white rounded-[2rem] shadow-sm text-slate-900">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Total Volume</p>
              <p className="text-3xl font-black text-slate-900">1,300 <span className="text-xs text-slate-400">ml</span></p>
            </div>
            <div className="p-8 bg-white rounded-[2rem] shadow-sm text-slate-900 mt-0 lg:-mt-0">
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Streak</p>
              <p className="text-3xl font-black text-slate-900">14 <span className="text-xs text-slate-400">Days</span></p>
            </div>
          </div>

          <div className="p-8 bg-[#fce1cd] text-[#ad8771] border-none rounded-[2.5rem] flex items-start gap-4 shadow-sm">
            <div className="text-2xl mt-1">
              <span className="material-symbols-rounded">tips_and_updates</span>
            </div>
            <div>
              <p className="text-[10px] font-black text-[#ad8771] uppercase tracking-widest">Pro Tip</p>
              <p className="text-sm font-bold text-[#a86539] mt-2 leading-relaxed">Drinking water right after waking up helps jumpstart your metabolism and flushes out toxins accumulated overnight.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Manual Input Modal */}
      {showManualInput && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-white dark:bg-[#1c2333] w-full max-w-sm rounded-[2.5rem] shadow-2xl p-10 border border-white/10 animate-in fade-in zoom-in duration-300">
            <h3 className="text-2xl font-black tracking-tight mb-2">Manual Entry</h3>
            <p className="text-sm text-slate-500 mb-8">Enter the exact amount of water in glasses.</p>

            <form onSubmit={handleManualSubmit} className="space-y-6">
              <div>
                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">Number of Glasses</label>
                <input
                  autoFocus
                  type="number"
                  value={tempIntake}
                  onChange={e => setTempIntake(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 text-2xl font-black focus:ring-2 focus:ring-primary transition-all"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowManualInput(false)}
                  className="flex-1 py-4 font-black text-slate-400 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-primary text-white py-4 rounded-2xl font-black shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Update Count
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default HabitTracker;
