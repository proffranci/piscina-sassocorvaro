export const GIORNI = [
  "",
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

export function nomeGiorno(n: number) {
  return GIORNI[n] ?? "?";
}

// "19:00:00" -> "19:00"
export function ora(valore: string) {
  return valore.slice(0, 5);
}

// "2026-11-12" -> "12/11/2026"
export function data(valore: string) {
  const [a, m, g] = valore.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

export function testo(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? "").trim();
}

// ---------- Date e ore delle lezioni (sempre in ora italiana) ----------
// Il server di Vercel lavora in UTC: diciamo esplicitamente il fuso.
const FUSO = "Europe/Rome";

// "2026-11-12": per raggruppare le lezioni per giorno
export function giornoChiave(istante: string | Date) {
  return new Date(istante).toLocaleDateString("sv-SE", { timeZone: FUSO });
}

// "Oggi", "Domani" oppure "Sabato 14 novembre"
export function etichettaGiorno(istante: string | Date) {
  const chiave = giornoChiave(istante);
  if (chiave === giornoChiave(new Date())) return "Oggi";
  if (chiave === giornoChiave(new Date(Date.now() + 86_400_000))) return "Domani";
  const s = new Date(istante).toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: FUSO,
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// "19:00"
export function oraDi(istante: string | Date) {
  return new Date(istante).toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: FUSO });
}

// "oggi alle 17:00", "domani alle 21:00", "sabato 15 novembre alle 06:00"
export function quando(istante: string | Date) {
  return `${etichettaGiorno(istante).toLowerCase()} alle ${oraDi(istante)}`;
}

// Per il campo <input type="datetime-local"> in ora italiana: "2026-11-14T17:00"
export function perCampoDataOra(istante: string | Date) {
  const d = new Date(istante);
  const giorno = d.toLocaleDateString("sv-SE", { timeZone: FUSO });
  const ora = d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: FUSO });
  return `${giorno}T${ora}`;
}

// ---------- Scadenza di conferma ----------
export type ModoScadenza = "stesso_giorno" | "giorno_prima" | "ore_prima";

export function descriviScadenza(modo: string | null | undefined, oraFissa: string | null | undefined, orePrima: number | null | undefined) {
  if (modo === "ore_prima") return `${orePrima ?? 2} ${orePrima === 1 ? "ora" : "ore"} prima dell'inizio`;
  if (modo === "giorno_prima") return `il giorno prima entro le ${ora(oraFissa ?? "21:00")}`;
  return `il giorno stesso entro le ${ora(oraFissa ?? "17:00")}`;
}

export function leggiScadenza(formData: FormData, obbligatoria: boolean) {
  const modo = testo(formData, "scadenza_modo");
  if (!modo && !obbligatoria) return { scadenza_modo: null, scadenza_ora: null, scadenza_ore_prima: null };
  if (!["stesso_giorno", "giorno_prima", "ore_prima"].includes(modo)) return null;
  const oraFissa = testo(formData, "scadenza_ora");
  const ore = Number(testo(formData, "scadenza_ore_prima") || 2);
  if (modo !== "ore_prima" && !/^\d{2}:\d{2}$/.test(oraFissa)) return null;
  if (modo === "ore_prima" && !(Number.isInteger(ore) && ore >= 0 && ore <= 72)) return null;
  return {
    scadenza_modo: modo,
    scadenza_ora: modo === "ore_prima" ? null : oraFissa,
    scadenza_ore_prima: modo === "ore_prima" ? ore : null,
  };
}
