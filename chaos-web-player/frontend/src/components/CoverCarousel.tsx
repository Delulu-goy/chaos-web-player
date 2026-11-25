// Chaos Radio — CoverCarousel
//
// Stack di copertine in stile "album view" di iTunes per Mac: la copertina
// del brano in ascolto al centro (ridimensionata rispetto alla colonna
// contenuto) e le copertine del brano precedente e successivo che
// sbordano ai lati, in evidenza ridotta.
//
// Quando il brano cambia (skip avanti/indietro, fine brano, scelta dalla
// coda) lo stack SCORRE: la copertina successiva entra al centro e quella
// uscente esce a lato.
//
// Come funziona lo scorrimento
// -----------------------------
// Le copertine stanno su un "rail" di 3 slot: [precedente, centrale,
// successiva]. La posizione di ogni copertina è `slot - 1 + shift`, dove
// `shift` è la traslazione del rail:
//   shift =  0 → [-1, 0, +1]  (copertina centrale al centro)
//   shift = -1 → [-2, -1,  0]  (scorrimento in avanti: la successiva entra)
//   shift = +1 → [ 0, +1, +2]  (scorrimento indietro: la precedente entra)
// A scorrimento finito il rail viene ricomposto con la nuova coda: la
// copertina entrata al centro ci resta, quella uscita passa a lato e la
// nuova vicina appare nello slot libero. Le trasformazioni delle copertine
// già a schermo restano identiche → nessun salto.
//
// Le copertine laterali sono cliccabili (come in iTunes): cliccarle
// salta al brano corrispondente.

import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { Track } from "../types/api";
import { trackCoverUrl } from "../lib/media";
import usePrefersReducedMotion from "../hooks/usePrefersReducedMotion";

/** Scala delle copertine laterali rispetto a quella centrale. */
const SIDE_SCALE = 0.57;
/** Opacità delle copertine laterali (evidenza ridotta). */
const SIDE_OPACITY = 0.45;
/**
 * Scarto fra lo slot centrale e uno slot laterale, in percentuale della
 * larghezza della copertina (non del contenitore): la copertina laterale è
 * adiacente a quella centrale (il suo bordo interno tocca il bordo esterno
 * della centrale), quindi lo scarto vale (1 + SIDE_SCALE) / 2.
 */
const SLOT_SHIFT = ((1 + SIDE_SCALE) / 2) * 100; // 78.5
/** Durata dello scorrimento (ms): deve combaciare con la transizione CSS. */
const SLIDE_MS = 450;

interface CoverCarouselProps {
  /** Brano in ascolto: copertina centrale. */
  current: Track;
  /** Brano precedente nella coda: copertina di sinistra (null se non c'è). */
  prev?: Track | null;
  /** Brano successivo nella coda: copertina di destra (null se non c'è). */
  next?: Track | null;
  /** Chiamata quando l'utente clicca una copertina laterale. */
  onSelect?: (track: Track) => void;
}

/** Obiettivo dello stack: brano al centro + i due vicini. */
interface Target {
  prev: Track | null;
  cur: Track;
  next: Track | null;
}

/** Stato dello stack. */
interface Rail {
  /** [precedente, centrale, successiva] */
  slots: [Track | null, Track | null, Track | null];
  /** Traslazione del rail in slot: 0 allineato, -1 avanti, +1 indietro. */
  shift: number;
  /** Direzione dello scorrimento in corso: -1 avanti, +1 indietro, 0 fermo. */
  dir: -1 | 0 | 1;
}

/** id del brano (null se assente): confronto omogeneo tra slot. */
function idOf(track: Track | null): number | null {
  return track ? track.id : null;
}

export default function CoverCarousel({
  current,
  prev = null,
  next = null,
  onSelect,
}: CoverCarouselProps) {
  const reduceMotion = usePrefersReducedMotion();

  const [rail, setRail] = useState<Rail>(() => ({
    slots: [prev, current, next],
    shift: 0,
    dir: 0,
  }));

  // Mirror dello stato: gli handler vivono fuori dal ciclo di render e
  // devono leggere il rail corrente senza chiudere uno stato vecchio.
  const railRef = useRef<Rail>(rail);
  // Timer di fine scorrimento.
  const timerRef = useRef<number | null>(null);
  // Obiettivo in corso di scorrimento (serve al momento del riassestamento).
  const flightRef = useRef<Target | null>(null);
  // Obiettivo in attesa: applicato appena lo scorrimento corrente si assesta.
  const pendingRef = useRef<Target | null>(null);

  useEffect(() => {
    railRef.current = rail;
  }, [rail]);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  /**
   * Riassesta il rail a scorrimento finito: la copertina entrata al centro
   * resta al centro, quella uscita passa a lato, la nuova vicina entra
   * nello slot libero. Le trasformazioni delle copertine già a schermo non
   * cambiano → nessun salto visibile.
   */
  const settle = () => {
    clearTimer();
    setRail((r) => {
      const target = flightRef.current;
      flightRef.current = null;
      if (target && r.dir === -1) {
        // avanti: [vecchio precedente, vecchio centrale, vecchio successivo]
        //        → [vecchio centrale, vecchio successivo, nuovo successivo]
        return { slots: [r.slots[1], r.slots[2], target.next], shift: 0, dir: 0 };
      }
      if (target && r.dir === 1) {
        // indietro: → [nuovo precedente, vecchio precedente, vecchio centrale]
        return { slots: [target.prev, r.slots[0], r.slots[1]], shift: 0, dir: 0 };
      }
      return { slots: r.slots, shift: 0, dir: 0 };
    });
  };

  /**
   * Allinea lo stack all'obiettivo: scorrimento se si avanza/indietra di un
   * brano, sostituzione diretta se si salta a un brano non adiacente.
   */
  const applyTarget = (target: Target) => {
    const r = railRef.current;

    if (r.dir !== 0) {
      // Scorrimento in corso: vale l'obiettivo più recente (l'utente ha
      // premuto "avanti" due volte di fila), gli intermedi si perdono.
      pendingRef.current = target;
      return;
    }

    if (idOf(r.slots[1]) === target.cur.id) {
      // Stesso brano al centro: si aggiornano solo i vicini.
      if (
        idOf(r.slots[0]) !== idOf(target.prev) ||
        idOf(r.slots[2]) !== idOf(target.next)
      ) {
        setRail({ slots: [target.prev, r.slots[1], target.next], shift: 0, dir: 0 });
      }
      return;
    }

    if (idOf(r.slots[2]) === target.cur.id) {
      // Si avanza: la copertina successiva entra al centro.
      flightRef.current = target;
      setRail((rr) => ({ ...rr, shift: -1, dir: -1 }));
      clearTimer();
      timerRef.current = window.setTimeout(settle, reduceMotion ? 0 : SLIDE_MS);
      return;
    }

    if (idOf(r.slots[0]) === target.cur.id) {
      // Si indietra: la copertina precedente entra al centro.
      flightRef.current = target;
      setRail((rr) => ({ ...rr, shift: 1, dir: 1 }));
      clearTimer();
      timerRef.current = window.setTimeout(settle, reduceMotion ? 0 : SLIDE_MS);
      return;
    }

    // Salto a un brano non adiacente (scelta dalla coda): nessuno
    // scorrimento, lo stack viene ricomposto.
    setRail({ slots: [target.prev, target.cur, target.next], shift: 0, dir: 0 });
  };

  // Cambiamento del brano in ascolto (o dei suoi vicini): allinea lo stack.
  useEffect(() => {
    applyTarget({ prev, cur: current, next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, prev?.id, next?.id]);

  // Obiettivo in attesa: applicato appena lo scorrimento in corso si assesta.
  useEffect(() => {
    if (rail.dir !== 0) return;
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    applyTarget(pending);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rail]);

  // Cleanup: nessun timer pendente a fine vita del componente.
  useEffect(() => clearTimer, []);

  // Ordine di sovrapposizione: durante lo scorrimento la copertina che
  // entra al centro passa sopra quella che esce.
  const zOrder =
    rail.dir === -1 ? [10, 20, 30] : rail.dir === 1 ? [30, 20, 10] : [10, 30, 10];

  return (
    <div className="relative aspect-[100/65] w-full overflow-hidden">
      {rail.slots.map((track, index) => {
        if (!track) return null;

        // Posizione della copertina nel rail: -1 = sinistra, 0 = centro,
        // +1 = destra (float durante lo scorrimento).
        const pos = index - 1 + rail.shift;
        const abs = Math.abs(pos);
        const sign = Math.sign(pos);
        // Le copertine che escono dal centro si allontanano e sbiadiscono.
        const translate = sign * SLOT_SHIFT * abs;
        const scale = Math.max(0.2, 1 - (1 - SIDE_SCALE) * abs);
        const opacity = Math.max(0, 1 - (1 - SIDE_OPACITY) * abs);
        const isCenter = abs < 0.5;
        // Il bottone compare solo a copertina già insediata a lato: durante
        // lo scorrimento non deve sottrarre i click alla copertina centrale.
        const isSide = abs >= 0.9;
        const coverUrl = track.coverPath ? trackCoverUrl(track.id) : null;

        const style: CSSProperties = {
          transform: `translate(-50%, -50%) translateX(${translate}%) scale(${scale})`,
          opacity,
          zIndex: zOrder[index],
        };

        return (
          <div
            key={track.id}
            className="cover-layer cover-fade-in absolute left-1/2 top-1/2 aspect-square w-[65%] overflow-hidden rounded-sm bg-neutral-900"
            style={style}
          >
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={isCenter ? track.title : ""}
                className="h-full w-full object-cover"
                draggable={false}
              />
            ) : null}

            {/* Copertine laterali cliccabili: saltano al brano corrispondente
                (come in iTunes). La parte sotto la copertina centrale non è
                cliccabile: ci passa sopra il layer centrale. */}
            {!isCenter && isSide && onSelect ? (
              <button
                type="button"
                onClick={() => onSelect(track)}
                aria-label={`Vai al brano ${track.title}`}
                className="absolute inset-0 cursor-pointer"
              />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
