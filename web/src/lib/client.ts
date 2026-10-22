"use client";
import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** False during SSR and the hydration pass, true afterwards — gate reads of browser-only storage. */
export const useHydrated = () => useSyncExternalStore(noop, () => true, () => false);

/** Read a browser-storage value as a stable string snapshot (empty on the server). */
export const useStorageValue = (read: () => string, subscribe: (cb: () => void) => () => void = noop) =>
  useSyncExternalStore(subscribe, () => { try { return read(); } catch { return ""; } }, () => "");
