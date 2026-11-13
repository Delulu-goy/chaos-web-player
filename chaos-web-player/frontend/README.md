# Chaos Radio — Frontend (PWA)

Web player on-demand per `radio.chaosroom.online`: PWA installabile, auth con cookie httpOnly, preferiti per utente, playlist (Show List + Pirate Day), notifiche, player audio con waveform reale.

## Stack

| | |
|---|---|
| Build | Vite 8 (template `react-ts`) |
| UI | React 19 + TypeScript 6 |
| Routing | React Router v7 (9 route) |
| State | Zustand 5 (auth, player, favorites, notifications, toast) |
| Stile | Tailwind CSS **v3.4.17 (pinnato — non usare v4)**, `lucide-react`, `@fontsource/source-code-pro` |
| PWA | `vite-plugin-pwa` (service worker con `registerType: "autoUpdate"`) |

## Comandi

```bash
npm run dev       # dev server su 5173, proxy /api → :3001
npm run build     # build produzione in dist/ (committata nel repo)
npm run preview   # serve il build
npm run lint      # oxlint
```

> **Attenzione al `.gitignore`**: `frontend/.gitignore` ha `dist/` (generato da Vite) che **sovrascrive** l'eccezione `!chaos-web-player/frontend/dist/` del `.gitignore` root. Dopo ogni `npm run build` verifica con
> `git ls-files --others --exclude-standard dist/` che i nuovi bundle siano tracciati: se la lista è vuota ma `dist/index.html` cita hash nuovi, il `.gitignore` sta bloccando i bundle → pagina bianca in produzione.

## Struttura

```
src/
├── App.tsx                 # Router + wrapper: AuthBootstrap > AudioEngineMount > NotifierMount > FavoritesMount
├── audio/useAudioEngine.ts # motore audio: singleton <audio>, Media Session, seek, preload
├── components/             # AppShell, Header, BottomNav, TrackListItem, Waveform, FavoriteButton, …
├── features/               # una cartella per pagina: player, playlist, favorites, notifications, pirate-day, auth
├── hooks/                  # useTrackWaveform
├── lib/                    # api.ts (wrapper fetch), media.ts (URL), format.ts, throttledStorage.ts
├── store/                  # Zustand: auth, player, favorites, notifications, toast
└── types/api.ts            # contratti dei dati del backend
```

## Design system

Token in `tailwind.config.js`:

| Token | Valore | Uso |
|---|---|---|
| `chaos-black` | `#0d0d0d` | header e bottom nav |
| `chaos-surface` | `#141516` | sfondo del contenuto |
| `chaos-trackActive` | `#191b1c` | riga della traccia in play (poi interpolata in un gradiente) |
| `chaos-border` | `rgba(255,255,255,0.10)` | bordi |
| `chaos.muted` | `rgba(255,255,255,0.40)` | testo secondario |
| `accent` | `#FF5A1F` | testo e icone in evidenza, waveform riprodotta |

Il waveform mantiene due colori: **`#FF5A1F`** per la parte già riprodotta, **`rgba(255,255,255,0.35)`** per quella da riprodurre.

## Il player

### Motore audio (`audio/useAudioEngine.ts`)

Un **solo** `<audio>` in tutta l'app, creato fuori dal router (`AudioEngineMount` in `App.tsx`) così la riproduzione non si interrompe al cambio pagina.

**Architettura: desired state vs actual state.** `playerStore.isPlaying` è il **desired state** (l'intenzione dell'utente); l'elemento `<audio>` è l'attuatore. Gli eventi DOM dell'elemento non scrivono il desired state (salvo l'interrupt del sistema operativo), per evitare loop di feedback che desincronizzano store ed elemento.

Tre race condition gestite esplicitamente:

1. **`AbortError`** — `audio.play()` rifiuta con `AbortError` quando un cambio traccia abortisce il caricamento. Non è un errore: ignorarlo evita di mettere in pausa la traccia appena selezionata.
2. **Generation counter** — ogni cambio traccia invalida le richieste obsolete, i cui errori non toccano lo store.
3. **`pause` spurio** — `load()` firea un `pause` asincrono; quando `readyState` è `HAVE_NOTHING` quell'evento è causato dal reset e viene ignorato.

Il reconcile play/pause **non** controlla `audio.paused`: dopo un cambio traccia l'elemento potrebbe non essere ancora sincronizzato e il guard salterebbe la `play()`, lasciando il brano muto.

### Seek

Il seek è **throttled** (120 ms, leading edge + trailing edge): ogni seek è una nuova HTTP Range request, e click ripetuti sulla waveform genererebbero decine di richieste abortite. Il feedback visivo (`progress`) resta immediato, l'applicazione audio è throttled.

`Waveform.tsx` gestisce click, drag (pointer events con capture) e tastiera (frecce ±5 %, Home/End), ed espone `role="slider"` **operabile da tastiera**.

### Waveform

La waveform mostrata è **quella reale del brano**: 300 picchi calcolati lato server (vedi `backend/README.md` → "Waveform dei brani") e serviti da `GET /api/tracks/:id/waveform`. I picchi sono messi in cache in memoria (`hooks/useTrackWaveform.ts`) perché non cambiano mai per un brano.

Il numero di barre si adatta alla larghezza reale del contenitore (`ResizeObserver`): 320 px → 53 barre, 375 px → 62, 768 px → 128, 1200 px → 200, sempre ~4 px di spessore. I brani senza waveform (non ancora calcolata) usano le barre decorative di fallback.

### Lock screen / Media Session

Su schermo bloccato la MediaSession **è** l'interfaccia: se l'elemento audio viene resettato, il browser stacca la sessione e i controlli spariscono fino a quando il brano non riparte. Per questo:

- la traccia **successiva e quella precedente** sono precaricate in background (cache hit invece di download da zero);
- l'assegnazione di `src` **non** è seguita da `load()`: è già il load algorithm, un secondo reset farebbe scoppiare un `pause` spurio;
- `mediaSession.playbackState` è impostato esplicitamente (il browser lo deducerebbe dall'elemento, che durante il cambio traccia è momentaneamente senza risorsa) e `setPositionState` dà al widget lo scrubber corretto;
- ogni `setActionHandler` è wrappato in `try/catch`: Safari non implementa `seekto` e il `NotSupportedError` abortava l'intero effect, lasciando non installati gli handler successivi.

### Persistenza

`playerStore` usa il middleware `persist`: dopo un reload l'utente ritrova brano, coda e posizione.

- `isPlaying` **non** viene persistito: l'autoplay policy bloccherebbe comunque il play automatico, e riprendere a suonare senza interazione sarebbe surprising. Il brano torna caricato e in pausa.
- Le scritture sono **throttled a 3 s** (`lib/throttledStorage.ts`): `progress` si aggiorna 4 volte al secondo e `localStorage` è sincrono. Flush automatico su `pagehide` / `visibilitychange`.

## Deploy

Il `dist/` è **committato nel repo**: su Stellar il frontend è statico e viene servito da Apache. Dopo ogni modifica ai sorgenti:

```bash
npm run build
git add dist/
git commit -m "build: ..."
```

Poi in cPanel → Git Version Control → **"Update from Remote"**. Non usare "Run NPM Install" in Application Manager: quello riguarda solo il backend Node e bypassa `.cpanel.yml`.

`.env.local` e `.env.production` devono restare **vuoti**: `VITE_API_URL` ha priorità in `.env.local` e un URL assoluto farebbe puntare la build di produzione a localhost. La base URL è centralizzata in `src/lib/media.ts`.
