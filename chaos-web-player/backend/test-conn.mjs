// Test connessione MySQL diretta via mysql2

import mysql from "mysql2/promise";

const conn = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3306,
  user: "chaos_app",
  password: "devpass",
  database: "chaos_radio",
  connectTimeout: 5000,
});

const [rows] = await conn.execute("SELECT VERSION() as v");
console.log("MySQL OK, version:", rows[0].v);

await conn.end();