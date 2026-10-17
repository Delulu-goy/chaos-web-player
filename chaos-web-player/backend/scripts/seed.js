// Chaos Radio — Seed iniziale del database
//
// Crea (idempotente):
//   1. Admin user (se SEED_ADMIN_EMAIL + SEED_ADMIN_PASSWORD sono settati)
//   2. Playlist "show-list" (vuota)
//   3. Playlist "pirate-day-23" con curator + descrizione + endsAt = +24h
//      (così /api/playlists/pirate-day ritorna 200 alla prima apertura
//      del frontend e l'utente vede la pagina completa, non l'empty state)
//   4. Cinque notifiche demo (broadcast), testo "lorem-ish" come da screenshot
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

import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcrypt";
import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { loadEnv, optionalEnv, timestamp } from "./_shared.mjs";

loadEnv();

const BCRYPT_COST = 12;

function makePrisma() {
  const adapter = new PrismaMariaDb({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    user: process.env.DB_USER ?? "chaos_app",
    password: process.env.DB_PASSWORD ?? "devpass",
    database: process.env.DB_NAME ?? "chaos_radio",
  });
  return new PrismaClient({ adapter, log: ["warn", "error"] });
}

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

async function seedPirateDay(prisma) {
  const now = new Date();
  // Pirate Day "in onda" da 1h fa a tra 24h: dà tempo all'utente di vederlo
  // dal momento del seed e di apprezzare il countdown live.
  const startsAt = new Date(now.getTime() - 60 * 60 * 1000);
  const endsAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const description =
    "**A new transmission begins.** Twenty-four hours of pirate frequencies, broadcasts from somewhere off the coast.\n\n" +
    "Curated by **DJ Skeleton** with selections from the deep archive. " +
    "Tune in, stay awhile. The signal is clearer after dark.";

  const curatorLinks = [
    { type: "music", url: "https://example.com/dj-skeleton" },
    { type: "play", url: "https://example.com/dj-skeleton/live" },
    { type: "cloud", url: "https://soundcloud.com/dj-skeleton" },
    { type: "camera", url: "https://instagram.com/dj-skeleton" },
  ];

  const playlist = await prisma.playlist.upsert({
    where: { slug: "pirate-day-23" },
    create: {
      slug: "pirate-day-23",
      title: "PIRATE DAY #23",
      kind: "PIRATE_DAY",
      curatorName: "DJ Skeleton",
      curatorRole: "Resident Curator",
      curatorAvatar: null,
      curatorLinks,
      description,
      startsAt,
      endsAt,
    },
    update: {
      title: "PIRATE DAY #23",
      kind: "PIRATE_DAY",
      curatorName: "DJ Skeleton",
      curatorRole: "Resident Curator",
      curatorLinks,
      description,
      // Non forziamo startsAt/endsAt su update: lo script è idempotente,
      // se la Pirate Day esiste già, NON rinnoviamo i timer.
    },
  });
  console.log(
    `[seed] ✓ playlist pirate-day-23 (id=${playlist.id}, endsAt=${playlist.endsAt?.toISOString() ?? "null"})`,
  );
  return playlist;
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
    await seedPirateDay(prisma);
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
