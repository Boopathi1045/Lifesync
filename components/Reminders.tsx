
import React, { useState } from 'react';
import { Reminder, ReminderCategory } from '../types';
import { TABLES } from '../lib/supabase';

interface RemindersProps {
  reminders: Reminder[];
  setReminders: React.Dispatch<React.SetStateAction<Reminder[]>>;
  snoozePresets: number[];
  removeFromDB: (table: string, id: string) => Promise<void>;
  saveReminderToDB: (reminder: Reminder) => Promise<void>;
}

interface ReminderForm {
  id?: string;
  title: string;
  description: string;
  date: string;
  time: string;
  category: ReminderCategory;
}

const Reminders: React.FC<RemindersProps> = ({ reminders, setReminders, snoozePresets, removeFromDB, saveReminderToDB }) => {
  const [activeTab, setActiveTab] = useState<'ALL' | 'GENERAL' | 'WORK'>('ALL');
  const [showModal, setShowModal] = useState<'ADD' | 'EDIT' | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  // Form State
  const [form, setForm] = useState<ReminderForm>({
    title: '',
    description: '',
    date: new Date().toISOString().split('T')[0],
    time: '09:00',
    category: ReminderCategory.GENERAL
  });

  const filteredReminders = reminders.filter(r => {
    const matchesTab = activeTab === 'ALL' || r.category === activeTab;
    const matchesArchive = showArchived ? r.isDone : !r.isDone;
    return matchesTab && matchesArchive;
  });

  const handleOpenEdit = (reminder: Reminder) => {
    const [date, time] = reminder.dueDate.split('T');
    setForm({
      id: reminder.id,
      title: reminder.title,
      description: reminder.description,
      date,
      time: time ? time.substring(0, 5) : '09:00',
      category: reminder.category
    });
    setShowModal('EDIT');
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;

    // Create date assuming input is IST, and convert to UTC ISO string
    const istDateString = `${form.date}T${form.time}:00+05:30`;
    const utcDate = new Date(istDateString);
    const dueDateISO = utcDate.toISOString();

    const previousReminders = [...reminders];
    let updatedReminder: Reminder;

    if (showModal === 'ADD') {
      updatedReminder = {
        id: Math.random().toString(36).substr(2, 9),
        title: form.title,
        description: form.description,
        dueDate: dueDateISO,
        category: form.category,
        isDone: false
      };
      setReminders(prev => [...prev, updatedReminder]);
    } else {
      updatedReminder = {
        ...reminders.find(r => r.id === form.id)!,
        title: form.title,
        description: form.description,
        dueDate: dueDateISO,
        category: form.category
      };
      setReminders(prev => prev.map(r => r.id === form.id ? updatedReminder : r));
    }

    try {
      await saveReminderToDB(updatedReminder);
      setShowModal(null);
    } catch (err) {
      setReminders(previousReminders);
      alert("Failed to save to cloud. Reverting changes.");
    }
  };

  const performAction = async (id: string, action: 'DONE' | 'RESTORE' | 'SKIP' | 'SNOOZE', minutes?: number) => {
    const r = reminders.find(item => item.id === id);
    if (!r) return;

    const previousReminders = [...reminders];
    let updated: Reminder = { ...r };
    if (action === 'DONE') updated.isDone = true;
    if (action === 'RESTORE') updated.isDone = false;
    if (action === 'SKIP') {
      const nextDate = new Date(r.dueDate);
      nextDate.setDate(nextDate.getDate() + 1);
      updated.dueDate = nextDate.toISOString();
    }
    if (action === 'SNOOZE' && minutes !== undefined) {
      const snoozeDate = new Date(r.dueDate);
      snoozeDate.setMinutes(snoozeDate.getMinutes() + minutes);
      updated.dueDate = snoozeDate.toISOString();
    }

    setReminders(prev => prev.map(item => item.id === id ? updated : item));

    try {
      await saveReminderToDB(updated);
      if (action === 'DONE' || action === 'RESTORE') setExpandedId(null);
    } catch (err) {
      setReminders(previousReminders);
      alert("Action failed. Reverting state.");
    }
  };

  const deleteReminder = async (id: string) => {
    // 1. Capture current state for rollback
    const previousReminders = [...reminders];

    try {
      // 2. Optimistically remove from local state immediately
      setReminders(prev => prev.filter(r => r.id !== id));
      if (expandedId === id) setExpandedId(null);

      // 3. Perform the actual deletion in the background
      await removeFromDB(TABLES.REMINDERS, id);
    } catch (err) {
      console.error("Delete failed:", err);
      // 4. Rollback if the database operation fails
      setReminders(previousReminders);
      alert("Failed to delete from cloud. Restoring item to list.");
    }
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6 relative pb-32">
      <header className="flex items-center justify-between text-white">
        <h2 className="text-3xl font-black pb-1">Reminders</h2>
        <button
          onClick={() => { setShowArchived(!showArchived); setExpandedId(null); }}
          className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${showArchived ? 'bg-white text-slate-900 shadow-sm' : 'bg-white/10 text-white hover:bg-white/20'}`}
        >
          {showArchived ? 'Active' : 'Archived'}
        </button>
      </header>

      {/* Tabs */}
      <div className="flex bg-white p-1.5 w-full sm:w-fit rounded-full shadow-sm">
        {(['ALL', 'GENERAL', 'WORK'] as const).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} className={`px-6 py-2 rounded-full font-bold text-xs transition-all ${activeTab === tab ? 'bg-[#5f7f8a] text-white shadow-sm' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>{tab}</button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredReminders.map(reminder => {
          const isExpanded = expandedId === reminder.id;
          const dateObj = new Date(reminder.dueDate);

          return (
            <div key={reminder.id} className={`overflow-hidden bg-white rounded-3xl transition-all shadow-sm ${isExpanded ? 'ring-2 ring-slate-200' : 'hover:shadow-md'}`}>
              <div onClick={() => setExpandedId(isExpanded ? null : reminder.id)} className="p-5 cursor-pointer flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className={`size-10 rounded-full flex items-center justify-center font-bold ${reminder.isDone ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>
                    {reminder.isDone ? <span className="material-symbols-rounded text-lg">check</span> : <span className="material-symbols-rounded text-lg">schedule</span>}
                  </div>
                  <div>
                    <h4 className={`text-base font-bold ${reminder.isDone ? 'line-through text-slate-400' : 'text-slate-900'}`}>{reminder.title}</h4>
                    <p className="text-[10px] font-bold text-slate-400 uppercase">{dateObj.toLocaleDateString()} @ {dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={(e) => { e.stopPropagation(); handleOpenEdit(reminder); }} className="size-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-400 hover:text-slate-800 transition-colors">
                    <span className="material-symbols-rounded text-sm">edit</span>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); deleteReminder(reminder.id); }} className="size-8 rounded-full bg-rose-50 flex items-center justify-center text-rose-400 hover:text-rose-600 transition-colors">
                    <span className="material-symbols-rounded text-sm">delete</span>
                  </button>
                </div>
              </div>

              {isExpanded && (
                <div className="px-5 pb-5 pt-3 border-t border-slate-100 space-y-4 bg-slate-50/50">
                  <p className="text-sm text-slate-600 font-medium">{reminder.description || "No notes."}</p>
                  <div className="flex flex-wrap gap-2 pt-2">
                    {reminder.isDone ? (
                      <button onClick={() => performAction(reminder.id, 'RESTORE')} className="px-4 py-2 rounded-full text-xs font-black uppercase bg-slate-200 text-slate-600 hover:bg-slate-300 shadow-sm transition-colors">Restore</button>
                    ) : (
                      <>
                        <button onClick={() => performAction(reminder.id, 'DONE')} className="bg-[#5f7f8a] text-white px-4 py-2 rounded-full text-xs font-black uppercase shadow-sm hover:shadow-md transition-all">Done</button>
                        <button onClick={() => performAction(reminder.id, 'SKIP')} className="bg-white text-slate-500 px-4 py-2 rounded-full text-xs font-black uppercase hover:text-slate-800 shadow-sm transition-colors">Tomorrow</button>
                        {snoozePresets.slice(0, 1).map(m => (
                          <button key={m} onClick={() => performAction(reminder.id, 'SNOOZE', m)} className="bg-white text-slate-500 px-4 py-2 rounded-full text-xs font-black uppercase hover:text-slate-800 shadow-sm transition-colors">+{m}m</button>
                        ))}
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* FAB */}
      <button
        onClick={() => { setForm({ title: '', description: '', date: new Date().toISOString().split('T')[0], time: '09:00', category: ReminderCategory.GENERAL }); setShowModal('ADD'); }}
        className="fixed bottom-8 right-8 size-16 bg-slate-900 text-white rounded-[2rem] flex items-center justify-center font-black shadow-xl z-50 hover:-translate-y-1 transition-transform"
      >
        <span className="text-3xl leading-none">+</span>
      </button>

      {/* COMPACT & SCROLLABLE MODAL */}
      {showModal && (
        <div className="fixed inset-0 bg-[#5f7f8a]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white text-slate-900 w-full max-w-sm rounded-[2.5rem] flex flex-col max-h-[80vh] overflow-hidden shadow-xl animate-in zoom-in duration-300">
            <header className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-xl">{showModal === 'ADD' ? 'New Task' : 'Edit Task'}</h3>
              <button onClick={() => setShowModal(null)} className="size-8 bg-slate-100 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 transition-colors">
                <span className="material-symbols-rounded text-sm">close</span>
              </button>
            </header>

            <div className="p-6 overflow-y-auto custom-scrollbar space-y-6 flex-1">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Title</label>
                <input required autoFocus type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-5 font-bold text-sm outline-none focus:ring-2 focus:ring-slate-200 transition-all" />
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Notes</label>
                <textarea rows={2} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} className="w-full bg-slate-50 border-none rounded-2xl py-3 px-5 text-sm font-medium resize-none outline-none focus:ring-2 focus:ring-slate-200 transition-all" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Date</label>
                  <input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} className="w-full bg-slate-50 border-none rounded-2xl py-2.5 px-4 font-bold text-sm focus:ring-2 outline-none focus:ring-slate-200 text-slate-800" />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Time</label>
                  <input type="time" value={form.time} onChange={e => setForm({ ...form, time: e.target.value })} className="w-full bg-slate-50 border-none rounded-2xl py-2.5 px-4 font-bold text-sm focus:ring-2 outline-none focus:ring-slate-200 text-slate-800" />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Category</label>
                <div className="flex gap-2 p-1.5 bg-slate-50 rounded-2xl">
                  <button type="button" onClick={() => setForm({ ...form, category: ReminderCategory.GENERAL })} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase ${form.category === ReminderCategory.GENERAL ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400'}`}>General</button>
                  <button type="button" onClick={() => setForm({ ...form, category: ReminderCategory.WORK })} className={`flex-1 py-2 rounded-xl text-[10px] font-black uppercase ${form.category === ReminderCategory.WORK ? 'bg-white text-amber-500 shadow-sm' : 'text-slate-400'}`}>Work</button>
                </div>
              </div>
            </div>

            <footer className="p-6 border-t border-slate-100 flex gap-4">
              <button type="button" onClick={() => setShowModal(null)} className="flex-1 font-black text-xs text-slate-400 uppercase hover:text-slate-800 transition-colors">Cancel</button>
              <button onClick={handleFormSubmit} className="flex-[2] bg-slate-900 text-white py-3.5 rounded-2xl text-xs font-black uppercase shadow-sm hover:-translate-y-0.5 transition-transform">Save</button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
};

export default Reminders;
