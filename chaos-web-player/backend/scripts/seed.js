// Chaos Radio — Seed iniziale del database
//
// Crea (idempotente):
//   1. Admin user (se SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD sono settati)
//   2. Playlist "show-list" (vuota: i brani li inserisce `scan.js`)
//   3. Cinque notifiche demo (broadcast), testo "lorem-ish" come da screenshot
//
// NON crea più l'edizione "pirate-day-23": da Fase 10 il Pirate Day è
// pubblicato da `scripts/pirate-day.js` a partire dal manifest
// (`private/audio/pirate-day/manifest.json`). Il seed non deve più essere
// usato per il Pirate Day.
//
// Uso:
//   node --experimental-strip-types scripts/seed.js
//
// Env vars:
//   SEED_ADMIN_EMAIL     default: "admin@chaosroom.online"
//   SEED_ADMIN_PASSWORD  default: NON settato (se vuoto, salta creazione admin)
//   SEED_ADMIN_NAME      default: "Chaos Admin"
//
// ATTENZIONE: in produzione Stellar, impostare SEED_ADMIN_PASSWORD solo la
// prima volta (durante il setup), poi rimuoverla o ruotarla. Lo script
// non aggiorna password di admin esistenti.

import bcrypt from "bcrypt";
import { loadEnv, optionalEnv, timestamp } from "./_shared.mjs";
import { makePrisma } from "./lib/prisma.mjs";
import { normalizeCuratorLinks } from "./lib/curator.mjs";

loadEnv();

const BCRYPT_COST = 12;

async function seedAdmin(prisma) {
  const adminEmail = (optionalEnv("SEED_ADMIN_EMAIL", "admin@chaosroom.online") ?? "")
    .toLowerCase()
    .trim();
  const adminPassword = optionalEnv("SEED_ADMIN_PASSWORD", null);
  const adminDisplayName = optionalEnv("SEED_ADMIN_NAME", "Chaos Admin");

  if (!adminPassword) {
    console.log(
      `[seed] SEED_ADMIN_PASSWORD non settato, salto creazione admin (ok in dev).`,
    );
    return null;
  }
  if (adminPassword.length < 8) {
    throw new Error(
      `SEED_ADMIN_PASSWORD troppo corta (minimo 8 caratteri). ` +
        `Sicurezza prima di tutto, anche in seed.`,
    );
  }

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log(
      `[seed] admin già esistente: ${adminEmail} (id=${existing.id}), nessuna modifica`,
    );
    return existing;
  }
  const passwordHash = await bcrypt.hash(adminPassword, BCRYPT_COST);
  const admin = await prisma.user.create({
    data: {
      email: adminEmail,
      passwordHash,
      displayName: adminDisplayName,
    },
  });
  console.log(`[seed] ✓ admin creato: ${admin.email} (id=${admin.id})`);
  return admin;
}

async function seedShowList(prisma) {
  const playlist = await prisma.playlist.upsert({
    where: { slug: "show-list" },
    create: {
      slug: "show-list",
      title: "Show List",
      kind: "SHOW",
      description:
        "Tutti i brani della stagione, in ordine di uscita.\nAggiunti dallo scanner FTP ogni 5 minuti.",
    },
    update: {
      title: "Show List",
      kind: "SHOW",
      description:
        "Tutti i brani della stagione, in ordine di uscita.\nAggiunti dallo scanner FTP ogni 5 minuti.",
    },
  });
  console.log(`[seed] ✓ playlist show-list (id=${playlist.id})`);
  return playlist;
}


/**
 * Normalizza i `curator_links` delle playlist PIRATE_DAY già presenti.
 *
 * Il vecchio seed scriveva `[{type, url}]`, formato incompatibile con il
 * frontend: `CuratorCard` faceva crash (`ICONS["0"]` undefined). Qui il
 * formato viene corretto una volta sola (idempotente).
 */
async function fixCuratorLinks(prisma) {
  const playlists = await prisma.playlist.findMany({
    where: { kind: "PIRATE_DAY" },
    select: { id: true, slug: true, curatorLinks: true },
  });

  let fixed = 0;
  for (const playlist of playlists) {
    const links = playlist.curatorLinks;
    const isLegacyArray = Array.isArray(links);
    const isEmptyObject =
      links &&
      typeof links === "object" &&
      !isLegacyArray &&
      Object.keys(links).length === 0;
    if (!isLegacyArray && !isEmptyObject) continue;

    const normalized = normalizeCuratorLinks(links);
    await prisma.playlist.update({
      where: { id: playlist.id },
      data: { curatorLinks: normalized },
    });
    fixed++;
    console.log(
      `[seed] ✓ curator_links normalizzati per ${playlist.slug}`,
    );
  }
  if (fixed === 0) {
    console.log("[seed] ✓ curator_links già nel formato giusto");
  }
}

async function seedNotifications(prisma) {
  const notifications = [
    {
      userId: null,
      body: "**Chaos Radio is live.** Welcome to the new season. New shows every Friday at 22:00 CET.",
    },
    {
      userId: null,
      body: "Schedule update: this week's show starts 30 minutes later than usual. Stay tuned.",
    },
    {
      userId: null,
      body: "Pirate Day #23 is on the air — 24 hours of unfiltered transmissions.",
    },
    {
      userId: null,
      body: "Reminder: **the curated playlist is now available** for offline listening.",
    },
    {
      userId: null,
      body: "See you next week.",
    },
  ];

  let inserted = 0;
  for (const n of notifications) {
    const exists = await prisma.notification.findFirst({ where: { body: n.body } });
    if (exists) continue;
    await prisma.notification.create({ data: n });
    inserted++;
  }
  console.log(
    `[seed] ✓ notifiche (${inserted} nuove, ${notifications.length - inserted} già presenti)`,
  );
}

async function main() {
  console.log(`[seed] start ${timestamp()}`);

  const prisma = makePrisma();

  try {
    await seedAdmin(prisma);
    await seedShowList(prisma);
    await fixCuratorLinks(prisma);
    await seedNotifications(prisma);
    console.log(`[seed] ✓ done ${timestamp()}`);
  } finally {
    try {
      await prisma.$disconnect();
    } catch {
      /* already disconnected */
    }
  }
}

main().catch((err) => {
  console.error(`[seed] FATAL`, err);
  process.exitCode = 1;
});
