import React, { useState } from 'react';
import { PenSquare, Trash2, X } from 'lucide-react';
import { useStore } from '../../store/useStore';

export const Marginalia: React.FC<{ chapterId: string, onClose?: () => void }> = ({ chapterId, onClose }) => {
  const { notes, addNote, deleteNote, updateNote } = useStore();
  const chapterNotes = notes.filter((n) => n.chapterId === chapterId);
  
  const [draft, setDraft] = useState('');
  const [isEditing, setIsEditing] = useState<string | null>(null);

  const handleSave = () => {
    if (!draft.trim()) return;
    if (isEditing) {
      updateNote(isEditing, draft);
      setIsEditing(null);
    } else {
      addNote(chapterId, draft);
    }
    setDraft('');
  };

  return (
    <div className="w-96 flex flex-col border-l border-gray-200 bg-white/95 backdrop-blur-sm h-screen font-sans shadow-[-10px_0_30px_rgba(0,0,0,0.05)]">
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-widest flex items-center gap-2">
          <PenSquare className="w-4 h-4 text-blue-500" />
          Marginalia
        </h2>
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-800 transition-colors p-1 rounded-md hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-gray-50/30">
        {chapterNotes.length === 0 ? (
          <p className="text-sm text-gray-400 italic text-center mt-10">
            No notes for this chapter yet. The margins are yours.
          </p>
        ) : (
          chapterNotes.map((note) => (
            <div key={note.id} className="group relative bg-white border border-gray-200 p-4 rounded-md shadow-sm">
              <p className="text-sm text-gray-800 leading-relaxed font-serif whitespace-pre-wrap">
                {note.text}
              </p>
              <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2 bg-white/90 backdrop-blur pb-1 pl-2">
                <button 
                  onClick={() => deleteNote(note.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mt-3 uppercase tracking-wider">
                {new Date(note.timestamp).toLocaleDateString()}
              </p>
            </div>
          ))
        )}
      </div>

      <div className="p-4 bg-white border-t border-gray-100 relative">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Write a note in the margin..."
          className="w-full h-32 p-3 text-sm bg-gray-50 border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:bg-white transition-all resize-none shadow-inner"
        />
        <div className="flex justify-end mt-2">
          <button
            onClick={handleSave}
            disabled={!draft.trim()}
            className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold tracking-wide uppercase rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Save Note
          </button>
        </div>
      </div>
    </div>
  );
};
