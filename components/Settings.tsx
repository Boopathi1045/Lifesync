
import React, { useState } from 'react';
import { FocusSettings, ReminderCategory } from '../types';

interface SettingsProps {
  isFocusMode: boolean;
  setIsFocusMode: (val: boolean) => void;
  snoozePresets: number[];
  setSnoozePresets: (presets: number[]) => void;
  focusSettings: FocusSettings;
  setFocusSettings: (settings: FocusSettings) => void;
  isConfigMissing: boolean;
  setIsConfigMissing: (val: boolean) => void;
  currentTheme: string;
  setCurrentTheme: (theme: any) => void;
}

const Settings: React.FC<SettingsProps> = ({
  isFocusMode, setIsFocusMode,
  snoozePresets, setSnoozePresets,
  focusSettings, setFocusSettings,
  isConfigMissing, setIsConfigMissing,
  currentTheme, setCurrentTheme
}) => {
  const [activeSubModal, setActiveSubModal] = useState<'SNOOZE' | 'FOCUS' | 'DATABASE' | null>(null);
  const [newSnooze, setNewSnooze] = useState('');

  const [dbConfig, setDbConfig] = useState({
    url: localStorage.getItem('LS_SUPABASE_URL') || '',
    key: localStorage.getItem('LS_SUPABASE_ANON_KEY') || ''
  });

  const themes = [
    { id: 'BLUE', label: 'Classic Blue', color: '#3b82f6' },
    { id: 'EMERALD', label: 'Emerald Forest', color: '#10b981' },
    { id: 'ROSE', label: 'Rose Quartz', color: '#f43f5e' },
    { id: 'AMBER', label: 'Amber Sun', color: '#f59e0b' },
    { id: 'VIOLET', label: 'Deep Violet', color: '#8b5cf6' },
    { id: 'SLATE', label: 'Monochrome Slate', color: '#475569' },
  ];

  const toggleCategory = (cat: ReminderCategory) => {
    const isAllowed = focusSettings.allowedCategories.includes(cat);
    const newCats = isAllowed
      ? focusSettings.allowedCategories.filter(c => c !== cat)
      : [...focusSettings.allowedCategories, cat];
    setFocusSettings({ ...focusSettings, allowedCategories: newCats });
  };

  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    if (!dbConfig.url || !dbConfig.key) {
      alert('Please enter both URL and Key first.');
      return;
    }

    setIsTesting(true);
    try {
      const response = await fetch(`${dbConfig.url.replace(/\/$/, '')}/rest/v1/reminders?select=id&limit=1`, {
        headers: {
          'apikey': dbConfig.key,
          'Authorization': `Bearer ${dbConfig.key}`
        }
      });

      if (response.ok) {
        alert('✅ Connection Successful! The database is reachable.');
      } else {
        const errData = await response.json().catch(() => ({}));
        alert(`❌ Connection Failed: ${response.status} ${response.statusText}\n${errData.message || 'Check your credentials or RLS settings.'}`);
      }
    } catch (err: any) {
      alert(`❌ Network Error: ${err.message}\n\nThis usually means:\n1. The URL is incorrect\n2. The project is paused\n3. A firewall/VPN is blocking the request`);
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveDatabase = (e: React.FormEvent) => {
    e.preventDefault();
    localStorage.setItem('LS_SUPABASE_URL', dbConfig.url);
    localStorage.setItem('LS_SUPABASE_ANON_KEY', dbConfig.key);
    alert('Settings Saved. Please refresh the page to establish the new connection.');
    window.location.reload();
  };

  return (
    <div className="p-6 md:p-10 max-w-4xl mx-auto space-y-12 pb-32">
      <header className="text-white">
        <h2 className="text-4xl font-black pb-1">Settings</h2>
        <p className="text-white/70 mt-1">Fine-tune your personal productivity engine.</p>
      </header>

      {/* Theme Selection */}
      <section className="space-y-6">
        <h3 className="text-sm font-black text-white/50 uppercase tracking-widest border-b border-white/20 pb-3">Aesthetics & Theme</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {themes.map(theme => (
            <button
              key={theme.id}
              onClick={() => setCurrentTheme(theme.id)}
              className={`flex flex-col items-center gap-3 p-4 rounded-[2rem] transition-all shadow-sm ${currentTheme === theme.id
                ? 'bg-slate-50 border-2 border-slate-200'
                : 'bg-white hover:shadow-md border-2 border-transparent'
                }`}
            >
              <div
                className="size-10 rounded-full shadow-inner"
                style={{ backgroundColor: theme.color }}
              />
              <span className={`text-[9px] font-black uppercase tracking-widest ${currentTheme === theme.id ? 'text-slate-900' : 'text-slate-400'}`}>
                {theme.id}
              </span>
            </button>
          ))}
        </div>
      </section>

      {/* Cloud & Sync Section */}
      <section className="space-y-6">
        <h3 className="text-sm font-black text-white/50 uppercase tracking-widest border-b border-white/20 pb-3">Cloud & Persistence</h3>
        <div className="p-8 bg-white rounded-[3rem] shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div className="flex items-center gap-6">
            <div className={`size-14 rounded-full flex items-center justify-center transition-all ${!isConfigMissing ? 'bg-emerald-100 text-emerald-500 shadow-inner' : 'bg-slate-50 text-slate-300'}`}>
              <span className="material-symbols-rounded text-2xl">cloud_sync</span>
            </div>
            <div>
              <h4 className="font-black text-xl text-slate-900">Supabase Backend</h4>
              <p className="text-sm text-slate-500 mt-1 font-medium">{isConfigMissing ? 'Not connected. Data stays locally.' : 'Connected and Syncing with Cloud.'}</p>
            </div>
          </div>
          <button
            onClick={() => setActiveSubModal('DATABASE')}
            className="bg-slate-50 text-slate-500 hover:bg-slate-100 hover:text-slate-800 rounded-full px-6 py-3 font-black text-xs uppercase tracking-widest shadow-sm transition-all"
          >
            Manage Connection
          </button>
        </div>
      </section>

      {/* Focus Section */}
      <section className="space-y-6">
        <h3 className="text-sm font-black text-white/50 uppercase tracking-widest border-b border-white/20 pb-3">Focus & Productivity</h3>

        <div className="p-8 bg-white rounded-[3rem] shadow-sm flex items-center justify-between hover:shadow-md transition-all">
          <div className="flex items-center gap-6">
            <div className={`size-14 rounded-full flex items-center justify-center transition-all ${isFocusMode ? 'bg-[#5f7f8a] text-white shadow-md' : 'bg-slate-50 text-slate-300 shadow-inner'}`}>
              <span className="material-symbols-rounded text-2xl">focus_mode</span>
            </div>
            <div>
              <h4 className="font-black text-xl text-slate-900">Focus / Work Mode</h4>
              <p className="text-sm text-slate-500 mt-1 font-medium">Mute distractions while keeping essential tasks audible.</p>
            </div>
          </div>
          <button
            onClick={() => setIsFocusMode(!isFocusMode)}
            className={`w-16 h-9 rounded-full p-1.5 transition-all flex items-center shadow-inner ${isFocusMode ? 'bg-[#5f7f8a]' : 'bg-slate-200'}`}
          >
            <div className={`size-6 rounded-full bg-white shadow-sm transform transition-transform ${isFocusMode ? 'translate-x-7' : 'translate-x-0'}`} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => setActiveSubModal('SNOOZE')}
            className="group p-8 bg-white rounded-[3rem] text-left hover:shadow-md transition-all flex items-center justify-between shadow-sm cursor-pointer"
          >
            <div>
              <h4 className="font-black text-lg text-slate-900">Smart Snooze</h4>
              <p className="text-xs text-slate-500 mt-1 font-medium">Manage interval presets.</p>
            </div>
            <div className="text-slate-300 group-hover:text-slate-800 transition-colors">
              <span className="material-symbols-rounded">chevron_right</span>
            </div>
          </button>
          <button
            onClick={() => setActiveSubModal('FOCUS')}
            className="group p-8 bg-white rounded-[3rem] text-left hover:shadow-md transition-all flex items-center justify-between shadow-sm cursor-pointer"
          >
            <div>
              <h4 className="font-black text-lg text-slate-900">Focus Rules</h4>
              <p className="text-xs text-slate-500 mt-1 font-medium">Define essential categories.</p>
            </div>
            <div className="text-slate-300 group-hover:text-slate-800 transition-colors">
              <span className="material-symbols-rounded">chevron_right</span>
            </div>
          </button>
        </div>
      </section>

      {/* Database Modal */}
      {activeSubModal === 'DATABASE' && (
        <div className="fixed inset-0 bg-[#5f7f8a]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white text-slate-900 w-full max-w-lg rounded-[3rem] p-10 shadow-xl animate-in zoom-in duration-300 max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h3 className="text-3xl font-black mb-2 tracking-tight">Cloud Connection</h3>
            <p className="text-sm text-slate-500 mb-8 font-medium">Connect your personal Supabase project for real-time syncing.</p>

            <form onSubmit={handleSaveDatabase} className="space-y-6">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 ml-1">Project URL</label>
                <input required type="text" value={dbConfig.url} onChange={e => setDbConfig({ ...dbConfig, url: e.target.value })} placeholder="https://xyz.supabase.co" className="w-full bg-slate-50 rounded-2xl py-4 px-5 border-none font-bold outline-none focus:ring-2 focus:ring-slate-200 transition-all text-slate-800" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2 ml-1">Anon API Key</label>
                <input required type="password" value={dbConfig.key} onChange={e => setDbConfig({ ...dbConfig, key: e.target.value })} placeholder="eyJhbGci..." className="w-full bg-slate-50 rounded-2xl py-4 px-5 border-none font-bold outline-none focus:ring-2 focus:ring-slate-200 transition-all text-slate-800" />
              </div>

              <div className="flex flex-col gap-4 pt-4">
                <button
                  type="button"
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className={`w-full bg-slate-50 text-slate-800 rounded-full py-4 font-black text-sm uppercase tracking-widest transition-all ${isTesting ? 'opacity-50' : 'hover:bg-slate-100'}`}
                >
                  {isTesting ? 'Testing...' : 'Test Connection'}
                </button>
                <div className="flex gap-4">
                  <button type="button" onClick={() => setActiveSubModal(null)} className="flex-1 font-black text-slate-500 hover:text-slate-800 transition-colors">Close</button>
                  <button type="submit" className="flex-[2] bg-[#a86539] text-white rounded-[2rem] py-4 font-black shadow-sm hover:-translate-y-0.5 transition-transform">Save & Connect</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
