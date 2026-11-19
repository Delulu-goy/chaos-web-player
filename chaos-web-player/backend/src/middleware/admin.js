// Chaos Radio — Middleware "solo admin"
//
// Gli amministratori sono elencati in `ADMIN_EMAILS` (lista separata da
// virgola). Non esiste un ruolo nel DB: introdurlo richiederebbe una
// migration + un cambio del JWT, per una lista che cambia una volta al
// mese. La lista in env è più semplice da ruotare.
//
// Se `ADMIN_EMAILS` non è impostata, l'endpoint resta chiuso a tutti
// (fail-closed): meglio un endpoint amministratore irraggiungibile che
// notifiche aperte a chiunque.

/**
 * Elenco email admin normalizzate (minuscole, senza spazi).
 * @returns {string[]}
 */
export function adminEmails() {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * @param {{email?: string}|null|undefined} user
 * @returns {boolean}
 */
export function isAdmin(user) {
  if (!user?.email) return false;
  return adminEmails().includes(String(user.email).toLowerCase());
}

/**
 * Middleware: richiede un utente autenticato con email da admin.
 * Deve essere montato DOPO `requireAuth` (che popola `req.user`).
 */
export function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}
