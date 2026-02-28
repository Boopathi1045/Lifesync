
import React, { useState } from 'react';

interface HabitTrackerProps {
  habitHistory: any[];
  waterIntake: number;
  setWaterIntake: (val: number | ((prev: number) => number)) => void;
  waterGoal: number;
  wakeUpTime: string;
  setWakeUpTime: (time: string) => void;
  sleepTime: string;
  setSleepTime: (time: string) => void;
  naps: number[];
  setNaps: (naps: number[] | ((prev: number[]) => number[])) => void;
}

const HabitTracker: React.FC<HabitTrackerProps> = ({ habitHistory, waterIntake, setWaterIntake, waterGoal, wakeUpTime, setWakeUpTime, sleepTime, setSleepTime, naps, setNaps }) => {
  const [analyticsTab, setAnalyticsTab] = useState<'WEEKLY' | 'MONTHLY' | 'STATS'>('WEEKLY');
  const [showManualInput, setShowManualInput] = useState(false);
  const [showNapInput, setShowNapInput] = useState(false);
  const [tempIntake, setTempIntake] = useState(waterIntake.toString());
  const [tempNap, setTempNap] = useState('');

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(tempIntake);
    if (!isNaN(val)) {
      setWaterIntake(val);
      setShowManualInput(false);
    }
  };

  const handleNapSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(tempNap);
    if (!isNaN(val) && val > 0) {
      setNaps(prev => [...prev, val]);
      setTempNap('');
      setShowNapInput(false);
    }
  };

  const getPastDateString = (daysAgo: number) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    return d.toISOString().split('T')[0];
  };

  const getDayName = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { weekday: 'short' });
  };

  const weeklyData = Array.from({ length: 7 }, (_, i) => {
    const dStr = getPastDateString(6 - i);
    const existing = habitHistory?.find((h) => h.date === dStr);
    const isToday = i === 6;
    return { day: getDayName(dStr), val: isToday ? waterIntake : (existing ? existing.water_intake : null) };
  });

  const monthlyData = Array.from({ length: 30 }, (_, i) => {
    const dStr = getPastDateString(29 - i);
    const existing = habitHistory?.find((h) => h.date === dStr);
    const isToday = i === 29;
    return { day: i + 1, val: isToday ? waterIntake : (existing ? existing.water_intake : null) };
  });

  const validWakeTimes = habitHistory?.map(h => h.wake_up_time).filter(Boolean) || [];
  const validSleepTimes = habitHistory?.map(h => h.sleep_time).filter(Boolean) || [];
  const validWaterIntakes = habitHistory?.map(h => h.water_intake).filter(v => v !== null && v !== undefined) || [];

  const avgWater = validWaterIntakes.length ? (validWaterIntakes.reduce((a, b) => a + b, 0) / validWaterIntakes.length).toFixed(1) : '0';

  const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const formatTime = (mins: number) => {
    if (isNaN(mins)) return 'N/A';
    const h = Math.floor(mins / 60) % 24;
    const m = Math.floor(mins % 60);
    const isPM = h >= 12;
    const h12 = h % 12 || 12;
    return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
  };

  const calculateSleepDuration = (wakeArr: string[], sleepArr: string[]) => {
    if (!wakeArr.length || !sleepArr.length) return 0;
    let totalMins = 0;
    let count = 0;
    for (let i = 0; i < Math.min(wakeArr.length, sleepArr.length); i++) {
      let w = parseTime(wakeArr[i]);
      let s = parseTime(sleepArr[i]);
      // If wake time is less than sleep time, it means they woke up the next day
      // Sleep happened before midnight or after midnight natively.
      // Actually, normally sleep is ~22:00-02:00 and wake is 06:00-10:00.
      // If s > w, like sleep 23:00, wake 07:00.
      // Duration = (24*60 - s) + w
      // If s < w, like sleep 02:00, wake 08:00
      // Duration = w - s
      let diff = w - s;
      if (diff < 0) {
        diff = (24 * 60 - s) + w;
      }
      totalMins += diff;
      count++;
    }
    return count > 0 ? totalMins / count : 0;
  };

  const formatDurationMs = (mins: number) => {
    if (mins === 0) return 'N/A';
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return `${h}h ${m}m`;
  };

  const avgWake = validWakeTimes.length ? formatTime(validWakeTimes.reduce((a, b) => a + parseTime(b), 0) / validWakeTimes.length) : 'N/A';
  // Use duration instead of time average
  const avgSleepDuration = calculateSleepDuration(validWakeTimes, validSleepTimes);
  const avgSleepDisplay = formatDurationMs(avgSleepDuration);

  // Calculate total nap time today
  const totalNapMins = naps.reduce((a, b) => a + b, 0);
  const napDisplay = totalNapMins > 0 ? `${Math.floor(totalNapMins / 60)}h ${totalNapMins % 60}m` : '0m';

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
              setTempNap('');
              setShowNapInput(true);
            }}
            className="bg-indigo-500/20 text-indigo-100 px-5 py-2.5 font-bold text-[10px] hover:bg-indigo-500/40 transition-all uppercase tracking-widest rounded-full"
          >
            Log Nap
          </button>
          <button
            onClick={() => {
              setTempIntake(waterIntake.toString());
              setShowManualInput(true);
            }}
            className="bg-white/10 text-white px-5 py-2.5 font-bold text-[10px] hover:bg-white/20 transition-all uppercase tracking-widest rounded-full"
          >
            Manual Entry
          </button>
        </div>
      </header>

      {/* Morning & Evening Check-ins */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {!wakeUpTime ? (
          <div className="bg-gradient-to-br from-amber-100 to-orange-100 p-8 rounded-[2rem] shadow-sm text-slate-900 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-rounded text-3xl text-orange-500">wb_sunny</span>
                <h3 className="text-xl font-black">Morning Check-in</h3>
              </div>
              <p className="text-sm font-bold text-slate-600 mb-6">Good morning! When did you wake up today?</p>
            </div>
            <div className="flex gap-3">
              <input
                type="time"
                className="bg-white/60 border-none rounded-xl px-4 py-3 font-bold text-slate-800 focus:ring-2 focus:ring-orange-400 outline-none w-full"
                onChange={(e) => setWakeUpTime(e.target.value)}
              />
            </div>
          </div>
        ) : (
          <div className="bg-white p-8 rounded-[2rem] shadow-sm text-slate-900 border border-slate-100 flex flex-col justify-center items-center text-center gap-2 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-100 rounded-full blur-3xl -mr-10 -mt-10 opacity-50 pointer-events-none"></div>
            <span className="material-symbols-rounded text-4xl text-orange-400 mb-2">wb_sunny</span>
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Woke up at</p>
            <p className="text-3xl font-black">{new Date(`1970-01-01T${wakeUpTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        )}

        {wakeUpTime && !sleepTime ? (
          <div className="bg-gradient-to-br from-indigo-900 to-slate-900 p-8 rounded-[2rem] shadow-sm text-white flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-rounded text-3xl text-indigo-300">bedtime</span>
                <h3 className="text-xl font-black">Evening Check-in</h3>
              </div>
              <p className="text-sm font-medium text-slate-300 mb-6">Time to wind down. Heading to sleep?</p>
            </div>
            <button
              onClick={() => {
                const now = new Date();
                setSleepTime(`${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`);
              }}
              className="w-full bg-indigo-500/20 hover:bg-indigo-500/40 text-indigo-200 py-3 rounded-xl font-black transition-colors"
            >
              I'm going to sleep now
            </button>
          </div>
        ) : sleepTime ? (
          <div className="bg-indigo-950 p-8 rounded-[2rem] shadow-sm text-white border border-indigo-900/50 flex flex-col justify-center items-center text-center gap-2 relative overflow-hidden">
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-indigo-500/20 rounded-full blur-3xl -ml-10 -mb-10 pointer-events-none"></div>
            <span className="material-symbols-rounded text-4xl text-indigo-300 mb-2">bedtime</span>
            <p className="text-[10px] font-black uppercase tracking-widest text-indigo-300/60">Went to sleep at</p>
            <p className="text-3xl font-black">{new Date(`1970-01-01T${sleepTime}`).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>
        ) : (
          <div className="bg-slate-100 p-8 rounded-[2rem] flex items-center justify-center opacity-50">
            <p className="text-sm font-bold text-slate-400">Wake up first to track sleep</p>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Main Progress Card */}
        <div className="lg:col-span-7 bg-[#c1e5ed] p-12 text-slate-900 rounded-[3rem] shadow-sm flex flex-col items-center justify-center relative overflow-hidden">
          <div className="relative size-64 mb-10 mt-6">
            <svg className="size-full -rotate-90" viewBox="0 0 100 100">
              <circle className="text-[#a4d7e3]" strokeWidth="8" stroke="currentColor" fill="transparent" r="44" cx="50" cy="50" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-7xl font-black leading-none text-slate-900">{waterIntake}</span>
              <span className="text-xs text-[#5f7f8a] font-black uppercase tracking-widest mt-2">{waterIntake === 1 ? 'Glass' : 'Glasses'}</span>
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
              Add 1 Glass
            </button>
            <button
              onClick={() => setWaterIntake(prev => prev + 1)}
              className="size-16 bg-white/50 text-slate-900 rounded-2xl flex items-center justify-center hover:bg-white transition-colors text-2xl font-bold"
            >
              +
            </button>
          </div>

          <p className="mt-8 text-sm font-bold text-[#5f7f8a]">
            Keep yourself hydrated throughout the day!
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
                <button
                  onClick={() => setAnalyticsTab('STATS')}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${analyticsTab === 'STATS' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                >
                  Stats
                </button>
              </div>
            </div>

            <div className={`flex items-end justify-between gap-1 ${analyticsTab === 'STATS' ? 'h-auto' : 'h-48'}`}>
              {analyticsTab === 'WEEKLY' ? (
                weeklyData.some(d => d.val !== null) ? weeklyData.map((d, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-3 group">
                    <div className="relative w-full h-48 flex items-end">
                      {d.val !== null ? (
                        <>
                          <div
                            className={`w-full rounded-t-xl transition-all duration-500 bg-orange-400`}
                            style={{ height: `${Math.min(100, (d.val / 10) * 100)}%` }}
                          />
                          <div className="absolute -top-8 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white text-[10px] px-2 py-1 rounded-md font-bold">
                            {d.val}
                          </div>
                        </>
                      ) : (
                        <div className="w-full h-2 bg-slate-200 rounded-t-xl" title="No data"></div>
                      )}
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-widest ${i === 6 ? 'text-slate-900' : 'text-slate-400'}`}>{d.day.charAt(0)}</span>
                  </div>
                )) : (
                  <div className="w-full h-full flex items-center justify-center pb-6">
                    <p className="text-sm font-bold text-slate-400">Data is not there</p>
                  </div>
                )
              ) : analyticsTab === 'MONTHLY' ? (
                monthlyData.some(d => d.val !== null) ? (
                  <div className="w-full flex items-end gap-[2px] h-48">
                    {monthlyData.map((d, i) => (
                      <div
                        key={i}
                        className={`flex-1 rounded-t-[2px] transition-all duration-500 ${d.val !== null ? 'bg-orange-300' : 'bg-slate-100 h-1'}`}
                        style={{ height: d.val !== null ? `${Math.min(100, (d.val / 10) * 100)}%` : '2px' }}
                        title={d.val !== null ? `${d.val} glasses` : 'No data'}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center pb-6">
                    <p className="text-sm font-bold text-slate-400">Data is not there</p>
                  </div>
                )
              ) : (
                <div className="w-full space-y-6">
                  {validWakeTimes.length === 0 && validSleepTimes.length === 0 && validWaterIntakes.length === 0 ? (
                    <div className="w-full h-24 flex items-center justify-center">
                      <p className="text-sm font-bold text-slate-400">Data is not there</p>
                    </div>
                  ) : (
                    <>
                      <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Wake Up</p>
                          <p className="font-bold text-lg text-slate-800">{avgWake}</p>
                        </div>
                        <div className="h-10 w-24 bg-gradient-to-r from-orange-200 to-amber-100 rounded-full blur-sm"></div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Sleep Duration</p>
                          <p className="font-bold text-lg text-slate-800">{avgSleepDisplay}</p>
                        </div>
                        <div className="h-10 w-24 bg-gradient-to-r from-indigo-200 to-blue-200 rounded-full blur-sm"></div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Water Intake</p>
                          <p className="font-bold text-lg text-slate-800">{avgWater} {parseFloat(avgWater) === 1 ? 'Glass' : 'Glasses'}</p>
                        </div>
                        <div className="h-10 w-32 bg-gradient-to-r from-cyan-200 to-blue-200 rounded-full blur-sm"></div>
                      </div>
                      <div className="bg-slate-50 p-4 rounded-2xl flex items-center justify-between">
                        <div>
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today's Naps</p>
                          <p className="font-bold text-lg text-slate-800">{napDisplay} <span className="text-xs text-slate-500 font-normal">({naps.length} logs)</span></p>
                        </div>
                        <div className="h-10 w-32 bg-gradient-to-r from-purple-200 to-pink-200 rounded-full blur-sm"></div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {analyticsTab === 'MONTHLY' && monthlyData.some(d => d.val !== null) && (
              <div className="flex justify-between mt-2 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                <span>Day 1</span>
                <span>Day 30</span>
              </div>
            )}
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

      {/* Nap Input Modal */}
      {showNapInput && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
          <div className="bg-indigo-950 text-white w-full max-w-sm rounded-[2.5rem] shadow-2xl p-10 border border-white/10 animate-in fade-in zoom-in duration-300">
            <h3 className="text-2xl font-black tracking-tight mb-2">Log a Nap</h3>
            <p className="text-sm text-indigo-300 mb-8">How many minutes did you sleep?</p>

            <form onSubmit={handleNapSubmit} className="space-y-6">
              <div>
                <label className="text-xs font-black text-indigo-400 uppercase tracking-widest block mb-2">Duration (minutes)</label>
                <input
                  autoFocus
                  type="number"
                  value={tempNap}
                  onChange={e => setTempNap(e.target.value)}
                  className="w-full bg-black/20 border border-white/10 rounded-2xl py-4 px-6 text-2xl font-black focus:ring-2 focus:ring-indigo-500 transition-all text-white outline-none"
                  placeholder="e.g. 30"
                />
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowNapInput(false)}
                  className="flex-1 py-4 font-black text-indigo-300 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-indigo-500 text-white py-4 rounded-2xl font-black shadow-lg shadow-indigo-500/20 hover:bg-indigo-400 transition-all"
                >
                  Save Nap
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
