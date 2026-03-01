import React, { useState, useMemo } from 'react';
import { Note, ChecklistItem } from '../types';

interface NotesManagerProps {
    notes: Note[];
    setNotes: React.Dispatch<React.SetStateAction<Note[]>>;
    removeFromDB: (table: string, id: string) => Promise<void>;
    saveToDB: (table: string, data: any) => Promise<void>;
}

const COLORS = [
    'bg-slate-800',  // Default dark
    'bg-emerald-900', // Green
    'bg-sky-900',     // Blue
    'bg-indigo-900',  // Purple
    'bg-rose-900',    // Red
    'bg-amber-900'    // Yellow/Orange
];

const NotesManager: React.FC<NotesManagerProps> = ({ notes, setNotes, removeFromDB, saveToDB }) => {
    const [modalOpen, setModalOpen] = useState(false);
    const [editingNote, setEditingNote] = useState<Note | null>(null);

    // Form state
    const [title, setTitle] = useState('');
    const [content, setContent] = useState('');
    const [type, setType] = useState<'TEXT' | 'CHECKLIST'>('TEXT');
    const [color, setColor] = useState(COLORS[0]);
    const [isPinned, setIsPinned] = useState(false);
    const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
    const [newItemText, setNewItemText] = useState('');

    const openNewNoteModal = (noteType: 'TEXT' | 'CHECKLIST') => {
        setEditingNote(null);
        setTitle('');
        setContent('');
        setType(noteType);
        setColor(COLORS[0]);
        setIsPinned(false);
        setChecklistItems([]);
        setNewItemText('');
        setModalOpen(true);
    };

    const openEditModal = (note: Note) => {
        setEditingNote(note);
        setTitle(note.title);
        setContent(note.content || '');
        setType(note.type);
        setColor(note.color || COLORS[0]);
        setIsPinned(note.isPinned);
        setChecklistItems(note.items || []);
        setNewItemText('');
        setModalOpen(true);
    };

    const handleSave = async () => {
        if (!title.trim() && !content.trim() && checklistItems.length === 0) {
            setModalOpen(false); // Don't save completely empty notes
            return;
        }

        const noteToSave: Note = {
            id: editingNote ? editingNote.id : Math.random().toString(36).substr(2, 9),
            title: title.trim(),
            content: type === 'TEXT' ? content.trim() : '',
            items: type === 'CHECKLIST' ? checklistItems : [],
            type,
            color,
            isPinned,
            createdAt: editingNote ? editingNote.createdAt : new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const previousNotes = [...notes];

        if (editingNote) {
            setNotes(prev => prev.map(n => n.id === noteToSave.id ? noteToSave : n));
        } else {
            setNotes(prev => [noteToSave, ...prev]);
        }

        try {
            await saveToDB('notes', noteToSave);
            setModalOpen(false);
        } catch (err) {
            setNotes(previousNotes);
            alert('Failed to save note.');
        }
    };

    const handleDelete = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!confirm('Delete this note?')) return;

        const previousNotes = [...notes];
        setNotes(prev => prev.filter(n => n.id !== id));
        if (editingNote?.id === id) setModalOpen(false);

        try {
            await removeFromDB('notes', id);
        } catch (err) {
            setNotes(previousNotes);
            alert('Failed to delete note.');
        }
    };

    const togglePin = async (note: Note, e: React.MouseEvent) => {
        e.stopPropagation();
        const updatedNote = { ...note, isPinned: !note.isPinned, updatedAt: new Date().toISOString() };
        const previousNotes = [...notes];

        setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));
        try {
            await saveToDB('notes', updatedNote);
        } catch (err) {
            setNotes(previousNotes);
        }
    };

    const toggleChecklistItemInline = async (note: Note, itemId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!note.items) return;

        const newItems = note.items.map(i => i.id === itemId ? { ...i, isCompleted: !i.isCompleted } : i);
        const updatedNote = { ...note, items: newItems, updatedAt: new Date().toISOString() };

        const previousNotes = [...notes];
        setNotes(prev => prev.map(n => n.id === updatedNote.id ? updatedNote : n));

        try {
            await saveToDB('notes', updatedNote);
        } catch (err) {
            setNotes(previousNotes);
        }
    };

    const addChecklistItem = (e: React.KeyboardEvent | React.MouseEvent) => {
        if ('key' in e && e.key !== 'Enter') return;
        if ('preventDefault' in e) e.preventDefault();

        if (!newItemText.trim()) return;

        setChecklistItems([...checklistItems, { id: Math.random().toString(36).substr(2, 9), text: newItemText.trim(), isCompleted: false }]);
        setNewItemText('');
    };

    const updateChecklistItemModal = (id: string, isCompleted: boolean) => {
        setChecklistItems(prev => prev.map(i => i.id === id ? { ...i, isCompleted } : i));
    };

    const removeChecklistItemModal = (id: string) => {
        setChecklistItems(prev => prev.filter(i => i.id !== id));
    };

    const sortedNotes = useMemo(() => {
        const pinned = notes.filter(n => n.isPinned).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        const unpinned = notes.filter(n => !n.isPinned).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return { pinned, unpinned };
    }, [notes]);

    const renderNoteCard = (note: Note) => {
        return (
            <div
                key={note.id}
                onClick={() => openEditModal(note)}
                className={`${note.color || 'bg-slate-800'} p-5 rounded-2xl border border-white/5 hover:border-white/20 transition-all cursor-pointer group relative shadow-md break-inside-avoid mb-4`}
            >
                <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                    <button onClick={(e) => togglePin(note, e)} className="p-1.5 hover:bg-black/20 rounded-full text-slate-300">
                        <span className="material-symbols-rounded text-sm">{note.isPinned ? 'keep' : 'keep_public'}</span>
                    </button>
                    <button onClick={(e) => handleDelete(note.id, e)} className="p-1.5 hover:bg-rose-500/20 rounded-full text-slate-300 hover:text-rose-400">
                        <span className="material-symbols-rounded text-sm">delete</span>
                    </button>
                </div>

                {note.title && <h4 className="font-bold text-lg mb-3 pr-10 text-slate-100">{note.title}</h4>}

                {note.type === 'TEXT' && (
                    <p className="text-sm text-slate-300 whitespace-pre-wrap line-clamp-6">{note.content}</p>
                )}

                {note.type === 'CHECKLIST' && note.items && (
                    <div className="space-y-1 mt-2">
                        {note.items.slice(0, 5).map(item => (
                            <div key={item.id} className="flex items-start gap-2 group/item">
                                <button
                                    onClick={(e) => toggleChecklistItemInline(note, item.id, e)}
                                    className={`mt-0.5 size-4 rounded flex items-center justify-center border shrink-0 ${item.isCompleted ? 'bg-primary border-primary' : 'border-slate-400'}`}
                                >
                                    {item.isCompleted && <span className="material-symbols-rounded text-[10px] text-white">check</span>}
                                </button>
                                <span className={`text-sm line-clamp-2 ${item.isCompleted ? 'line-through text-slate-500' : 'text-slate-300'}`}>
                                    {item.text}
                                </span>
                            </div>
                        ))}
                        {note.items.length > 5 && (
                            <p className="text-xs font-bold text-slate-400 mt-2">+{note.items.length - 5} more items</p>
                        )}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="p-6 md:p-10 max-w-7xl mx-auto pb-32">
            <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-10">
                <div className="text-white">
                    <h2 className="text-4xl font-black pb-1 tracking-tight">Notes & Lists</h2>
                    <p className="text-white/70">Capture ideas, checklists, and everything in between.</p>
                </div>
            </header>

            {/* Quick Add Bar */}
            <div className="max-w-2xl mx-auto mb-16 shadow-2xl relative z-20">
                <div className="glass-panel p-2 rounded-full flex items-center gap-2">
                    <button
                        onClick={() => openNewNoteModal('TEXT')}
                        className="flex-1 bg-transparent hover:bg-white/5 text-slate-300 py-3 px-6 rounded-full text-left font-bold transition-colors flex items-center gap-3"
                    >
                        <span className="material-symbols-rounded text-slate-400">edit_note</span>
                        Take a note...
                    </button>
                    <button
                        onClick={() => openNewNoteModal('CHECKLIST')}
                        className="size-12 rounded-full hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
                        title="New List"
                    >
                        <span className="material-symbols-rounded">checklist</span>
                    </button>
                </div>
            </div>

            {notes.length === 0 ? (
                <div className="text-center py-20 animate-in fade-in duration-500">
                    <span className="material-symbols-rounded text-6xl text-slate-600 mb-4 block">lightbulb</span>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-sm">Notes you add appear here</p>
                </div>
            ) : (
                <div className="space-y-12">
                    {sortedNotes.pinned.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 ml-2">Pinned</p>
                            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
                                {sortedNotes.pinned.map(renderNoteCard)}
                            </div>
                        </div>
                    )}

                    {sortedNotes.unpinned.length > 0 && (
                        <div>
                            {sortedNotes.pinned.length > 0 && <p className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-4 ml-2 mt-6">Others</p>}
                            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-4">
                                {sortedNotes.unpinned.map(renderNoteCard)}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Editor Modal */}
            {modalOpen && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4 sm:p-6 shadow-2xl overflow-y-auto">
                    <div
                        className={`w-full max-w-2xl rounded-3xl overflow-hidden flex flex-col shadow-2xl border border-white/10 animate-in zoom-in-95 duration-200 ${color}`}
                        style={{ maxHeight: 'calc(100vh - 40px)' }}
                    >
                        <div className="p-4 sm:p-6 flex flex-col flex-1 overflow-y-auto custom-scrollbar">
                            <input
                                type="text"
                                value={title}
                                onChange={e => setTitle(e.target.value)}
                                placeholder="Title"
                                className="w-full bg-transparent border-none text-xl sm:text-2xl font-bold text-white placeholder-slate-400 focus:ring-0 px-0 focus:outline-none mb-4"
                            />

                            {type === 'TEXT' ? (
                                <textarea
                                    value={content}
                                    onChange={e => setContent(e.target.value)}
                                    placeholder="Take a note..."
                                    className="w-full bg-transparent border-none text-base text-slate-200 placeholder-slate-400 focus:ring-0 px-0 focus:outline-none resize-none flex-1 min-h-[200px]"
                                />
                            ) : (
                                <div className="flex-1 min-h-[200px] flex flex-col gap-2">
                                    {checklistItems.map(item => (
                                        <div key={item.id} className="flex items-center gap-3">
                                            <button
                                                onClick={() => updateChecklistItemModal(item.id, !item.isCompleted)}
                                                className={`size-5 rounded flex items-center justify-center border shrink-0 ${item.isCompleted ? 'bg-primary border-primary' : 'border-slate-400'}`}
                                            >
                                                {item.isCompleted && <span className="material-symbols-rounded text-xs text-white">check</span>}
                                            </button>
                                            <input
                                                type="text"
                                                value={item.text}
                                                onChange={e => setChecklistItems(prev => prev.map(i => i.id === item.id ? { ...i, text: e.target.value } : i))}
                                                className={`flex-1 bg-transparent border-none text-base focus:ring-0 px-0 focus:outline-none ${item.isCompleted ? 'line-through text-slate-500' : 'text-slate-200'}`}
                                            />
                                            <button onClick={() => removeChecklistItemModal(item.id)} className="p-1 text-slate-400 hover:text-rose-400">✕</button>
                                        </div>
                                    ))}
                                    <div className="flex items-center gap-3 mt-2 border-t border-white/10 pt-2">
                                        <span className="material-symbols-rounded text-slate-400 shrink-0">add</span>
                                        <input
                                            type="text"
                                            value={newItemText}
                                            onChange={e => setNewItemText(e.target.value)}
                                            onKeyDown={addChecklistItem}
                                            placeholder="List item..."
                                            className="flex-1 bg-transparent border-none text-base text-slate-200 placeholder-slate-400 focus:ring-0 px-0 focus:outline-none"
                                        />
                                        <button onClick={addChecklistItem} className="px-3 py-1 bg-white/10 rounded-lg text-xs font-bold hover:bg-white/20">Add</button>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-white/10 flex items-center justify-between bg-black/20">
                            <div className="flex items-center gap-2">
                                <div className="flex bg-black/20 rounded-xl p-1">
                                    {COLORS.map(c => (
                                        <button
                                            key={c}
                                            onClick={() => setColor(c)}
                                            className={`size-6 rounded-full m-0.5 border-2 ${c} ${color === c ? 'border-white' : 'border-transparent'}`}
                                        />
                                    ))}
                                </div>
                                <button
                                    onClick={() => setIsPinned(!isPinned)}
                                    className={`size-10 rounded-xl flex items-center justify-center transition-colors ${isPinned ? 'bg-white/20 text-white' : 'hover:bg-white/10 text-slate-400'}`}
                                    title={isPinned ? 'Unpin note' : 'Pin note'}
                                >
                                    <span className="material-symbols-rounded text-lg">keep</span>
                                </button>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-xl text-sm font-bold text-slate-300 hover:bg-white/10">Close</button>
                                <button onClick={handleSave} className="px-6 py-2 rounded-xl text-sm font-black bg-white text-slate-900 shadow-xl hover:-translate-y-0.5 transition-transform">Save</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default NotesManager;
