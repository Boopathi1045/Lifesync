
import React, { useState, useMemo } from 'react';
import { MediaItem } from '../types';

interface WatchLaterProps {
  media: MediaItem[];
  setMedia: React.Dispatch<React.SetStateAction<MediaItem[]>>;
  removeFromDB: (table: string, id: string) => Promise<void>;
  saveToDB: (table: string, data: any) => Promise<void>;
}

const WatchLater: React.FC<WatchLaterProps> = ({ media, setMedia, removeFromDB, saveToDB }) => {
  const [filter, setFilter] = useState<'ALL' | 'UNWATCHED' | 'WATCHED'>('ALL');
  const [sortBy, setSortBy] = useState<'DATE' | 'TITLE'>('DATE');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [newMedia, setNewMedia] = useState({ title: '', link: '', notes: '' });
  const [error, setError] = useState('');

  const filteredAndSortedMedia = useMemo(() => {
    let result = media.filter(item => {
      if (filter === 'ALL') return true;
      return filter === 'WATCHED' ? item.isWatched : !item.isWatched;
    });

    result.sort((a, b) => {
      if (sortBy === 'TITLE') {
        return a.title.localeCompare(b.title);
      } else {
        return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
      }
    });

    return result;
  }, [media, filter, sortBy]);

  const toggleWatched = async (id: string) => {
    const item = media.find(m => m.id === id);
    if (!item) return;

    const previous = [...media];
    const updated = { ...item, isWatched: !item.isWatched };
    setMedia(prev => prev.map(m => m.id === id ? updated : m));

    try {
      await saveToDB('media_items', updated);
    } catch (err) {
      setMedia(previous);
      alert('Failed to update status.');
    }
  };

  const handleAddMedia = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!newMedia.title.trim()) {
      setError('Title is required');
      return;
    }

    const isDuplicate = media.some(item => item.title.toLowerCase() === newMedia.title.toLowerCase());
    if (isDuplicate) {
      setError('This title is already in your list');
      return;
    }

    const newItem: MediaItem = {
      id: Math.random().toString(36).substr(2, 9),
      title: newMedia.title,
      link: newMedia.link,
      isWatched: false,
      dateAdded: new Date().toISOString(),
      thumbnail: `https://api.dicebear.com/7.x/shapes/svg?seed=${newMedia.title}&backgroundColor=0f172a`
    };

    const previous = [...media];
    setMedia(prev => [newItem, ...prev]);

    try {
      await saveToDB('media_items', newItem);
      setIsAddModalOpen(false);
      setNewMedia({ title: '', link: '', notes: '' });
    } catch (err) {
      setMedia(previous);
      alert('Failed to save to cloud.');
    }
  };

  const removeItem = async (id: string) => {
    const previous = [...media];
    try {
      setMedia(prev => prev.filter(m => m.id !== id));
      await removeFromDB('media_items', id);
    } catch (err) {
      setMedia(previous);
      alert('Failed to delete from cloud.');
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-10 pb-32">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-6 md:gap-4 text-white">
        <div>
          <h2 className="text-4xl font-black pb-1">Watch Later</h2>
          <p className="text-white/70 mt-1">Your curated collection of media to explore.</p>
        </div>
        <div className="flex gap-4">
          <div className="flex bg-white/10 p-1 rounded-full">
            <button
              onClick={() => setSortBy('DATE')}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === 'DATE' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/70 hover:text-white'
                }`}
            >
              Latest
            </button>
            <button
              onClick={() => setSortBy('TITLE')}
              className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === 'TITLE' ? 'bg-white text-slate-900 shadow-sm' : 'text-white/70 hover:text-white'
                }`}
            >
              A-Z
            </button>
          </div>
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="bg-white text-slate-900 px-6 py-3 flex items-center gap-2 rounded-full font-black text-sm uppercase shadow-sm hover:-translate-y-0.5 transition-transform"
          >
            <span className="text-lg leading-none">+</span> Add Content
          </button>
        </div>
      </header>

      {/* Filter Tabs */}
      <div className="flex bg-white p-1.5 w-full md:w-fit rounded-full shadow-sm">
        {(['ALL', 'UNWATCHED', 'WATCHED'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`flex-1 md:flex-none px-6 py-2.5 rounded-full font-bold text-sm transition-all ${filter === f
              ? 'bg-[#5f7f8a] text-white shadow-md'
              : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
              }`}
          >
            {f === 'ALL' ? 'Everything' : f === 'UNWATCHED' ? 'Pending' : 'Completed'}
          </button>
        ))}
      </div>

      {/* Media Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-8">
        {filteredAndSortedMedia.map(item => (
          <div key={item.id} className="group flex flex-col gap-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className={`relative aspect-[2/3] rounded-[2.5rem] overflow-hidden shadow-sm transition-all duration-500 bg-white p-2 ${item.isWatched
              ? 'grayscale scale-[0.98] opacity-60'
              : 'group-hover:shadow-xl group-hover:-translate-y-2'
              }`}>
              <div className="w-full h-full rounded-[2rem] overflow-hidden relative">
                <img
                  src={item.thumbnail || `https://picsum.photos/seed/${item.id}/200/300`}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                />

                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end p-6">
                  {item.link && (
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full bg-white text-slate-900 text-[10px] font-black uppercase tracking-widest py-3 rounded-2xl hover:bg-slate-100 transition-all text-center flex items-center justify-center mb-2 shadow-sm"
                    >
                      Watch Source
                    </a>
                  )}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="w-full bg-slate-800 text-white text-[10px] font-black uppercase tracking-widest py-3 rounded-2xl hover:bg-rose-500 transition-all shadow-sm"
                  >
                    Delete
                  </button>
                </div>

                {item.isWatched && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-emerald-500 text-white p-4 rounded-full shadow-lg">
                      <span className="material-symbols-rounded text-3xl">check</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="px-2 space-y-1">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0 pr-4">
                  <h4 className={`font-black text-base truncate ${item.isWatched ? 'text-white/50 line-through' : 'text-white'}`}>
                    {item.title}
                  </h4>
                  <p className="text-[10px] text-white/50 font-bold uppercase tracking-widest mt-0.5">
                    {new Date(item.dateAdded).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <button
                  onClick={() => toggleWatched(item.id)}
                  className={`shrink-0 size-8 rounded-full transition-all flex items-center justify-center ${item.isWatched
                    ? 'bg-[#5f7f8a] text-white shadow-md'
                    : 'bg-white text-slate-300 hover:text-[#5f7f8a] hover:bg-slate-50 shadow-sm'
                    }`}
                >
                  <span className="material-symbols-rounded text-lg">check</span>
                </button>
              </div>
            </div>
          </div>
        ))}

        {/* Empty State / Add Placeholder */}
        {filteredAndSortedMedia.length === 0 && (
          <div className="col-span-full py-32 flex flex-col items-center justify-center text-center space-y-6">
            <div className="size-24 rounded-full bg-white/10 flex items-center justify-center">
              <span className="material-symbols-rounded text-5xl text-white/30">movie</span>
            </div>
            <div>
              <p className="text-xl font-black text-white/70">Nothing matched your filters.</p>
              <p className="text-sm text-white/50 mt-1">Try expanding your search or add a new title.</p>
            </div>
          </div>
        )}
      </div>

      {/* Floating Plus Button (Mobile-friendly) */}
      <button
        onClick={() => setIsAddModalOpen(true)}
        className="fixed bottom-10 right-10 size-16 btn-primary rounded-[2rem] flex items-center justify-center text-4xl font-black md:hidden z-40"
      >
        +
      </button>

      {/* Add Media Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-[#5f7f8a]/80 backdrop-blur-sm z-[100] flex items-center justify-center p-6">
          <div className="bg-white text-slate-900 w-full max-w-lg rounded-[3rem] p-10 shadow-xl animate-in zoom-in duration-300">
            <div className="flex justify-between items-center mb-10">
              <h3 className="text-3xl font-black tracking-tight">Add to List</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="size-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-rose-50 hover:text-rose-500 transition-colors"
              >
                <span className="material-symbols-rounded">close</span>
              </button>
            </div>

            <form onSubmit={handleAddMedia} className="space-y-8">
              {error && (
                <div className="bg-rose-50 p-4 rounded-2xl">
                  <p className="text-rose-500 text-xs font-bold uppercase tracking-widest text-center">{error}</p>
                </div>
              )}

              <div className="space-y-6">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Media Title</label>
                  <input
                    required
                    autoFocus
                    type="text"
                    value={newMedia.title}
                    onChange={e => setNewMedia({ ...newMedia, title: e.target.value })}
                    placeholder="e.g., The Bear Season 3"
                    className="w-full bg-slate-50 py-4 px-6 font-bold text-lg rounded-2xl border-none outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Streaming Link (Optional)</label>
                  <input
                    type="url"
                    value={newMedia.link}
                    onChange={e => setNewMedia({ ...newMedia, link: e.target.value })}
                    placeholder="https://netflix.com/..."
                    className="w-full bg-slate-50 py-4 px-6 font-medium text-slate-600 rounded-2xl border-none outline-none focus:ring-2 focus:ring-slate-200 transition-all"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 ml-1">Private Notes</label>
                  <textarea
                    rows={3}
                    value={newMedia.notes}
                    onChange={e => setNewMedia({ ...newMedia, notes: e.target.value })}
                    placeholder="Why do you want to watch this?"
                    className="w-full bg-slate-50 py-4 px-6 font-medium text-slate-600 rounded-2xl border-none outline-none focus:ring-2 focus:ring-slate-200 resize-none transition-all"
                  />
                </div>
              </div>

              <div className="flex gap-4 pt-4">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-4 font-black text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-slate-900 text-white rounded-[2rem] py-4 font-black shadow-sm hover:shadow-md transition-all"
                >
                  Save to Vault
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default WatchLater;
