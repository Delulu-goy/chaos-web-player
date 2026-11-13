// Chaos Radio — Hook per la waveform (picchi) di un brano
//
// La waveform è calcolata lato server (scripts/generate-waveforms.js) e
// servita da GET /api/tracks/:id/waveform. Non cambia mai per un brano,
// quindi si tiene in cache in memoria per non rifare la richiesta a ogni
// cambio traccia.
//
// Se il brano non ha ancora la waveform (non ancora calcolata, o 404) si
// torna a null: il player mostra la waveform decorativa di fallback.

import { useEffect, useState } from "react";
import { api } from "../lib/api";

/** Cache per id brano: i picchi sono immutabili. */
const cache = new Map<number, number[]>();

/** Decodifica la stringa base64 in una lista di valori 0..1. */
function decodePeaks(base64: string): number[] {
  try {
    const binary = atob(base64);
    const out = new Array<number>(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i) / 255;
    }
    return out;
  } catch {
    return [];
  }
}

export function useTrackWaveform(trackId: number | null): number[] | null {
  const [peaks, setPeaks] = useState<number[] | null>(
    trackId !== null ? (cache.get(trackId) ?? null) : null,
  );

  useEffect(() => {
    if (trackId === null) {
      setPeaks(null);
      return;
    }

    const cached = cache.get(trackId);
    if (cached) {
      setPeaks(cached);
      return;
    }

    let cancelled = false;
    api
      .get<{ waveform: string }>(`/tracks/${trackId}/waveform`)
      .then((data) => {
        const values = decodePeaks(data.waveform);
        if (values.length === 0) return;
        cache.set(trackId, values);
        if (!cancelled) setPeaks(values);
      })
      .catch(() => {
        // Brano senza waveform: resta il fallback decorativo.
        if (!cancelled) setPeaks(null);
      });

    return () => {
      cancelled = true;
    };
  }, [trackId]);

  return peaks;
}
