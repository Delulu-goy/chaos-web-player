# Notifiche — riferimento completo

Le notifiche di Chaos Radio sono uno **storico**: non spariscono più. Ogni
utente le vede tutte (data e ora decrescenti), con le **non lette in evidenza**
e le **lette in grigio**. Lo stato "letto" è **per utente**.

- **Origini**: brani nuovi in show list, nuova edizione Pirate Day, annunci
  scritti a mano da un admin.
- **Lettura**: il solo fatto di visitare la pagina "UPDATES" marca come lette
  tutte le notifiche visibili. Non si clicca nulla.
- **Creazione manuale**: `POST /api/notifications`, riservato agli admin.

Implementazione: `backend/src/routes/notifications.routes.js` — helper
condivisi con gli script: `backend/src/lib/notifications.js` — permessi:
`backend/src/middleware/admin.js`.

## Indice

1. [Le tre origini](#1-le-tre-origini)
2. [Modello dati](#2-modello-dati)
3. [Come viene letta una notifica](#3-come-viene-letta-una-notifica)
4. [Endpoint: scrivere una notifica custom](#4-endpoint-scrivere-una-notifica-custom)
5. [Elencare e cancellare](#5-elencare-e-cancellare)
6. [Test](#6-test)
7. [Problemi frequenti](#7-problemi-frequenti)

## 1. Le tre origini

| `kind` | Chi la crea | Quando | Visibilità |
|---|---|---|---|
| `NEW_TRACKS` | cron `scan.js` | ogni 5 minuti, se sono entrati MP3 nuovi in libreria | broadcast |
| `PIRATE_DAY` | cron `pirate-day.js` | quando l'edizione viene pubblicata | broadcast |
| `CUSTOM` | `POST /api/notifications` | a mano, da un admin | broadcast o target |

**Nuovi brani in show list**: lo scanner confronta i file trovati con quelli
già in `tracks` e, per i brani davvero creati (e fuori dalla cartella Pirate
Day, che ha la notifica dedicata), crea **una notifica per batch di scan**
con l'elenco dei brani arrivati. Un giro senza novità non genera nulla.

**Pirate Day**: una notifica per edizione, resa idempotente dalla
`dedupe_key = "pirate-day:<N>"`: riaprire la finestra di un'edizione già
scaduta non ne crea una seconda.

**Custom**: le scrivi tu (vedi [sezione 4](#4-endpoint-scrivere-una-notifica-custom)).

## 2. Modello dati

| Tabella | Colonne | Significato |
|---|---|---|
| `notifications` | `id`, `user_id`, `kind`, `title`, `body`, `meta`, `dedupe_key`, `created_at` | le notifiche |
| `notification_reads` | `notificationId`, `userId`, `read_at` (PK sulle prime due) | stato "letto" **per utente** |

- `user_id = null` → **broadcast**: la notifica è visibile a tutti gli utenti
  registrati. `user_id = <id>` → **target**: visibile solo a quell'utente
  (c'è una FK verso `users.id` con `ON DELETE CASCADE`).
- `title` è l'intestazione mostrata in grassetto sopra al testo; `body` è il
  testo (supporta `**grassetto**`, reso in arancione).
- `meta` è JSON libero: dati strutturati per il frontend (elenco brani,
  edizione, slug…). Non è interpretato dal backend.
- `dedupe_key` è UNIQUE: due richieste con la stessa chiave non creano due
  notifiche (la seconda risponde `409`).

## 3. Come viene letta una notifica

1. Il frontend chiama `GET /api/notifications` (al login, al focus della
   finestra e ogni 60 secondi con il polling).
2. Il server risponde `{ items, total, page, limit, unreadCount }` dove
   `items` contiene **tutte** le notifiche visibili, lette comprese.
3. Quando l'utente **visita** la pagina "UPDATES", il frontend chiama
   `POST /api/notifications/read-all`: il server registra in
   `notification_reads` una riga per ogni notifica visibile (quelle già
   lette vengono ignorate → idempotente).
4. Alla visita successiva tutte quelle notifiche arrivano con `read: true` e
   il frontend le disegna in grigio. Il badge della campanella mostra
   `unreadCount`.

Note:

- **Non esiste il click-per-notifica**: la notifica non è cliccabile e
  `POST /api/notifications/:id/read` non viene usato dalla UI (resta
  nell'API per uso programmatico).
- Il `read-all` marca **tutte** le notifiche visibili, non solo la pagina
  caricata: così lo storico non si "spalma" su più visite.
- Una notifica **target** non compare negli elenchi degli altri utenti,
  nemmeno come "letta".

## 4. Endpoint: scrivere una notifica custom

```
POST /api/notifications
Content-Type: application/json
Cookie: token=<JWT>

{ "title": "...", "body": "...", "userId": 42, "dedupeKey": "..." }
```

### 4.1 I tre controlli, in ordine

| # | Controllo | Se fallisce |
|---|---|---|
| 1 | **Sessione**: cookie httpOnly `token` (JWT HS256, 30 giorni) | `401 {"error":"unauthorized"}` |
| 2 | **Admin**: l'email del token è in `ADMIN_EMAILS` | `403 {"error":"forbidden"}` |
| 3 | **Rate limit**: max `NOTIFICATIONS_RATE_LIMIT_MAX` richieste/ora per IP (default **30** in produzione, 300 in dev) | `429 {"error":"rate_limited","details":{"retryAfterMinutes":60}}` |

`ADMIN_EMAILS` è la lista degli admin (email separate da virgola, confronto
case-insensitive) ed è un'**env var del server**:

```
Setup Node.js App → Environment variables →  ADMIN_EMAILS=am3d3o.casella@gmail.com
```

Se la variabile **non è impostata, nessuno è admin**: l'endpoint resta
chiuso (fail-closed). Dopo averla cambiata:
`touch <application root>/tmp/restart.txt` e verifica con
`curl -s https://radio.chaosroom.online/api/debug`.

### 4.2 Il payload

| Campo | Tipo | Obbligatorio | Regole |
|---|---|---|---|
| `body` | string | **sì** | 1..2000 caratteri dopo `trim()`. Supporta `**grassetto**` (reso arancione). |
| `title` | string | no | max 120 caratteri. Se vuoto o solo spazi → `null` (nessuna intestazione). |
| `userId` | number \| null | no | `null` / omesso / `""` → **broadcast**. Un intero → **target**: l'utente deve esistere, altrimenti `404`. |
| `dedupeKey` | string | no | univoco. Se esiste già una notifica con la stessa chiave → `409`. |
| `meta` | object \| array | no | JSON libero, salvato così com'è. |

`kind` **non** è un campo accettato: viene forzato a `CUSTOM`. Non si può
quindi fingersi una notifica "nuovi brani" o "Pirate Day".

### 4.3 Le risposte

| Status | Corpo | Quando |
|---|---|---|
| `201` | `{ id, title, body, kind: "CUSTOM", createdAt, read: false, meta }` | notifica creata |
| `400` | `{ "error": "validation", "details": { "field": "body" \| "title" \| "userId" } }` | `body` mancante o troppo lungo, `title` troppo lungo, `userId` non numerico |
| `401` | `{ "error": "unauthorized" }` | cookie `token` mancante o scaduto |
| `403` | `{ "error": "forbidden" }` | l'utente non è in `ADMIN_EMAILS` |
| `404` | `{ "error": "not_found" }` | `userId` inesistente |
| `409` | `{ "error": "conflict", "details": { "field": "dedupeKey" } }` | `dedupeKey` già usata |
| `429` | `{ "error": "rate_limited", "details": { "retryAfterMinutes": 60 } }` | troppe richieste |

Il formato degli errori è quello del middleware globale
(`backend/src/middleware/error.js`): `{ "error": "<codice>", "details": {...} }`.

### 4.4 Esempi

```bash
# 1) login come admin e riprendi il cookie di sessione dalla risposta
curl -i -X POST https://radio.chaosroom.online/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"am3d3o.casella@gmail.com","password":"..."}'
# → Set-Cookie: token=<JWT>; Path=/; HttpOnly; Secure; SameSite=Lax

# 2) notifica broadcast a tutti
curl -X POST https://radio.chaosroom.online/api/notifications \
  -H 'Content-Type: application/json' \
  -b 'token=<JWT>' \
  -d '{"title":"Palinsesto","body":"La puntata di venerdì inizia alle **22:30**."}'

# 3) notifica solo per un utente
curl -X POST https://radio.chaosroom.online/api/notifications \
  -H 'Content-Type: application/json' \
  -b 'token=<JWT>' \
  -d '{"title":"Solo per te","body":"Il tuo brano è stato ripubblicato.","userId":42}'
```

Da browser: login su https://radio.chaosroom.online → DevTools → Application →
Cookies → `token`; poi la stessa chiamata dalla console del browser.

### 4.5 Cosa vede l'utente dopo la creazione

- La notifica è **subito** nello storico di tutti (broadcast) o del solo
  destinatario (target). Il frontend la rileva entro 60 secondi (polling) o
  al focus della finestra.
- Resta **non letta** (evidenziata in arancione, badge attivo) finché l'utente
  non visita la pagina "UPDATES": quella visita la marca come letta e alla
  visita successiva la notifica appare grigia.
- Il testo con `**grassetto**` viene reso in arancione anche nelle notifiche
  (stesso parser della descrizione Pirate Day: `frontend/src/lib/richText.tsx`).

## 5. Elencare e cancellare

```
GET    /api/notifications?page=0&limit=20  (auth) → 200 { items, total, page, limit, unreadCount }
POST   /api/notifications/read-all          (auth) → 204
POST   /api/notifications/:id/read          (auth) → 204 | 403 | 404
DELETE /api/notifications/:id               (auth + admin) → 204 | 404
```

- `GET` → lo storico paginato (vedi [sezione 3](#3-come-viene-letta-una-notifica)).
- `POST /read-all` → marca come lette tutte le notifiche visibili. Idempotente.
- `POST /:id/read` → marca come letta una sola notifica. Risponde `403` se è
  la notifica target di un altro utente (prima non c'era il controllo).
- `DELETE /:id` → **solo admin**: rimuove la notifica (utile per correggere
  un annuncio sbagliato). Le righe in `notification_reads` collegate spariscono
  in cascade.

```bash
# cancellare la notifica 17
curl -X DELETE https://radio.chaosroom.online/api/notifications/17 -b 'token=<JWT>'
```

## 6. Test

### Smoke test (E2E sull'API)

```bash
cd chaos-web-player/backend

# produzione
SMOKE_BASE_URL=https://radio.chaosroom.online node scripts/smoke-test.mjs

# con anche i casi admin (crea e poi cancella una notifica custom)
SMOKE_BASE_URL=https://radio.chaosroom.online \
SMOKE_ADMIN_EMAIL=am3d3o.casella@gmail.com \
SMOKE_ADMIN_PASSWORD='<password>' \
node scripts/smoke-test.mjs
```

I casi che coprono le notifiche sono: forma della risposta di `GET`, `read-all`
→ `unreadCount: 0`, **lo storico che non sparisce**, `POST /:id/read` → 204,
custom senza sessione → 401, custom non-admin → 403, `DELETE` non-admin → 403,
custom da admin → 201 + visibilità + cleanup.

> In produzione `/api/auth/*` è limitato a 5 richieste ogni 15 minuti per IP:
> per eseguire lo smoke test più volte in fila usa un'altra IP o alza
> `AUTH_RATE_LIMIT_MAX` nel pannello.

### Test manuale della notifica "nuovi brani"

```bash
# upload di un MP3 in
# /home/chaouaza/radio.chaosroom.online/chaos-web-player/backend/private/audio/
# il cron scan.js gira ogni 5 minuti e crea la notifica

# oppure forzarla:
ssh -i ~/.ssh/id_ed25519 -p 21098 chaouaza@198.177.120.31
cd /home/chaouaza/radio.chaosroom.online/chaos-web-player/backend
/home/chaouaza/nodevenv/radio.chaosroom.online/chaos-web-player/backend/22/bin/node \
  --env-file=.env scripts/scan.js
```

Un secondo giro **non** deve creare una seconda notifica (una per batch).

### Test manuale in UI

1. Login → il badge della campanella "Notifiche" mostra le non lette.
2. Apri "UPDATES": le nuove sono in arancione, le vecchie in grigio. Non
   devi cliccare nulla.
3. Esci e rientra: tutto grigio, badge a zero (il `read-all` le ha marcate
   alla visita).
4. Crea una notifica custom dal terminale → entro 60 s compare in arancione.

## 7. Problemi frequenti

| Sintomo | Causa | Rimedio |
|---|---|---|
| `403 forbidden` su `POST /api/notifications` | l'email non è in `ADMIN_EMAILS` | aggiungila nel pannello e riavvia l'app (`touch tmp/restart.txt`) |
| `403` per tutti, anche con `ADMIN_EMAILS` valorizzata | la variabile non è nel pannello ma solo in `backend/.env` (l'Express **non** carica `.env`) | mettila in Setup Node.js App → Environment variables |
| `401 unauthorized` | cookie `token` assente o scaduto (30 giorni) | rilogga e riprova con il cookie nuovo |
| `409 conflict` | `dedupeKey` già usata | cambia chiave o ometti il campo |
| `429 rate_limited` | più di 30 notifiche/ora dallo stesso IP | aspetta un'ora o alza `NOTIFICATIONS_RATE_LIMIT_MAX` |
| la notifica non compare | frontend non aggiornato | il polling è ogni 60 s: ricarica la pagina o aspetta |
| la notifica è grigia subito | l'utente (o un test) ha già visitato la pagina → `read-all` | è il comportamento voluto: "letto" = visitata |
