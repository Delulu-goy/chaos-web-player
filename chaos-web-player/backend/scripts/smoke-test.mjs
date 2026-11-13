// Chaos Radio — Smoke test E2E
//
// Verifica end-to-end del backend girando: esegue una serie di chiamate
// HTTP realistiche e controlla che le risposte soddisfino i contratti
// dell'API (vedi plans/chaos-radio-player.md §6).
//
// Uso:
//   node scripts/smoke-test.mjs
//   SMOKE_BASE_URL=https://radio.chaosroom.online node scripts/smoke-test.mjs
//
// Exit code:
//   0 — tutti i test passati
//   1 — almeno un test fallito (utile per CI o per script di pre-deploy)
//
// Env vars:
//   SMOKE_BASE_URL  - default: "http://localhost:3001"
//   SMOKE_TIMEOUT   - default: 10000 (ms per ogni richiesta)
//
// NON richiede Prisma/client Prisma: tocca solo l'API pubblica.

import { loadEnv, timestamp } from "./_shared.mjs";

loadEnv();

const BASE_URL = process.env.SMOKE_BASE_URL ?? "http://localhost:3001";
const TIMEOUT_MS = Math.max(1000, parseInt(process.env.SMOKE_TIMEOUT ?? "10000", 10));

const results = [];
let stepCounter = 0;

function record(name, ok, detail = "") {
  stepCounter++;
  results.push({ name, ok, detail });
  const sym = ok ? "✓" : "✗";
  const msg = detail ? ` — ${detail}` : "";
  // Forza il flush prima di un eventuale exit code 1.
  console.log(`  ${sym} [${stepCounter.toString().padStart(2, "0")}] ${name}${msg}`);
}

/**
 * Test saltato (mancano i dati per eseguirlo).
 * Non è un fallimento: conta a parte nel riepilogo e non fa uscire con
 * codice 1. Serve per gli scenari "DB vuoto" / "nessuna edizione attiva".
 */
function skip(name, detail = "") {
  stepCounter++;
  results.push({ name, ok: true, skipped: true, detail });
  const msg = detail ? ` — SKIP: ${detail}` : " — SKIP";
  console.log(`  ○ [${stepCounter.toString().padStart(2, "0")}] ${name}${msg}`);
}

/**
 * Cookie jar minimo: salva solo il cookie `token` (l'unico che ci serve).
 */
function makeJar() {
  let token = null;
  return {
    setFromHeader(setCookieHeader) {
      if (!setCookieHeader) return;
      const m = /token=([^;]+)/.exec(setCookieHeader);
      if (m) token = m[1];
    },
    clear() {
      token = null;
    },
    header() {
      return token ? `token=${token}` : null;
    },
    has() {
      return token !== null;
    },
  };
}

async function http(
  method,
  path,
  { body, jar, omitBody = false, headers: extraHeaders, raw = false } = {},
) {
  const url = `${BASE_URL}${path}`;
  const headers = { Accept: "application/json", ...extraHeaders };
  const cookie = jar?.header();
  if (cookie) headers.Cookie = cookie;
  let payload;
  if (!omitBody && body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers,
      body: payload,
      signal: ctrl.signal,
      redirect: "manual",
    });

    // HeaderSet completo: getSetCookie() è disponibile in Node ≥ 21.3 / 22
    // e ritorna un array di stringhe Set-Cookie (una per cookie).
    const setCookies =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : [];
    for (const c of setCookies) jar?.setFromHeader(c);

    const status = res.status;
    const resHeaders = Object.fromEntries(res.headers.entries());

    // `raw: true` per risposte binarie (stream audio): non tentiamo il
    // JSON parse e restituiamo il numero di byte effettivamente ricevuti.
    if (raw) {
      const buf = Buffer.from(await res.arrayBuffer());
      return { status, json: null, text: "", setCookies, resHeaders, bytes: buf.length };
    }

    const text = status === 204 ? "" : await res.text();
    let json = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        /* non-JSON body, lascia json = null */
      }
    }
    return { status, json, text, setCookies, resHeaders };
  } catch (err) {
    return { status: 0, json: null, text: "", setCookies: [], resHeaders: {}, error: err.message ?? String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function run() {
  console.log(`[smoke] ${timestamp()} target=${BASE_URL} timeout=${TIMEOUT_MS}ms\n`);

  const jar = makeJar();
  // ── 1. Health (pubblico) ───────────────────────────────────────────
  {
    const r = await http("GET", "/api/health");
    record(
      "GET /api/health",
      r.status === 200 && r.json?.status === "ok",
      `status=${r.status}`,
    );
  }

  // ── 2. POST /api/auth/login con credenziali false → 401 ───────────
  {
    const r = await http("POST", "/api/auth/login", {
      body: { email: "no-such-user@chaosroom.local", password: "wrongpass" },
    });
    record(
      "POST /api/auth/login (credenziali errate) → 401",
      r.status === 401,
      `status=${r.status}`,
    );
  }

  // ── 3. POST /api/auth/register (utente random) ─────────────────────
  const email = `smoke-${Date.now()}-${Math.floor(Math.random() * 1e6)}@chaos.test`;
  const password = "SmokeTest1234";
  let userId;
  {
    const r = await http("POST", "/api/auth/register", {
      body: { email, password, displayName: "Smoke User" },
      jar,
    });
    const validUser =
      r.json?.user?.email === email &&
      typeof r.json?.user?.id === "number" &&
      typeof r.json?.user?.createdAt === "string";
    userId = r.json?.user?.id;
    record(
      "POST /api/auth/register (utente nuovo) → 201 + cookie",
      r.status === 201 && validUser && jar.has(),
      `status=${r.status}, user=${validUser ? email : "INVALID"}`,
    );
  }

  // ── 4. GET /api/auth/me con cookie → 200 ───────────────────────────
  {
    const r = await http("GET", "/api/auth/me", { jar });
    const payloadOk = r.json?.user?.email === email && r.json?.user?.id === userId;
    record(
      "GET /api/auth/me → 200 + user",
      r.status === 200 && payloadOk,
      `status=${r.status}`,
    );
  }

  // ── 5. Validazione: register senza email → 400 ─────────────────────
  {
    const r = await http("POST", "/api/auth/register", {
      body: { password: "abcdefgh" },
    });
    record(
      "POST /api/auth/register (no email) → 400",
      r.status === 400,
      `status=${r.status}`,
    );
  }

  // ── 6. Validazione: register con password 6 char → 400 ────────────
  {
    const r = await http("POST", "/api/auth/register", {
      body: { email: `bad-${Date.now()}@chaos.test`, password: "abc" },
    });
    record(
      "POST /api/auth/register (password corta) → 400",
      r.status === 400,
      `status=${r.status}`,
    );
  }

  // ── 7. Validazione: register email malformata → 400 ────────────────
  {
    const r = await http("POST", "/api/auth/register", {
      body: { email: "not-an-email", password: "abcdefgh" },
    });
    record(
      "POST /api/auth/register (email malformata) → 400",
      r.status === 400,
      `status=${r.status}`,
    );
  }

  // ── 8. GET /api/tracks (auth) → 200 + array ────────────────────────
  let firstTrackId;
  let trackIds = [];
  {
    const r = await http("GET", "/api/tracks", { jar });
    const isArray = Array.isArray(r.json);
    if (isArray) {
      trackIds = r.json.map((t) => t.id);
      if (r.json.length > 0) firstTrackId = r.json[0].id;
    }
    record(
      "GET /api/tracks (auth) → 200 + array",
      r.status === 200 && isArray,
      `status=${r.status}, count=${isArray ? r.json.length : "n/a"}`,
    );
  }

  // ── 8b. GET /api/playlists/pirate-day (edizione attiva) ────────────
  // Serve a due cose:
  //   - scegliere un brano "favoritabile" per i test CRUD sui preferiti
  //     (i brani del pirate day rispondono 403 per design);
  //   - i check del Pirate Day in fondo allo smoke test.
  let pirateDay = null;
  let pirateDayStatus = 0;
  {
    const r = await http("GET", "/api/playlists/pirate-day", { jar });
    pirateDayStatus = r.status;
    if (r.status === 200) pirateDay = r.json;
  }
  const pirateDayTrackIds = new Set(
    pirateDay && Array.isArray(pirateDay.items)
      ? pirateDay.items.map((t) => t.id)
      : [],
  );
  // Primo brano che si può mettere nei preferiti (non è del pirate day).
  const favoritableTrackId = trackIds.find((id) => !pirateDayTrackIds.has(id));

  // ── 9. GET /api/tracks senza cookie → 401 ──────────────────────────
  {
    const tmpJar = makeJar();
    const r = await http("GET", "/api/tracks", { jar: tmpJar });
    record(
      "GET /api/tracks (no cookie) → 401",
      r.status === 401,
      `status=${r.status}`,
    );
  }

  // ── 10. GET /api/tracks/:id (id inesistente) → 404 ────────────────
  if (userId) {
    const r = await http("GET", "/api/tracks/9999999", { jar });
    record(
      "GET /api/tracks/9999999 → 404",
      r.status === 404,
      `status=${r.status}`,
    );
  }

  // ── 11. Range request su uno stream (id inesistente) → 404 ─────────
  {
    const r = await http("GET", "/api/tracks/9999999/stream", { jar });
    record(
      "GET /api/tracks/9999999/stream → 404",
      r.status === 404,
      `status=${r.status}`,
    );
  }

  // ── 11b. Range request su uno stream REALE → 206 + Content-Range ────
  // Regressione: il server dichiarava `Accept-Ranges: bytes` ma ignorava
  // l'header Range (usava fs.createReadStream().pipe(res)), quindi ogni
  // seek riscaricava l'intero MP3. Ora deve rispondere 206 parziale.
  if (firstTrackId) {
    const r = await http("GET", `/api/tracks/${firstTrackId}/stream`, {
      jar,
      raw: true,
      headers: { Accept: "*/*", Range: "bytes=0-99" },
    });
    const cr = r.resHeaders?.["content-range"];
    const cl = r.resHeaders?.["content-length"];
    record(
      `GET /api/tracks/${firstTrackId}/stream (Range: bytes=0-99) → 206`,
      r.status === 206 &&
        typeof cr === "string" &&
        cr.startsWith("bytes 0-99/") &&
        Number(cl) === 100 &&
        r.bytes === 100,
      `status=${r.status}, content-range=${cr ?? "n/a"}, content-length=${cl ?? "n/a"}, bytes=${r.bytes}`,
    );

    // Senza Range: risposta completa 200, lunghezza = dimensione del file.
    const r2 = await http("GET", `/api/tracks/${firstTrackId}/stream`, {
      jar,
      raw: true,
      headers: { Accept: "*/*" },
    });
    const cl2 = r2.resHeaders?.["content-length"];
    record(
      `GET /api/tracks/${firstTrackId}/stream (senza Range) → 200 completo`,
      r2.status === 200 &&
        typeof cl2 === "string" &&
        Number(cl2) > 0 &&
        r2.bytes === Number(cl2),
      `status=${r2.status}, content-length=${cl2 ?? "n/a"}, bytes=${r2.bytes}`,
    );
  }

  // ── 11c. GET /api/tracks/:id/waveform → 200 con base64 (o 404) ─────
  // I picchi della waveform sono generati dallo scan con il decoder WASM
  // mpg123. Se il brano non è ancora stato processato il file non esiste
  // e la risposta è un 404 legittimo: il frontend mostra il fallback.
  if (firstTrackId) {
    const r = await http("GET", `/api/tracks/${firstTrackId}/waveform`, { jar });
    const wf = r.json?.waveform;
    const isBase64 = typeof wf === "string" && /^[A-Za-z0-9+/=]+$/.test(wf);
    record(
      `GET /api/tracks/${firstTrackId}/waveform → 200 (base64) o 404 se non generata`,
      r.status === 200
        ? isBase64 && Buffer.from(wf, "base64").length > 0
        : r.status === 404,
      `status=${r.status}, bytes=${wf ? Buffer.from(wf, "base64").length : "n/a"}`,
    );
  }

  // ── 12. GET /api/favorites (vuoto) → 200 + array vuoto ─────────────
  {
    const r = await http("GET", "/api/favorites", { jar });
    const isArray = Array.isArray(r.json);
    record(
      "GET /api/favorites (utente nuovo) → 200 + []",
      r.status === 200 && isArray && r.json.length === 0,
      `status=${r.status}, count=${isArray ? r.json.length : "n/a"}`,
    );
  }

  // ── 13. POST /api/favorites/:trackId (solo se ci sono tracks) ──────
  // Si usa un brano NON del pirate day: quelli rispondono 403 per design
  // (invariante I3) e falserebbero il test CRUD.
  if (favoritableTrackId) {
    const r = await http("POST", `/api/favorites/${favoritableTrackId}`, { jar });
    record(
      `POST /api/favorites/${favoritableTrackId} → 204`,
      r.status === 204,
      `status=${r.status}`,
    );

    // ── 14. GET /api/favorites ora contiene il track ─────────────────
    const r2 = await http("GET", "/api/favorites", { jar });
    const contains =
      Array.isArray(r2.json) && r2.json.some((t) => t.id === favoritableTrackId);
    record(
      "GET /api/favorites contiene il track aggiunto",
      r2.status === 200 && contains,
      `status=${r2.status}`,
    );

    // ── 15. Idempotenza: POST di nuovo lo stesso track → 204 ─────────
    const r3 = await http("POST", `/api/favorites/${favoritableTrackId}`, { jar });
    record(
      `POST /api/favorites/${favoritableTrackId} (idempotente) → 204`,
      r3.status === 204,
      `status=${r3.status}`,
    );

    // ── 16. DELETE /api/favorites/:trackId → 204 ────────────────────
    const r4 = await http("DELETE", `/api/favorites/${favoritableTrackId}`, { jar });
    record(
      `DELETE /api/favorites/${favoritableTrackId} → 204`,
      r4.status === 204,
      `status=${r4.status}`,
    );

    // ── 17. DELETE di un track non in favorites → 204 (idempotente) ──
    const r5 = await http("DELETE", `/api/favorites/${favoritableTrackId}`, { jar });
    record(
      `DELETE /api/favorites/${favoritableTrackId} (idempotente) → 204`,
      r5.status === 204,
      `status=${r5.status}`,
    );
  } else {
    skip("Add/get/delete favorite", "nessun brano favoritabile");
  }

  // ── 18. GET /api/playlists/show-list → 200 + items ────────────────
  {
    const r = await http("GET", "/api/playlists/show-list", { jar });
    const okShape =
      r.status === 200 &&
      typeof r.json?.title === "string" &&
      Array.isArray(r.json?.items);
    record(
      "GET /api/playlists/show-list → 200 + {title, items}",
      okShape,
      `status=${r.status}`,
    );
  }

  // ── 19. GET /api/playlists/pirate-day → 200 oppure 404 ────────────
  {
    const r = await http("GET", "/api/playlists/pirate-day", { jar });
    const expected = r.status === 200 || r.status === 404;
    record(
      "GET /api/playlists/pirate-day → 200|404 (attivo o scaduto)",
      expected,
      `status=${r.status}`,
    );
  }

  // ── 20. GET /api/notifications → 200 + array ──────────────────────
  let firstNotificationId;
  {
    const r = await http("GET", "/api/notifications", { jar });
    const isArray = Array.isArray(r.json);
    if (isArray && r.json.length > 0) firstNotificationId = r.json[0].id;
    record(
      "GET /api/notifications → 200 + array",
      r.status === 200 && isArray,
      `status=${r.status}, count=${isArray ? r.json.length : "n/a"}`,
    );
  }

  // ── 21. POST /api/notifications/:id/read (solo se c'è almeno una) ─
  if (firstNotificationId !== undefined) {
    const r = await http("POST", `/api/notifications/${firstNotificationId}/read`, { jar });
    record(
      `POST /api/notifications/${firstNotificationId}/read → 204`,
      r.status === 204,
      `status=${r.status}`,
    );

    // ── 22. GET /api/notifications riflette lo stato letto ──────────
    const r2 = await http("GET", "/api/notifications", { jar });
    const all = Array.isArray(r2.json) ? r2.json : [];
    const found = all.find((n) => n.id === firstNotificationId);
    // Le notifiche BROADCAST già lette spariscono dalla lista (l'endpoint
    // mostra solo le non lette): "letto" vuol dire quindi "assente dalla
    // lista" OPPURE "presente con read=true".
    const isRead = found ? found.read === true : true;
    record(
      "GET /api/notifications → la notifica marcata non risulta più non letta",
      r2.status === 200 && isRead,
      `status=${r2.status}, found=${found ? "yes" : "no (broadcast letta: rimossa dalla lista)"}`,
    );
  } else {
    skip("Mark notification read + verify", "no notifications");
  }

  // ── 23. Rate limit headers presenti su /login (sanity) ────────────
  {
    const r = await http("POST", "/api/auth/login", {
      body: { email: "x@x.com", password: "x" },
    });
    // Express-rate-limit imposta RateLimit headers quando standardHeaders:true
    const has = r.status === 401 || r.status === 400 || r.status === 429;
    record(
      "POST /api/auth/login (input malformato) → 4xx (no crash)",
      has,
      `status=${r.status}`,
    );
  }

  // ── 24. Logout → 204 + cookie cleared ─────────────────────────────
  {
    const r = await http("POST", "/api/auth/logout", { jar });
    // res.clearCookie() emette una Set-Cookie "token=; ..." con Max-Age=0/Expires passato
    const clearedCookie = r.setCookies.some((c) => /token=;/.test(c));
    record(
      "POST /api/auth/logout → 204 + clear-cookie",
      r.status === 204 && clearedCookie,
      `status=${r.status}, clearedCookie=${clearedCookie ? "yes" : "no"}`,
    );
  }

  // ── 25. POST /api/auth/login con le stesse credenziali → 200 ─────
  {
    jar.clear();
    const r = await http("POST", "/api/auth/login", { body: { email, password }, jar });
    record(
      "POST /api/auth/login (ri-login) → 200 + nuovo cookie",
      r.status === 200 && jar.has(),
      `status=${r.status}`,
    );
  }

  // ── 26. Pirate Day: la show list non contiene i brani del pirate day,
  //        i preferiti li rifiutano (403), shape della risposta ─────────
  //
  // I brani del pirate day sono quelli dell'edizione attiva, recuperati
  // al passo 8b. Senza edizione attiva i check sono saltati: non è un
  // fallimento.
  {
    const pdItems =
      pirateDay && Array.isArray(pirateDay.items) ? pirateDay.items : [];
    const pdIds = pirateDayTrackIds;

    // Shape check della risposta pirate-day
    if (pirateDayStatus === 404) {
      skip("GET /api/playlists/pirate-day → shape {title, curator, items[], endsAt}", "nessuna edizione attiva");
    } else {
      const okShape =
        pirateDayStatus === 200 &&
        typeof pirateDay?.title === "string" &&
        pirateDay?.curator !== null &&
        typeof pirateDay?.curator === "object" &&
        Array.isArray(pdItems) &&
        typeof pirateDay?.endsAt === "string";
      record(
        "GET /api/playlists/pirate-day → shape {title, curator, items[], endsAt}",
        okShape,
        `status=${pirateDayStatus}`,
      );
    }

    // Show list ∩ track(playlist PIRATE_DAY) = ∅
    const sl = await http("GET", "/api/playlists/show-list", { jar });
    const slIds = new Set(
      (Array.isArray(sl.json?.items) ? sl.json.items : []).map((t) => t.id),
    );
    if (pdIds.size === 0) {
      skip("show list ∩ track(PIRATE_DAY) = ∅", "nessuna edizione attiva");
    } else {
      const overlap = [...slIds].filter((id) => pdIds.has(id));
      record(
        "show list ∩ track(PIRATE_DAY) = ∅",
        sl.status === 200 && overlap.length === 0,
        `status=${sl.status}, overlap=${overlap.length}`,
      );
    }

    // POST /api/favorites/<track pirate day> → 403
    if (pdIds.size === 0) {
      skip("POST /api/favorites/<track pirate day> → 403", "nessuna edizione attiva");
    } else {
      const pdTrackId = [...pdIds][0];
      const r = await http("POST", `/api/favorites/${pdTrackId}`, { jar });
      record(
        `POST /api/favorites/${pdTrackId} (track pirate day) → 403`,
        r.status === 403,
        `status=${r.status}`,
      );
    }

    // GET /api/favorites non contiene track pirate day
    if (pdIds.size === 0) {
      skip("GET /api/favorites senza track pirate day", "nessuna edizione attiva");
    } else {
      const fav = await http("GET", "/api/favorites", { jar });
      const leaked = Array.isArray(fav.json)
        ? fav.json.filter((t) => pdIds.has(t.id))
        : [];
      record(
        "GET /api/favorites senza track pirate day",
        fav.status === 200 && leaked.length === 0,
        `status=${fav.status}, trovati=${leaked.length}`,
      );
    }
  }

  // ── Summary ────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok).length;
  const skippedCount = results.filter((r) => r.skipped).length;
  const passed = results.length - failed - skippedCount;
  console.log(
    `\n[smoke] summary: ${passed}/${passed + failed} passed, ${failed} failed, ${skippedCount} skipped`,
  );

  if (failed > 0) {
    console.error("\n[smoke] FALLIMENTI:");
    for (const r of results.filter((x) => !x.ok)) {
      console.error(`  ✗ ${r.name} — ${r.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log(`[smoke] ✓ tutti i test passati`);
  }
}

run().catch((err) => {
  console.error(`[smoke] FATAL`, err);
  process.exitCode = 1;
});
