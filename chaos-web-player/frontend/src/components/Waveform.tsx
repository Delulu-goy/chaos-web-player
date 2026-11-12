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

import { useCallback, useRef, useState } from "react";

interface WaveformProps {
  /** 0..1 */
  progress: number;
  onSeek: (ratio: number) => void;
  /** Altezze relative delle barre (0..1) */
  bars: number[];
}

const KEYBOARD_STEP = 0.05;

export default function Waveform({ progress, onSeek, bars }: WaveformProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);

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
              height: `${h * 100}%`,
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
