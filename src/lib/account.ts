import "server-only";
import { randomInt } from "node:crypto";

// Supabase vuole sempre un'email per il login. Per chi non ce l'ha usiamo
// un'email "di servizio" costruita dal nome utente: non riceve nulla,
// serve solo come identificativo. Es. "mario.rossi" -> mario.rossi@utenti.piscina-sassocorvaro.it
export const DOMINIO_UTENTI = "utenti.piscina-sassocorvaro.it";

// "Mario Rossi" -> "mario.rossi" (niente accenti, spazi o simboli strani)
export function normalizzaNomeUtente(grezzo: string) {
  return grezzo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ".")
    .replace(/[^a-z0-9._-]/g, "")
    .slice(0, 30);
}

export function nomeUtenteValido(n: string) {
  return /^[a-z0-9][a-z0-9._-]{2,29}$/.test(n);
}

export function emailDiServizio(nomeUtente: string) {
  return `${nomeUtente}@${DOMINIO_UTENTI}`;
}

// Quello che la persona scrive nel login: email vera oppure nome utente
export function emailPerAccesso(scritto: string) {
  const s = scritto.trim().toLowerCase();
  return s.includes("@") ? s : emailDiServizio(normalizzaNomeUtente(s));
}

// Password temporanea facile da dettare al telefono: "Onda-4821-Tuffo"
const PAROLE = [
  "Onda", "Vasca", "Tuffo", "Delfino", "Boa", "Pinna", "Corsia", "Bracciata", "Spruzzo", "Bolla",
  "Squalo", "Vela", "Faro", "Molo", "Sirena", "Gabbiano", "Remo", "Ancora", "Marea", "Scoglio",
];
export function passwordTemporanea() {
  const parola = () => PAROLE[randomInt(PAROLE.length)];
  return `${parola()}-${randomInt(1000, 10000)}-${parola()}`;
}
