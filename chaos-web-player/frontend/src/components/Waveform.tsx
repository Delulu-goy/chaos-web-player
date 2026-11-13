// Chaos Radio — Waveform (barra di seek del player)
//
// Interazione:
//  - click / tap → seek immediato
//  - drag (pointer events con pointer capture) → seek continuo
//  - tastiera → frecce ±5%, Home/End → inizio/fine
//
// Il throttling delle richieste HTTP sta in `seekAudio()` (useAudioEngine):
// qui si aggiorna solo il feedback visivo, che deve restare immediato.
// `touch-pan-y` mantiene lo scroll verticale della pagina su mobile
// bloccando solo il pan orizzontale (che è il nostro drag).
//
// I picchi mostrati sono quelli reali del brano (dal server). Il numero di
// barre si adatta alla larghezza del contenitore, così le barre mantengono
// uno spessore costante e la waveform riempie sempre lo spazio disponibile.
// Senza picchi (brano non ancora processato) si usa il fallback decorativo.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

interface WaveformProps {
  /** 0..1 */
  progress: number;
  onSeek: (ratio: number) => void;
  /** Picchi reali del brano, 0..1. Null/empty → fallback decorativo. */
  peaks?: number[] | null;
  /** Altezze di fallback (aspetto decorativo quando non ci sono picchi). */
  fallbackBars: number[];
}

const KEYBOARD_STEP = 0.05;

/** Spessore di una barra e gap fra le barre, in pixel. */
const BAR_WIDTH = 4;
const BAR_GAP = 2;

/**
 * Riduce (o estende) i picchi al numero di barre desiderato, prendendo il
 * massimo di ogni bucket: è il modo che meglio preserva la forma.
 */
function resamplePeaks(peaks: number[], count: number): number[] {
  if (peaks.length === 0 || count <= 0) return [];
  if (count >= peaks.length) return peaks;

  const out: number[] = [];
  const bucket = peaks.length / count;
  for (let i = 0; i < count; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
    let max = 0;
    for (let j = start; j < end && j < peaks.length; j++) {
      if (peaks[j] > max) max = peaks[j];
    }
    out.push(max);
  }
  return out;
}

export default function Waveform({
  progress,
  onSeek,
  peaks,
  fallbackBars,
}: WaveformProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [barCount, setBarCount] = useState(0);

  // Il numero di barre segue la larghezza reale del contenitore: le barre
  // restano dello stesso spessore e la waveform riempie lo spazio.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const measure = () => {
      const width = el.clientWidth;
      if (width <= 0) return;
      const count = Math.max(
        8,
        Math.floor((width + BAR_GAP) / (BAR_WIDTH + BAR_GAP)),
      );
      setBarCount(count);
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const bars = useMemo(() => {
    if (!peaks || peaks.length === 0) return fallbackBars;
    if (barCount <= 0) return fallbackBars; // primo render, prima della misura
    return resamplePeaks(peaks, barCount);
  }, [peaks, fallbackBars, barCount]);

  const ratioFromClientX = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  }, []);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return; // ignora tasto destro / middle
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    onSeek(ratioFromClientX(e.clientX));
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    onSeek(ratioFromClientX(e.clientX));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") {
      next = progress + KEYBOARD_STEP;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
      next = progress - KEYBOARD_STEP;
    } else if (e.key === "Home") {
      next = 0;
    } else if (e.key === "End") {
      next = 1;
    }
    if (next === null) return;
    e.preventDefault();
    onSeek(Math.min(1, Math.max(0, next)));
  };

  const percent = Math.round(progress * 100);

  return (
    <div
      ref={ref}
      className="mt-4 flex h-16 cursor-pointer touch-pan-y select-none items-center gap-[2px]"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={handleKeyDown}
      role="slider"
      aria-label="Posizione riproduzione"
      aria-valuenow={percent}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuetext={`${percent}%`}
      tabIndex={0}
    >
      {bars.map((h, i) => {
        const played = i / bars.length < progress;
        return (
          <span
            key={i}
            className="w-full rounded-full"
            style={{
              height: `${Math.max(h, 0.02) * 100}%`,
              backgroundColor: played
                ? "#FF5A1F"
                : "rgba(255,255,255,0.35)",
            }}
          />
        );
      })}
    </div>
  );
}
