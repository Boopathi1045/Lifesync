
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Reminder, PasswordEntry, MediaItem, Account, Friend, Transaction, ReminderCategory, AccountType, PurposeCategory, FocusSettings, Subscription } from './types';
import { supabase, TABLES } from './lib/supabase';
import Sidebar from './components/Sidebar';
import Dashboard from './components/Dashboard';
import Reminders from './components/Reminders';
import HabitTracker from './components/HabitTracker';
import PasswordManager from './components/PasswordManager';
import WatchLater from './components/WatchLater';
import FinanceManager from './components/FinanceManager';
import Settings from './components/Settings';

const THEMES = {
  BLUE: { primary: '#3b82f6', foreground: '#ffffff' },
  EMERALD: { primary: '#10b981', foreground: '#ffffff' },
  ROSE: { primary: '#f43f5e', foreground: '#ffffff' },
  AMBER: { primary: '#f59e0b', foreground: '#ffffff' },
  VIOLET: { primary: '#8b5cf6', foreground: '#ffffff' },
  SLATE: { primary: '#475569', foreground: '#ffffff' },
};

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>(View.DASHBOARD);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isConfigMissing, setIsConfigMissing] = useState(!supabase);
  const [currentTheme, setCurrentTheme] = useState<keyof typeof THEMES>((localStorage.getItem('LS_THEME') as any) || 'BLUE');

  const isInitialLoad = useRef(true);

  const [snoozePresets, setSnoozePresets] = useState<number[]>([15, 30, 60]);
  const [focusSettings, setFocusSettings] = useState<FocusSettings>({
    allowedCategories: [ReminderCategory.WORK],
    allowHabitNotifications: true
  });

  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [passwords, setPasswords] = useState<PasswordEntry[]>([]);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [purposes, setPurposes] = useState<PurposeCategory[]>([]);
  const [waterIntake, setWaterIntake] = useState(0);
  const [waterGoal] = useState(8);
  const [wakeUpTime, setWakeUpTime] = useState<string>('');
  const [sleepTime, setSleepTime] = useState<string>('');
  const [naps, setNaps] = useState<number[]>([]);
  const [habitHistory, setHabitHistory] = useState<any[]>([]);

  const todayStr = new Date().toISOString().split('T')[0];

  useEffect(() => {
    const theme = THEMES[currentTheme];
    document.documentElement.style.setProperty('--primary', theme.primary);
    document.documentElement.style.setProperty('--primary-foreground', theme.foreground);
    localStorage.setItem('LS_THEME', currentTheme);
  }, [currentTheme]);

  const persistToDB = useCallback(async (table: string, data: any | any[]) => {
    if (!supabase || isInitialLoad.current) return;
    setSyncing(true);
    setSyncError(null);
    try {
      const { error } = await supabase.from(table).upsert(data);
      if (error) throw error;
    } catch (e: any) {
      setSyncError(e.message || 'Database sync failed');
    } finally {
      setTimeout(() => setSyncing(false), 800);
    }
  }, []);

  const removeFromDB = useCallback(async (table: string, id: string) => {
    if (!supabase) return;
    console.log(`[Sync] Deleting from ${table} where id=${id}`);
    setSyncing(true);
    setSyncError(null);
    try {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) throw error;
      console.log(`[Sync] Successfully deleted from ${table}`);
    } catch (e: any) {
      console.error(`[Sync] Delete failed for ${table}:`, e);
      setSyncError(e.message || 'Database delete failed');
      throw e;
    } finally {
      setTimeout(() => setSyncing(false), 800);
    }
  }, []);

  // Generic Save Helper
  const saveToDB = useCallback(async (table: string, data: any | any[]) => {
    if (!supabase) return;
    console.log(`[Sync] Saving to ${table}:`, data);
    setSyncing(true);
    setSyncError(null);
    try {
      const { error } = await supabase.from(table).upsert(data);
      if (error) throw error;
      console.log(`[Sync] Successfully saved to ${table}`);
    } catch (e: any) {
      console.error(`[Sync] Failed to save to ${table}:`, e);
      setSyncError(e.message || `Failed to save to ${table}`);
      throw e;
    } finally {
      setTimeout(() => setSyncing(false), 500);
    }
  }, []);

  // Explicit helper for Reminders (kept for backward compatibility with components)
  const saveReminderToDB = useCallback(async (reminder: Reminder) => {
    await saveToDB(TABLES.REMINDERS, reminder);
  }, [saveToDB]);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const fetchAllData = async () => {
      try {
        setIsLoading(true);
        const [
          { data: remindersData },
          { data: passwordsData },
          { data: mediaData },
          { data: accountsData },
          { data: friendsData },
          { data: transactionsData },
          { data: subscriptionsData },
          { data: purposesData },
          { data: habitsData }
        ] = await Promise.all([
          supabase.from(TABLES.REMINDERS).select('*').order('dueDate', { ascending: true }),
          supabase.from(TABLES.PASSWORDS).select('*'),
          supabase.from(TABLES.MEDIA).select('*').order('dateAdded', { ascending: false }),
          supabase.from(TABLES.ACCOUNTS).select('*'),
          supabase.from(TABLES.FRIENDS).select('*'),
          supabase.from(TABLES.TRANSACTIONS).select('*').order('date', { ascending: false }),
          supabase.from(TABLES.SUBSCRIPTIONS).select('*'),
          supabase.from(TABLES.PURPOSES).select('*'),
          supabase.from(TABLES.DAILY_HABITS).select('*').order('date', { ascending: true })
        ]);

        if (remindersData) setReminders(remindersData);
        if (passwordsData) setPasswords(passwordsData);
        if (mediaData) setMedia(mediaData);
        if (accountsData) setAccounts(accountsData);
        if (friendsData) setFriends(friendsData);
        if (transactionsData) setTransactions(transactionsData);
        if (subscriptionsData) setSubscriptions(subscriptionsData);
        if (purposesData) setPurposes(purposesData);
        if (habitsData) {
          setHabitHistory(habitsData);
          const todayHabit = habitsData.find((h: any) => h.date === todayStr);
          if (todayHabit) {
            setWaterIntake(todayHabit.water_intake);
            setWakeUpTime(todayHabit.wake_up_time || '');
            setSleepTime(todayHabit.sleep_time || '');
            setNaps(todayHabit.naps || []);
          }
        }

        isInitialLoad.current = false;
      } catch (error) {
        console.error("Database connection failed.", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAllData();

    // Real-time Subscriptions for all tables
    const tables = [
      { name: TABLES.REMINDERS, setter: setReminders, sortKey: 'dueDate' },
      { name: TABLES.PASSWORDS, setter: setPasswords },
      { name: TABLES.MEDIA, setter: setMedia, sortKey: 'dateAdded' },
      { name: TABLES.ACCOUNTS, setter: setAccounts },
      { name: TABLES.FRIENDS, setter: setFriends },
      { name: TABLES.TRANSACTIONS, setter: setTransactions, sortKey: 'date' },
      { name: TABLES.SUBSCRIPTIONS, setter: setSubscriptions },
      { name: TABLES.PURPOSES, setter: setPurposes },
      { name: TABLES.DAILY_HABITS, setter: setHabitHistory, sortKey: 'date' }
    ];

    const channels = tables.map(table => {
      return supabase
        .channel(`${table.name}-realtime`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: table.name },
          (payload) => {
            console.log(`[Realtime] Event on ${table.name}:`, payload);
            if (payload.eventType === 'INSERT') {
              table.setter(prev => {
                if ((prev as any[]).find(r => r.id === payload.new.id)) return prev;
                const next = [...(prev as any[]), payload.new];
                return table.sortKey ? next.sort((a, b) => String(a[table.sortKey!]).localeCompare(String(b[table.sortKey!]))) : next;
              });
            } else if (payload.eventType === 'DELETE') {
              const deletedId = payload.old.id;
              table.setter(prev => (prev as any[]).filter(r => r.id !== deletedId));
            } else if (payload.eventType === 'UPDATE') {
              table.setter(prev => (prev as any[]).map(r => r.id === payload.new.id ? payload.new : r));
            }
          }
        )
        .subscribe();
    });

    return () => {
      channels.forEach(channel => supabase.removeChannel(channel));
    };
  }, [todayStr]);

  // Sync Hook for Habits (kept as it is date-based and simple)
  useEffect(() => {
    if (!isInitialLoad.current) {
      saveToDB(TABLES.DAILY_HABITS, {
        date: todayStr,
        water_intake: waterIntake,
        wake_up_time: wakeUpTime,
        sleep_time: sleepTime,
        naps: naps
      });
    }
  }, [waterIntake, wakeUpTime, sleepTime, naps, todayStr, saveToDB]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="h-full flex flex-col items-center justify-center space-y-4">
          <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
          <p className="font-black text-slate-400 uppercase tracking-widest text-xs animate-pulse">Establishing Connection...</p>
        </div>
      );
    }

    if (isConfigMissing) {
      return (
        <div className="h-full flex flex-col items-center justify-center p-10 max-w-lg mx-auto text-center space-y-8">
          <div className="size-20 bg-amber-500/10 text-amber-500 rounded-3xl flex items-center justify-center text-4xl shadow-lg">🔌</div>
          <h2 className="text-3xl font-black tracking-tight">Cloud Not Integrated</h2>
          <button onClick={() => setCurrentView(View.SETTINGS)} className="w-full bg-primary text-white py-4 rounded-2xl font-black">Go to Settings</button>
        </div>
      );
    }

    switch (currentView) {
      case View.DASHBOARD:
        return <Dashboard
          reminders={reminders} setReminders={setReminders}
          waterIntake={waterIntake} setWaterIntake={setWaterIntake} waterGoal={waterGoal}
          accounts={accounts} friends={friends} setCurrentView={setCurrentView}
          saveReminderToDB={saveReminderToDB}
        />;
      case View.REMINDERS:
        return <Reminders
          reminders={reminders} setReminders={setReminders}
          snoozePresets={snoozePresets}
          removeFromDB={removeFromDB}
          saveReminderToDB={saveReminderToDB}
        />;
      case View.HABITS:
        return <HabitTracker habitHistory={habitHistory} waterIntake={waterIntake} setWaterIntake={setWaterIntake} waterGoal={waterGoal} wakeUpTime={wakeUpTime} setWakeUpTime={setWakeUpTime} sleepTime={sleepTime} setSleepTime={setSleepTime} naps={naps} setNaps={setNaps} />;
      case View.PASSWORDS:
        return <PasswordManager passwords={passwords} setPasswords={setPasswords} removeFromDB={removeFromDB} saveToDB={saveToDB} />;
      case View.WATCH_LATER:
        return <WatchLater media={media} setMedia={setMedia} removeFromDB={removeFromDB} saveToDB={saveToDB} />;
      case View.FINANCE:
        return <FinanceManager
          accounts={accounts} setAccounts={setAccounts}
          friends={friends} setFriends={setFriends}
          transactions={transactions} setTransactions={setTransactions}
          purposes={purposes} setPurposes={setPurposes}
          subscriptions={subscriptions} setSubscriptions={setSubscriptions}
          removeFromDB={removeFromDB}
          saveToDB={saveToDB}
        />;
      case View.SETTINGS:
        return <Settings
          isFocusMode={isFocusMode} setIsFocusMode={setIsFocusMode}
          snoozePresets={snoozePresets} setSnoozePresets={setSnoozePresets}
          focusSettings={focusSettings} setFocusSettings={setFocusSettings}
          isConfigMissing={isConfigMissing} setIsConfigMissing={setIsConfigMissing}
          currentTheme={currentTheme} setCurrentTheme={setCurrentTheme}
        />;
      default:
        return <Dashboard reminders={reminders} setReminders={setReminders} waterIntake={waterIntake} setWaterIntake={setWaterIntake} waterGoal={waterGoal} accounts={accounts} friends={friends} setCurrentView={setCurrentView} saveReminderToDB={saveReminderToDB} />;
    }
  };

  return (
    <>
      <div className="flex bg-transparent h-screen overflow-hidden">
        <Sidebar currentView={currentView} setCurrentView={setCurrentView} />
        <main className="flex-1 overflow-y-auto custom-scrollbar relative">
          {renderContent()}
          {(syncing || syncError) && (
            <div className={`fixed bottom-6 right-6 px-5 py-2.5 rounded-2xl shadow-2xl flex items-center gap-3 z-[100] ${syncError ? 'bg-rose-500' : 'bg-emerald-500'} text-white transition-all`}>
              {syncError ? (
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase">Sync Error</span>
                  <span className="text-[8px] font-medium opacity-90 leading-tight max-w-[200px]">
                    {syncError.includes('Failed to fetch')
                      ? 'Network blocked. Check project status or VPN.'
                      : syncError}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] font-black uppercase tracking-widest">Syncing...</span>
              )}
            </div>
          )}
        </main>
      </div>
    </>
  );
};

export default App;
