import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ChapterStatus = 'unread' | 'in-progress' | 'completed';

interface Note {
  id: string;
  chapterId: string;
  text: string;
  timestamp: number;
}

interface AppState {
  chapterProgress: Record<string, ChapterStatus>;
  notes: Note[];
  setChapterStatus: (chapterId: string, status: ChapterStatus) => void;
  addNote: (chapterId: string, text: string) => void;
  updateNote: (noteId: string, text: string) => void;
  deleteNote: (noteId: string) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set) => ({
      chapterProgress: {},
      notes: [],
      setChapterStatus: (chapterId, status) => 
        set((state) => ({
          chapterProgress: { ...state.chapterProgress, [chapterId]: status }
        })),
      addNote: (chapterId, text) =>
        set((state) => ({
          notes: [
            ...state.notes,
            { id: crypto.randomUUID(), chapterId, text, timestamp: Date.now() }
          ]
        })),
      updateNote: (noteId, text) =>
        set((state) => ({
          notes: state.notes.map((n) => n.id === noteId ? { ...n, text, timestamp: Date.now() } : n)
        })),
      deleteNote: (noteId) =>
        set((state) => ({
          notes: state.notes.filter((n) => n.id !== noteId)
        })),
    }),
    {
      name: 'algebra-sheaf-book-storage',
    }
  )
);
