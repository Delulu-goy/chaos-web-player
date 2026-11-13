// Chaos Radio — Factory del client Prisma per gli script CLI
//
// Gli script one-shot (scan, pirate-day, pirate-day-init, seed) non vogliono
// l'app Express in vita: creano il loro client Prisma 7 con il driver
// adapter MariaDB e lo chiudono a fine run.
//
// Nota: questo modulo importa il client Prisma, che è un file .ts → gli
// script che lo usano devono girare con `--experimental-strip-types`
// (o su Node >= 22.18, dove lo strip dei types è attivo di default).
// `smoke-test.mjs` NON lo importa: tocca solo l'API HTTP.

import { PrismaClient } from "../../generated/prisma/client.ts";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

/**
 * Crea un client Prisma 7 con driver adapter MariaDB.
 * @returns {import("@prisma/client").PrismaClient}
 */
export function makePrisma() {
  const adapter = new PrismaMariaDb({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    user: process.env.DB_USER ?? "chaos_app",
    password: process.env.DB_PASSWORD ?? "devpass",
    database: process.env.DB_NAME ?? "chaos_radio",
  });
  return new PrismaClient({ adapter, log: ["warn", "error"] });
}
