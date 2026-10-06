// Chaos Radio — Prisma client singleton con driver adapter MariaDB
// Prisma 7 richiede driver adapter esplicito per connettersi al DB.

import { PrismaClient } from "../generated/prisma/client.ts";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

// Singleton: in dev con nodemon il modulo viene ricaricato, ma il client va creato una sola volta
// per non saturare il connection pool di MySQL.
const globalForPrisma = globalThis;

function createPrismaClient() {
  console.log("[db.js] env:", {
    DB_HOST: process.env.DB_HOST,
    DB_PORT: process.env.DB_PORT,
    DB_USER: process.env.DB_USER,
    DB_NAME: process.env.DB_NAME,
  });
  const adapter = new PrismaMariaDb({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: parseInt(process.env.DB_PORT ?? "3306", 10),
    user: process.env.DB_USER ?? "chaos_app",
    password: process.env.DB_PASSWORD ?? "devpass",
    database: process.env.DB_NAME ?? "chaos_radio",
  });
  console.log("[db.js] adapter:", typeof adapter, adapter?.adapterName);

  return new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === "production"
        ? ["error"]
        : ["warn", "error"],
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export default prisma;