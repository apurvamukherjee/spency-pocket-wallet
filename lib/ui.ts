import { create } from "zustand";

/** Ephemeral UI state shared across the shell (not persisted). */
export const useUI = create<{
  quickAdd: boolean;
  editing: string | null;
  notice: string | null;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  edit: (txnId: string | null) => void;
  notify: (message: string | null) => void;
}>()((set) => ({
  quickAdd: false,
  editing: null,
  notice: null,
  openQuickAdd: () => set({ quickAdd: true }),
  closeQuickAdd: () => set({ quickAdd: false }),
  edit: (editing) => set({ editing }),
  notify: (notice) => set({ notice }),
}));
