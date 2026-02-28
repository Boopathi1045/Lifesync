
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
  const [tempIntake, setTempIntake] = useState(waterIntake.toString());

  // Nap tracking state
  const [napStartTime, setNapStartTime] = useState<number | null>(() => {
    const saved = localStorage.getItem('LS_NAP_START');
    return saved ? parseInt(saved) : null;
  });

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseInt(tempIntake);
    if (!isNaN(val)) {
      setWaterIntake(val);
      setShowManualInput(false);
    }
  };

  const handleStartNap = () => {
    const now = Date.now();
    localStorage.setItem('LS_NAP_START', now.toString());
    setNapStartTime(now);
  };

  const handleEndNap = () => {
    if (!napStartTime) return;
    const now = Date.now();

    // Calculate duration in minutes
    let durationMins = Math.floor((now - napStartTime) / 60000);
    if (durationMins < 1) durationMins = 1; // Minimum 1 minute for a logged nap

    // Explicitly parse local time strings to prevent timezone drifting on save
    const startObj = new Date(napStartTime);
    const endObj = new Date(now);

    // Using Int18Locale to force exactly the local time values the user expects to see 
    // even if the internal clock string gets converted differently by Supabase later
    const formatLocalTime = (d: Date) => {
      return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit' }).replace('24:', '00:');
    }

    const startStr = formatLocalTime(startObj);
    const endStr = formatLocalTime(endObj);

    const newNapRecord = {
      start: startStr,
      end: endStr,
      duration: durationMins
    };

    setNaps(prev => [...(prev || []), newNapRecord]);

    localStorage.removeItem('LS_NAP_START');
    setNapStartTime(null);
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

  const parseTime = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const formatTime = (mins: number) => {
    if (isNaN(mins)) return '-';
    // Handle wrap-around back to normal time
    mins = ((mins % (24 * 60)) + (24 * 60)) % (24 * 60);
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    const isPM = h >= 12;
    const h12 = h % 12 || 12;
    return `${h12.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')} ${isPM ? 'PM' : 'AM'}`;
  };

  const formatDurationMs = (mins: number) => {
    if (isNaN(mins) || mins === 0) return '-';
    const h = Math.floor(mins / 60);
    const m = Math.floor(mins % 60);
    return `${h}h ${m}m`;
  };

  const getAvgClockTime = (arr: string[], isSleep: boolean) => {
    if (!arr.length) return '-';
    let totalMins = 0;
    arr.forEach(t => {
      let m = parseTime(t);
      if (isSleep && m < 12 * 60) {
        m += 24 * 60; // Shift morning sleep times to the same "night" mathematically
      }
      totalMins += m;
    });
    return formatTime(totalMins / arr.length);
  };
  const getAvgDur = (arr: number[]) => arr.length ? formatDurationMs(arr.reduce((a, b) => a + b, 0) / arr.length) : '-';

  const generalWake: string[] = [], weekdayWake: string[] = [], weekendWake: string[] = [];
  const generalSleep: string[] = [], weekdaySleep: string[] = [], weekendSleep: string[] = [];
  const generalDur: number[] = [], weekdayDur: number[] = [], weekendDur: number[] = [];

  const generalNapStart: string[] = [], weekdayNapStart: string[] = [], weekendNapStart: string[] = [];
  const generalNapDur: number[] = [], weekdayNapDur: number[] = [], weekendNapDur: number[] = [];
  const generalTotalSleepDur: number[] = [], weekdayTotalSleepDur: number[] = [], weekendTotalSleepDur: number[] = [];

  const sortedHistory = [...(habitHistory || [])].sort((a, b) => a.date.localeCompare(b.date));

  sortedHistory.forEach((h, index) => {
    const d = new Date(h.date);
    const dayOfWeek = d.getDay(); // 0 = Sun, 1 = Mon, 5 = Fri, 6 = Sat

    if (h.wake_up_time) {
      generalWake.push(h.wake_up_time);
      if (dayOfWeek === 0 || dayOfWeek === 6) weekendWake.push(h.wake_up_time);
      else weekdayWake.push(h.wake_up_time);
    }

    if (h.sleep_time) {
      generalSleep.push(h.sleep_time);
      // Weekend sleep happens on Friday (5) or Saturday (6) night
      if (dayOfWeek === 5 || dayOfWeek === 6) weekendSleep.push(h.sleep_time);
      else weekdaySleep.push(h.sleep_time);
    }

    if (index > 0 && h.wake_up_time) {
      const prev = sortedHistory[index - 1];
      const prevDate = new Date(prev.date);
      const expectedYesterday = new Date(d);
      expectedYesterday.setDate(d.getDate() - 1);

      if (prevDate.toISOString().split('T')[0] === expectedYesterday.toISOString().split('T')[0] && prev.sleep_time) {
        let w = parseTime(h.wake_up_time);
        let s = parseTime(prev.sleep_time);
        let diff = w - s;
        if (diff < 0) diff = (24 * 60 - s) + w;

        generalDur.push(diff);
        // "This morning" was Saturday (6) or Sunday (0) = Weekend sleep duration
        if (dayOfWeek === 0 || dayOfWeek === 6) weekendDur.push(diff);
        else weekdayDur.push(diff);

        let dailyNaps = 0;
        if (h.naps && Array.isArray(h.naps)) {
          dailyNaps = h.naps.reduce((acc: number, nap: any) => {
            if (typeof nap === 'number') return acc + nap;
            if (nap && typeof nap === 'object' && typeof nap.duration === 'number') return acc + nap.duration;
            return acc;
          }, 0);
        }
        const totalSleep = diff + dailyNaps;
        generalTotalSleepDur.push(totalSleep);
        if (dayOfWeek === 0 || dayOfWeek === 6) weekendTotalSleepDur.push(totalSleep);
        else weekdayTotalSleepDur.push(totalSleep);
      }
    }

    // Process Naps for stats
    if (h.naps && Array.isArray(h.naps)) {
      h.naps.forEach((nap: any) => {
        // Handle legacy numbers (just duration)
        if (typeof nap === 'number') {
          generalNapDur.push(nap);
          if (dayOfWeek === 0 || dayOfWeek === 6) weekendNapDur.push(nap);
          else weekdayNapDur.push(nap);
        } else if (nap && typeof nap === 'object' && nap.duration) {
          generalNapDur.push(nap.duration);
          if (dayOfWeek === 0 || dayOfWeek === 6) weekendNapDur.push(nap.duration);
          else weekdayNapDur.push(nap.duration);

          if (nap.start) {
            generalNapStart.push(nap.start);
            if (dayOfWeek === 0 || dayOfWeek === 6) weekendNapStart.push(nap.start);
            else weekdayNapStart.push(nap.start);
          }
        }
      });
    }
  });

  const validWaterIntakes = habitHistory?.map(h => h.water_intake).filter(v => v !== null && v !== undefined) || [];
  const avgWater = validWaterIntakes.length ? (validWaterIntakes.reduce((a, b) => a + b, 0) / validWaterIntakes.length).toFixed(1) : '0';

  const totalNapMins = (naps || []).reduce((a, b: any) => {
    if (typeof b === 'number') return a + b;
    if (b && typeof b === 'object' && typeof b.duration === 'number') return a + b.duration;
    return a;
  }, 0);
  const napDisplay = totalNapMins > 0 ? `${Math.floor(totalNapMins / 60)}h ${totalNapMins % 60}m` : '0m';

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-10 pb-20">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="text-white">
          <h2 className="text-4xl font-black pb-1">Water Intake</h2>
          <p className="text-white/70 mt-1">Consistency is key to health. Keep the streak alive!</p>
        </div>
        <div className="flex gap-3 items-center">
          {napStartTime ? (
            <button
              onClick={handleEndNap}
              className="bg-indigo-500/20 text-indigo-100 px-5 py-2.5 font-bold text-[10px] hover:bg-indigo-500/40 transition-all uppercase tracking-widest rounded-full flex flex-col items-center"
            >
              <span className="text-red-300">End Nap</span>
              <span className="text-[8px] opacity-70">Started {new Date(napStartTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </button>
          ) : (
            <button
              onClick={handleStartNap}
              className="bg-indigo-500/20 text-indigo-100 px-5 py-2.5 font-bold text-[10px] hover:bg-indigo-500/40 transition-all uppercase tracking-widest rounded-full"
            >
              Start Nap
            </button>
          )}
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

      {/* Top Section: Water, Morning, Evening */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
        {/* Main Progress Card (Water) */}
        <div className="bg-[#c1e5ed] p-8 text-slate-900 rounded-[2rem] shadow-sm flex flex-col items-center justify-center relative overflow-hidden h-full">
          <div className="relative size-40 mb-6 mt-2">
            <svg className="size-full -rotate-90" viewBox="0 0 100 100">
              <circle className="text-[#a4d7e3]" strokeWidth="8" stroke="currentColor" fill="transparent" r="44" cx="50" cy="50" />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
              <span className="text-5xl font-black leading-none text-slate-900">{waterIntake}</span>
              <span className="text-[10px] text-[#5f7f8a] font-black uppercase tracking-widest mt-1">{waterIntake === 1 ? 'Glass' : 'Glasses'}</span>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full max-w-[200px] justify-between">
            <button
              onClick={() => setWaterIntake(Math.max(0, waterIntake - 1))}
              className="size-12 bg-white/50 text-slate-900 rounded-xl flex items-center justify-center hover:bg-white transition-colors text-xl font-bold"
            >
              -
            </button>
            <button
              onClick={() => setWaterIntake(prev => prev + 1)}
              className="h-12 flex-1 bg-slate-800 text-white rounded-xl font-bold text-[11px] tracking-widest uppercase shadow-md hover:-translate-y-0.5 transition-transform"
            >
              Add
            </button>
            <button
              onClick={() => setWaterIntake(prev => prev + 1)}
              className="size-12 bg-white/50 text-slate-900 rounded-xl flex items-center justify-center hover:bg-white transition-colors text-xl font-bold"
            >
              +
            </button>
          </div>
        </div>
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

      <div className="flex flex-col gap-10 items-center w-full">
        {/* Analytics & Stats */}
        <div className="w-full space-y-6">
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
                <div className="w-full grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {generalWake.length === 0 && generalSleep.length === 0 && validWaterIntakes.length === 0 ? (
                    <div className="w-full col-span-1 sm:col-span-2 h-24 flex items-center justify-center">
                      <p className="text-sm font-bold text-slate-400">Data is not there</p>
                    </div>
                  ) : (
                    <>
                      {/* Wake Up Stat Block */}
                      <div className="bg-slate-50 p-5 rounded-3xl flex flex-col justify-between relative overflow-hidden">
                        <div className="flex justify-between items-center mb-4 z-10">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Wake Up</p>
                            <p className="font-bold text-xl text-slate-800">{getAvgClockTime(generalWake, false)}</p>
                          </div>
                          <span className="material-symbols-rounded text-orange-300 opacity-50 text-3xl">wb_sunny</span>
                        </div>
                        <div className="flex items-center gap-6 z-10">
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekdays</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgClockTime(weekdayWake, false)}</p>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekends</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgClockTime(weekendWake, false)}</p>
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 h-24 w-32 bg-gradient-to-r from-orange-200 to-amber-100 rounded-full blur-2xl opacity-40 -mr-10 -mt-10 pointer-events-none"></div>
                      </div>

                      {/* Nap Start Time Stat Block */}
                      <div className="bg-slate-50 p-5 rounded-3xl flex flex-col justify-between relative overflow-hidden">
                        <div className="flex justify-between items-center mb-4 z-10">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Nap Time</p>
                            <p className="font-bold text-xl text-slate-800">{getAvgClockTime(generalNapStart, false)}</p>
                          </div>
                          <span className="material-symbols-rounded text-rose-300 opacity-50 text-3xl">schedule</span>
                        </div>
                        <div className="flex items-center gap-6 z-10">
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekdays</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgClockTime(weekdayNapStart, false)}</p>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekends</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgClockTime(weekendNapStart, false)}</p>
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 h-24 w-32 bg-gradient-to-r from-rose-200 to-pink-200 rounded-full blur-2xl opacity-40 -mr-10 -mt-10 pointer-events-none"></div>
                      </div>

                      {/* Sleep Time Stat Block */}
                      <div className="bg-slate-50 p-5 rounded-3xl flex flex-col justify-between relative overflow-hidden">
                        <div className="flex justify-between items-center mb-4 z-10">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Sleep Time</p>
                            <p className="font-bold text-xl text-slate-800">{getAvgClockTime(generalSleep, true)}</p>
                          </div>
                          <span className="material-symbols-rounded text-indigo-300 opacity-50 text-3xl">bedtime</span>
                        </div>
                        <div className="flex items-center gap-6 z-10">
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekdays</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgClockTime(weekdaySleep, true)}</p>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekends</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgClockTime(weekendSleep, true)}</p>
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 h-24 w-32 bg-gradient-to-r from-indigo-200 to-blue-200 rounded-full blur-2xl opacity-40 -mr-10 -mt-10 pointer-events-none"></div>
                      </div>

                      {/* Sleep Duration Stat Block */}
                      <div className="bg-slate-50 p-5 rounded-3xl flex flex-col justify-between relative overflow-hidden">
                        <div className="flex justify-between items-center mb-4 z-10">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Night Sleep</p>
                            <p className="font-bold text-xl text-slate-800">{getAvgDur(generalDur)}</p>
                          </div>
                          <span className="material-symbols-rounded text-blue-300 opacity-50 text-3xl">bedtime</span>
                        </div>
                        <div className="flex items-center gap-6 z-10">
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekdays</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgDur(weekdayDur)}</p>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekends</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgDur(weekendDur)}</p>
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 h-24 w-32 bg-gradient-to-r from-blue-200 to-cyan-200 rounded-full blur-2xl opacity-40 -mr-10 -mt-10 pointer-events-none"></div>
                      </div>

                      {/* Nap Duration Stat Block */}
                      <div className="bg-slate-50 p-5 rounded-3xl flex flex-col justify-between relative overflow-hidden">
                        <div className="flex justify-between items-center mb-4 z-10">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Nap Duration</p>
                            <p className="font-bold text-xl text-slate-800">{getAvgDur(generalNapDur)}</p>
                          </div>
                          <span className="material-symbols-rounded text-teal-300 opacity-50 text-3xl">snooze</span>
                        </div>
                        <div className="flex items-center gap-6 z-10">
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekdays</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgDur(weekdayNapDur)}</p>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekends</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgDur(weekendNapDur)}</p>
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 h-24 w-32 bg-gradient-to-r from-teal-200 to-emerald-200 rounded-full blur-2xl opacity-40 -mr-10 -mt-10 pointer-events-none"></div>
                      </div>

                      {/* Total Sleep Stat Block */}
                      <div className="bg-slate-50 p-5 rounded-3xl flex flex-col justify-between relative overflow-hidden">
                        <div className="flex justify-between items-center mb-4 z-10">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Avg Sleep <span className="text-[8px] opacity-70">(Night + Nap)</span></p>
                            <p className="font-bold text-xl text-slate-800">{getAvgDur(generalTotalSleepDur)}</p>
                          </div>
                          <span className="material-symbols-rounded text-indigo-300 opacity-50 text-3xl">hotel</span>
                        </div>
                        <div className="flex items-center gap-6 z-10">
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekdays</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgDur(weekdayTotalSleepDur)}</p>
                          </div>
                          <div className="h-4 w-px bg-slate-200"></div>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">Weekends</p>
                            <p className="font-bold text-sm text-slate-700">{getAvgDur(weekendTotalSleepDur)}</p>
                          </div>
                        </div>
                        <div className="absolute top-0 right-0 h-24 w-32 bg-gradient-to-r from-indigo-200 to-purple-200 rounded-full blur-2xl opacity-40 -mr-10 -mt-10 pointer-events-none"></div>
                      </div>

                      {/* Other single line stats */}
                      <div className="col-span-1 sm:col-span-2 lg:col-span-3 grid grid-cols-1 sm:grid-cols-2 gap-6 mt-2">
                        <div className="bg-slate-50 p-5 rounded-3xl flex items-center justify-between relative overflow-hidden">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Avg Water Intake</p>
                            <p className="font-bold text-lg text-slate-800">{avgWater} {parseFloat(avgWater) === 1 ? 'Glass' : 'Glasses'}</p>
                          </div>
                          <div className="absolute right-0 top-0 h-10 w-32 bg-gradient-to-r from-cyan-200 to-blue-200 rounded-full blur-xl opacity-50 pointer-events-none -mr-10 -mt-2"></div>
                        </div>

                        <div className="bg-slate-50 p-5 rounded-3xl flex items-center justify-between relative overflow-hidden">
                          <div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Today's Naps</p>
                            <p className="font-bold text-lg text-slate-800">{napDisplay} <span className="text-xs text-slate-500 font-normal">({(naps || []).length} logs)</span></p>
                          </div>
                          <div className="absolute right-0 top-0 h-10 w-32 bg-gradient-to-r from-purple-200 to-pink-200 rounded-full blur-xl opacity-50 pointer-events-none -mr-10 -mt-2"></div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            {analyticsTab === 'MONTHLY' && monthlyData.some(d => d.val !== null) && (
              <div className="flex justify-between mt-6 px-1 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
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

    </div>
  );
};

export default HabitTracker;
