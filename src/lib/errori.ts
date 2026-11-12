type ErroreDb = { code?: string; message: string } | null;

// Trasforma un errore del database in un messaggio per l'utente.
// P0001 = messaggi scritti da noi nelle funzioni SQL (es. "Lezione al completo"):
// sono pensati per l'utente e si possono mostrare. Gli altri restano generici.
export function messaggioDb(error: ErroreDb, generico: string) {
  if (!error) return generico;
  if (error.code === "P0001") return error.message;
  if (error.code === "23505") return "Questa persona ha già un posto in questa lezione.";
  return generico;
}
