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
export type ModoScadenza = "stesso_giorno" | "giorno_prima" | "ore_prima" | "nessuna";
const MODI: ModoScadenza[] = ["stesso_giorno", "giorno_prima", "ore_prima", "nessuna"];

export function descriviScadenza(
  modo: string | null | undefined,
  oraFissa: string | null | undefined,
  orePrima: number | null | undefined,
  giorniPrima?: number | null,
) {
  if (modo === "nessuna") return "non serve: il posto è già confermato";
  if (modo === "ore_prima") return `${orePrima ?? 2} ${orePrima === 1 ? "ora" : "ore"} prima dell'inizio`;
  if (modo === "giorno_prima") {
    const g = giorniPrima ?? 1;
    return `${g === 1 ? "il giorno prima" : `${g} giorni prima`} entro le ${ora(oraFissa ?? "21:00")}`;
  }
  return `il giorno stesso entro le ${ora(oraFissa ?? "17:00")}`;
}

// Legge i campi di <CampiScadenza>. Restituisce null se qualcosa non va.
export function leggiScadenza(formData: FormData, obbligatoria: boolean) {
  const modo = testo(formData, "scadenza_modo") as ModoScadenza | "";
  if (!modo && !obbligatoria) {
    return { scadenza_modo: null, scadenza_ora: null, scadenza_ore_prima: null, scadenza_giorni_prima: null };
  }
  if (!MODI.includes(modo as ModoScadenza)) return null;
  const oraFissa = testo(formData, "scadenza_ora");
  const ore = Number(testo(formData, "scadenza_ore_prima") || 2);
  const giorni = Number(testo(formData, "scadenza_giorni_prima") || 1);
  const conOra = modo === "stesso_giorno" || modo === "giorno_prima";
  if (conOra && !/^\d{2}:\d{2}$/.test(oraFissa)) return null;
  if (modo === "ore_prima" && !(Number.isInteger(ore) && ore >= 0 && ore <= 72)) return null;
  if (modo === "giorno_prima" && !(Number.isInteger(giorni) && giorni >= 1 && giorni <= 14)) return null;
  // Per il corso (obbligatoria) le colonne non possono restare vuote: teniamo valori sensati
  return {
    scadenza_modo: modo,
    scadenza_ora: conOra ? oraFissa : obbligatoria ? "17:00" : null,
    scadenza_ore_prima: modo === "ore_prima" ? ore : obbligatoria ? 2 : null,
    scadenza_giorni_prima: modo === "giorno_prima" ? giorni : obbligatoria ? 1 : null,
  };
}

// ---------- Soldi ----------
// 1234.5 -> "€ 1.234,50"
export function euro(importo: number | string | null | undefined) {
  const n = Number(importo ?? 0);
  return n.toLocaleString("it-IT", { style: "currency", currency: "EUR" });
}

// "12,50" oppure "12.50" -> 12.5 (null se vuoto o non valido)
export function leggiImporto(valore: string) {
  const pulito = valore.replace(/\s|€/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  if (!pulito) return null;
  const n = Number(pulito);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : null;
}

export const METODI_PAGAMENTO = [
  { valore: "contanti", testo: "Contanti" },
  { valore: "carta", testo: "Carta di credito" },
  { valore: "bancomat", testo: "Bancomat" },
  { valore: "bonifico", testo: "Bonifico" },
  { valore: "satispay", testo: "Satispay" },
  { valore: "altro", testo: "Altro" },
] as const;

export function nomeMetodo(valore: string) {
  return METODI_PAGAMENTO.find((m) => m.valore === valore)?.testo ?? valore;
}

// Data di oggi in Italia, "2026-11-17" (il server lavora in UTC)
export function oggiItalia() {
  return giornoChiave(new Date());
}

// ---------- Importo in lettere (per le ricevute) ----------
// 120.5 -> "centoventi/50"
const UNITA = ["zero", "uno", "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "diciassette", "diciotto", "diciannove"];
const DECINE = ["", "dieci", "venti", "trenta", "quaranta", "cinquanta", "sessanta", "settanta", "ottanta", "novanta"];

function sotto100(n: number): string {
  if (n < 20) return UNITA[n];
  const d = Math.floor(n / 10);
  const u = n % 10;
  // "ventuno", "ventotto": la decina perde l'ultima vocale
  const decina = u === 1 || u === 8 ? DECINE[d].slice(0, -1) : DECINE[d];
  return decina + (u === 0 ? "" : UNITA[u]);
}

function sotto1000(n: number): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  const centinaia = c === 0 ? "" : c === 1 ? "cento" : `${UNITA[c]}cento`;
  return centinaia + (r === 0 ? "" : sotto100(r));
}

export function numeroInLettere(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n >= 1_000_000) return String(n);
  if (n === 0) return "zero";
  const migliaia = Math.floor(n / 1000);
  const resto = n % 1000;
  const testoMigliaia = migliaia === 0 ? "" : migliaia === 1 ? "mille" : `${sotto1000(migliaia)}mila`;
  const t = testoMigliaia + (resto ? sotto1000(resto) : "");
  // "ventitré", "centotré" (ma "tre" da solo resta senza accento)
  return t.length > 3 && t.endsWith("tre") ? `${t.slice(0, -3)}tré` : t;
}

export function euroInLettere(importo: number | string) {
  const centesimi = Math.round(Number(importo) * 100);
  return `${numeroInLettere(Math.floor(centesimi / 100))}/${String(centesimi % 100).padStart(2, "0")}`;
}

// ---------- L'orario limite spiegato con un esempio ----------
const NOMI_GIORNI = ["", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
const hhmmDa = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

// "Per la lezione di lunedì alle 19:00 gli abbonati devono confermare entro lunedì alle 17:00…"
export function esempioScadenza(
  modo: string | null | undefined,
  oraFissa: string | null | undefined,
  orePrima: number | null | undefined,
  giorniPrima: number | null | undefined,
  giorno: number,
  oraInizio: string,
) {
  const lezione = `Per la lezione di ${NOMI_GIORNI[giorno]} alle ${oraInizio.slice(0, 5)}`;
  if (modo === "nessuna") return `${lezione} gli abbonati non devono confermare: il loro posto resta sempre valido.`;
  const [h, m] = oraInizio.split(":").map(Number);
  const inizio = h * 60 + m;
  let gg = 0; // giorni prima
  let minuti: number;
  if (modo === "ore_prima") {
    minuti = inizio - (orePrima ?? 2) * 60;
    while (minuti < 0) {
      minuti += 1440;
      gg += 1;
    }
  } else {
    const [fh, fm] = (oraFissa ?? (modo === "giorno_prima" ? "21:00" : "17:00")).split(":").map(Number);
    minuti = fh * 60 + fm;
    gg = modo === "giorno_prima" ? (giorniPrima ?? 1) : 0;
    if (gg === 0 && minuti > inizio) minuti = inizio; // mai dopo l'inizio
  }
  const giornoLimite = ((giorno - 1 - (gg % 7) + 7) % 7) + 1;
  const quandoLimite = gg === 0 ? `${NOMI_GIORNI[giornoLimite]} stesso` : gg >= 7 ? `${gg} giorni prima` : NOMI_GIORNI[giornoLimite];
  return `${lezione} gli abbonati devono confermare entro ${quandoLimite} alle ${hhmmDa(minuti)}. Chi non conferma perde il posto, che passa agli ingressi singoli.`;
}
