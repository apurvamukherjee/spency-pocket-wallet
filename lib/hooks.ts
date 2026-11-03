import { useMemo } from "react";
import { todayIST } from "./engine/dates";
import { summarize, type SpencyData } from "./engine/derive";
import { StoreNotReadyError, useSpency } from "./store";

/** Only call below <DataGate>, which guarantees data is loaded. */
export function useData(): SpencyData {
  const data = useSpency((s) => s.data);
  if (!data) throw new StoreNotReadyError("useData called outside DataGate");
  return data;
}

export function useSummary() {
  const data = useData();
  const today = todayIST();
  return useMemo(() => summarize(data, today), [data, today]);
}
