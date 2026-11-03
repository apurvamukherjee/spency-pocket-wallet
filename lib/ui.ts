import { create } from "zustand";

/** Ephemeral UI state shared across the shell (not persisted). */
export const useUI = create<{
  quickAdd: boolean;
  editing: string | null;
  openQuickAdd: () => void;
  closeQuickAdd: () => void;
  edit: (txnId: string | null) => void;
}>()((set) => ({
  quickAdd: false,
  editing: null,
  openQuickAdd: () => set({ quickAdd: true }),
  closeQuickAdd: () => set({ quickAdd: false }),
  edit: (editing) => set({ editing }),
}));
