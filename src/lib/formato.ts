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
