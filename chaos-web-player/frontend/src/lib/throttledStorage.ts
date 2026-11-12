// Chaos Radio — Storage adapter con scritture throttled
//
// localStorage è sincrono: ogni scrittura blocca il main thread. Lo stato
// del player contiene `progress`, aggiornato ~4 volte al secondo durante la
// riproduzione: scrivere così spesso significa 4 JSON.stringify + setItem
// da qualche KB al secondo.
//
// Con questo adapter le scritture vengono accodate e svuotate al massimo una
// volta ogni `delayMs`. La coda viene svuotata subito quando la pagina viene
// nascosta o chiusa, così l'ultimo stato non si perde.

import type { StateStorage } from "zustand/middleware";

/** Storage in-memory: fallback quando localStorage non è utilizzabile. */
export const memoryStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

/**
 * Restituisce localStorage se utilizzabile, altrimenti null.
 * L'accesso può lanciare con i cookie bloccati; e in alcuni browser la
 * modalità privata fa fallire le scritture (non l'accesso).
 */
export function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    const s = window.localStorage;
    const probe = "__chaos_probe__";
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/**
 * Wrapper di uno `Storage` che limita la frequenza delle scritture.
 * `flush()` forza la scrittura immediata di ciò che è in coda.
 */
export function createThrottledStorage(
  storage: Storage,
  delayMs: number,
): StateStorage & { flush: () => void } {
  let timer: number | null = null;
  let pending: { name: string; value: string } | null = null;

  const flush = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending) {
      try {
        storage.setItem(pending.name, pending.value);
      } catch {
        // Quota piena o storage non scrivibile (modalità privata):
        // la persistenza è un extra, non deve mai far crashare l'app.
      }
      pending = null;
    }
  };

  const schedule = () => {
    if (timer !== null) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, delayMs);
  };

  // I listener sono un extra: se l'ambiente non li espone (test, ambienti
  // non-browser) si prosegue senza flush automatico. Soprattutto: se questa
  // registrazione lanciasse, createJSONStorage restituirebbe undefined e
  // Zustand disattiverebbe la persistenza senza errori evidenti.
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    // pagehide: su mobile Safari beforeunload non è affidabile.
    window.addEventListener("pagehide", flush);
  }
  if (
    typeof document !== "undefined" &&
    typeof document.addEventListener === "function"
  ) {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flush();
    });
  }

  return {
    getItem: (name) => {
      try {
        return storage.getItem(name);
      } catch {
        return null;
      }
    },
    setItem: (name, value) => {
      pending = { name, value };
      schedule();
    },
    removeItem: (name) => {
      pending = null;
      try {
        storage.removeItem(name);
      } catch {
        /* ignore */
      }
    },
    flush,
  };
}
