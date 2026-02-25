
import React, { useState, useMemo } from 'react';
import { PasswordEntry, PasswordHistoryItem } from '../types';

interface PasswordManagerProps {
  passwords: PasswordEntry[];
  setPasswords: React.Dispatch<React.SetStateAction<PasswordEntry[]>>;
  removeFromDB: (table: string, id: string) => Promise<void>;
  saveToDB: (table: string, data: any) => Promise<void>;
}

const PasswordManager: React.FC<PasswordManagerProps> = ({ passwords, setPasswords, removeFromDB, saveToDB }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<PasswordEntry | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [pendingEntryId, setPendingEntryId] = useState<string | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isHistoryViewOpen, setIsHistoryViewOpen] = useState(false);

  const [editForm, setEditForm] = useState({ service: '', username: '', passwordString: '', notes: '' });

  const filteredPasswords = useMemo(() => {
    return passwords.filter(p => p.service.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [passwords, searchTerm]);

  const handleEntryClick = (entry: PasswordEntry) => {
    if (!isAuthenticated) {
      setPendingEntryId(entry.id);
      setIsAuthModalOpen(true);
    } else {
      setSelectedEntry(entry);
      setIsHistoryViewOpen(false);
    }
  };

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pin === '1234') { // Mock PIN
      setIsAuthenticated(true);
      setIsAuthModalOpen(false);
      setPin('');
      const entry = passwords.find(p => p.id === pendingEntryId);
      if (entry) setSelectedEntry(entry);
    } else {
      alert('Invalid PIN. Use 1234 for demo.');
      setPin('');
    }
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    // Note: Auto-clearing clipboard is technically difficult in cross-browser 
    // without specific user interaction for the clear, but we show feedback.
    alert(`${label} copied!`);
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEntry) return;

    const previous = [...passwords];
    let updated: PasswordEntry | null = null;

    setPasswords(prev => prev.map(p => {
      if (p.id === selectedEntry.id) {
        const hasChanged = p.passwordString !== editForm.passwordString;
        const newHistory = hasChanged
          ? [{ date: new Date().toISOString(), passwordString: p.passwordString }, ...p.history]
          : p.history;

        updated = { ...p, ...editForm, history: newHistory };
        setSelectedEntry(updated);
        return updated;
      }
      return p;
    }));

    try {
      if (updated) await saveToDB('passwords', updated);
      setIsEditModalOpen(false);
    } catch (err) {
      setPasswords(previous);
      alert('Failed to save changes.');
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const newEntry: PasswordEntry = {
      id: Math.random().toString(36).substr(2, 9),
      ...editForm,
      history: []
    };

    const previous = [...passwords];
    setPasswords(prev => [...prev, newEntry]);

    try {
      await saveToDB('passwords', newEntry);
      setIsAddModalOpen(false);
      setEditForm({ service: '', username: '', passwordString: '', notes: '' });
    } catch (err) {
      setPasswords(previous);
      alert('Failed to create entry.');
    }
  };

  const deleteEntry = async (id: string) => {
    if (confirm('Are you sure you want to delete this vault entry?')) {
      const previous = [...passwords];
      try {
        setPasswords(prev => prev.filter(p => p.id !== id));
        setSelectedEntry(null);
        await removeFromDB('passwords', id);
      } catch (err) {
        setPasswords(previous);
        alert('Failed to delete from cloud.');
      }
    }
  };

  const openEdit = () => {
    if (!selectedEntry) return;
    setEditForm({
      service: selectedEntry.service,
      username: selectedEntry.username,
      passwordString: selectedEntry.passwordString,
      notes: selectedEntry.notes
    });
    setIsEditModalOpen(true);
  };

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto flex flex-col h-full space-y-8 pb-32">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="text-white">
          <h2 className="text-4xl font-black pb-1">Secure Vault</h2>
          <p className="text-white/70 mt-1">Encrypted storage for your digital identities.</p>
        </div>
        <button
          onClick={() => {
            setEditForm({ service: '', username: '', passwordString: '', notes: '' });
            setIsAddModalOpen(true);
          }}
          className="bg-white text-slate-900 px-8 py-3.5 flex items-center gap-2 rounded-full font-black text-sm hover:-translate-y-0.5 transition-transform shadow-sm"
        >
          <span className="text-lg">+</span> New Entry
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 flex-1">
        {/* Search & List */}
        <div className="lg:col-span-5 space-y-6">
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <span className="material-symbols-rounded">search</span>
            </span>
            <input
              type="text"
              placeholder="Search services..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white text-slate-900 rounded-full py-4 pl-12 pr-4 focus:ring-2 focus:ring-slate-200 outline-none font-bold shadow-sm placeholder:text-slate-400"
            />
          </div>

          <div className="space-y-3 overflow-y-auto custom-scrollbar max-h-[60vh] pr-2">
            {filteredPasswords.map(entry => (
              <button
                key={entry.id}
                onClick={() => handleEntryClick(entry)}
                className={`w-full group flex items-center justify-between p-5 rounded-[2rem] transition-all duration-300 shadow-sm ${selectedEntry?.id === entry.id
                  ? 'bg-slate-50 border border-slate-200'
                  : 'bg-white hover:shadow-md border border-transparent cursor-pointer'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <div className={`size-12 rounded-full flex items-center justify-center font-black text-xl shadow-inner ${selectedEntry?.id === entry.id ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'
                    }`}>
                    {entry.service.charAt(0)}
                  </div>
                  <div className="text-left">
                    <p className="font-bold text-slate-900 text-lg">{entry.service}</p>
                    <p className="text-xs text-slate-400 font-medium">••••••••••••</p>
                  </div>
                </div>
                {!isAuthenticated ? (
                  <span className="material-symbols-rounded text-slate-300">lock</span>
                ) : (
                  <span className="material-symbols-rounded text-slate-300">chevron_right</span>
                )}
              </button>
            ))}
            {filteredPasswords.length === 0 && (
              <div className="text-center py-10 text-slate-400">
                <p className="font-bold">No vault entries found</p>
              </div>
            )}
          </div>
        </div>

        {/* Details View */}
        <div className="lg:col-span-7">
          {selectedEntry ? (
            <div className="bg-white text-slate-900 p-10 rounded-[3rem] shadow-sm space-y-10 sticky top-10 animate-in fade-in slide-in-from-right-4 duration-500">
              <header className="flex items-start justify-between">
                <div className="flex items-center gap-6">
                  <div className="size-20 rounded-full bg-slate-100 flex items-center justify-center text-4xl font-black shadow-inner">
                    {selectedEntry.service.charAt(0)}
                  </div>
                  <div>
                    <h3 className="text-3xl font-black pb-1">{selectedEntry.service}</h3>
                    <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] mt-1">Locked with AES-256</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={openEdit} className="p-3 bg-slate-100 rounded-full hover:bg-slate-200 transition-all flex items-center justify-center text-slate-500 hover:text-slate-800">
                    <span className="material-symbols-rounded text-lg">edit</span>
                  </button>
                  <button onClick={() => deleteEntry(selectedEntry.id)} className="p-3 bg-rose-50 text-rose-500 rounded-full hover:bg-rose-100 transition-all flex items-center justify-center">
                    <span className="material-symbols-rounded text-lg">delete</span>
                  </button>
                </div>
              </header>

              <div className="space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Username</label>
                    <div className="group relative">
                      <input readOnly value={selectedEntry.username} className="w-full bg-slate-50 py-4 px-5 font-bold text-sm border-none rounded-2xl outline-none" />
                      <button
                        onClick={() => handleCopy(selectedEntry.username, 'Username')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-white rounded-lg shadow-sm hover:text-slate-800 transition-all opacity-0 group-hover:opacity-100 text-slate-500"
                      >
                        <span className="material-symbols-rounded text-sm">content_copy</span>
                      </button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Password</label>
                    <div className="group relative">
                      <input readOnly value={selectedEntry.passwordString} className="w-full bg-slate-50 py-4 px-5 font-mono text-sm tracking-wider border-none rounded-2xl outline-none" />
                      <button
                        onClick={() => handleCopy(selectedEntry.passwordString, 'Password')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 bg-white rounded-lg shadow-sm hover:text-slate-800 text-slate-500 transition-all opacity-0 group-hover:opacity-100"
                      >
                        <span className="material-symbols-rounded text-sm">content_copy</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block ml-1">Notes</label>
                  <p className="bg-slate-50 rounded-2xl p-5 text-sm text-slate-600 leading-relaxed font-medium">
                    {selectedEntry.notes || "No additional notes for this entry."}
                  </p>
                </div>

                <div className="pt-6 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-6">
                    <h4 className="font-black text-sm uppercase tracking-widest text-slate-400">Password History</h4>
                    <span className="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full text-[10px] font-bold">{selectedEntry.history.length} Previous</span>
                  </div>

                  <div className="space-y-3">
                    {selectedEntry.history.length > 0 ? selectedEntry.history.map((h, i) => (
                      <div key={i} className="flex items-center justify-between p-4 glass-card bg-white/50 dark:bg-slate-900/50 border-transparent hover:border-slate-200 transition-all group">
                        <div>
                          <p className="text-xs font-mono font-bold text-slate-400 group-hover:text-slate-600">••••••••••••</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tight mt-1">{new Date(h.date).toLocaleDateString()} @ {new Date(h.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <button
                          onClick={() => handleCopy(h.passwordString, 'Previous password')}
                          className="text-[10px] font-black text-primary uppercase tracking-widest hover:underline"
                        >
                          Reveal & Copy
                        </button>
                      </div>
                    )) : (
                      <p className="text-xs text-slate-400 italic text-center py-4">This password has never been changed.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full glass-card border-dashed border-2 flex flex-col items-center justify-center text-slate-400 p-12 text-center">
              <div className="size-24 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center mb-6 animate-pulse">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              </div>
              <h3 className="text-xl font-black text-slate-300">Vault Selection Required</h3>
              <p className="max-w-xs text-sm mt-2 font-medium">Select a service to view details. You will need your Master PIN for first-time access.</p>
            </div>
          )}
        </div>
      </div>

      {/* PIN Auth Modal */}
      {isAuthModalOpen && (
        <div className="fixed inset-0 bg-[#5f7f8a]/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6">
          <div className="bg-white text-slate-900 w-full max-w-sm rounded-[3rem] p-10 shadow-xl animate-in zoom-in duration-300">
            <div className="text-center space-y-4 mb-8">
              <div className="size-20 mx-auto bg-[#fce1cd] text-[#a86539] rounded-[2rem] flex items-center justify-center mb-6">
                <span className="material-symbols-rounded text-4xl">lock</span>
              </div>
              <h3 className="text-3xl font-black tracking-tight text-slate-900">Vault Locked</h3>
              <p className="text-slate-500 font-medium pb-2">Enter your master PIN to access credentials</p>

              <div className="flex justify-center gap-4 mb-8">
                {[0, 1, 2, 3].map(i => (
                  <div
                    key={i}
                    className={`size-4 rounded-full transition-all duration-300 ${i < pin.length ? 'bg-[#5f7f8a] scale-110' : 'bg-slate-200'}`}
                  />
                ))}
              </div>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-8">
              <input
                autoFocus
                type="password"
                maxLength={4}
                value={pin}
                onChange={e => setPin(e.target.value)}
                className="sr-only"
                placeholder="****"
              />

              <div className="grid grid-cols-3 gap-6 mb-8 px-2">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setPin(p => p.length < 4 ? p + num.toString() : p)}
                    className="size-16 mx-auto rounded-full bg-slate-50 text-slate-800 text-2xl font-black shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
                  >
                    {num}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => { setIsAuthModalOpen(false); setPin(''); }}
                  className="size-16 mx-auto rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 transition-colors"
                >
                  C
                </button>
                <button
                  type="button"
                  onClick={() => setPin(p => p.length < 4 ? p + '0' : p)}
                  className="size-16 mx-auto rounded-full bg-slate-50 text-slate-800 text-2xl font-black shadow-sm hover:shadow-md hover:-translate-y-1 transition-all"
                >
                  0
                </button>
                <button
                  type="submit"
                  className="size-16 mx-auto rounded-full bg-slate-100 flex items-center justify-center text-slate-500 font-bold hover:bg-slate-200 transition-colors"
                >
                  <span className="material-symbols-rounded">check</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit/Add Modal */}
      {(isEditModalOpen || isAddModalOpen) && (
        <div className="fixed inset-0 bg-[#5f7f8a]/80 backdrop-blur-sm z-[200] flex items-center justify-center p-6 overflow-y-auto">
          <div className="bg-white w-full max-w-lg rounded-[3rem] p-10 shadow-xl animate-in fade-in zoom-in duration-300">
            <h3 className="text-3xl font-black mb-8 text-slate-900">{isAddModalOpen ? 'New Vault Entry' : 'Edit Credentials'}</h3>

            <form onSubmit={isAddModalOpen ? handleAdd : handleUpdate} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Service Name</label>
                  <input
                    required
                    type="text"
                    value={editForm.service}
                    onChange={e => setEditForm({ ...editForm, service: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 font-bold focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                    placeholder="e.g. Google, Netflix..."
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Username / Email</label>
                  <input
                    required
                    type="text"
                    value={editForm.username}
                    onChange={e => setEditForm({ ...editForm, username: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 font-bold focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Password</label>
                  <input
                    required
                    type="text"
                    value={editForm.passwordString}
                    onChange={e => setEditForm({ ...editForm, passwordString: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 font-mono font-bold focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Notes</label>
                  <textarea
                    rows={3}
                    value={editForm.notes}
                    onChange={e => setEditForm({ ...editForm, notes: e.target.value })}
                    className="w-full bg-slate-50 border-none rounded-2xl py-4 px-5 font-medium focus:ring-2 focus:ring-slate-200 outline-none resize-none transition-all"
                    placeholder="Recovery phrases, hint, etc..."
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-6">
                <button
                  type="button"
                  onClick={() => { setIsEditModalOpen(false); setIsAddModalOpen(false); }}
                  className="flex-1 py-4 font-black text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-slate-900 text-white rounded-[2rem] py-4 font-black shadow-sm hover:shadow-md transition-all"
                >
                  {isAddModalOpen ? 'Create Entry' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PasswordManager;
