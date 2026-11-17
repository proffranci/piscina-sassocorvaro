// Quello che il database risponde a ogni lettura in reception
export type EsitoIngresso = {
  esito: "ok" | "attenzione" | "negato" | "forzato";
  nome: string | null;
  utente_id: string | null;
  telefono?: string | null;
  lezione: string | null;
  abbonamenti: { id: string; tipo: string; data_fine: string; pagato: boolean }[];
  messaggi: string[];
};

export type RigaIngresso = {
  id: number;
  creato_il: string;
  utente_id: string | null;
  nome: string | null;
  esito: EsitoIngresso["esito"];
  messaggi: string[];
};

// Il contenuto del QR: "PSC:" + il codice personale
export const testoQr = (codice: string) => `PSC:${codice}`;

export const ESITI: Record<EsitoIngresso["esito"], { titolo: string; colore: string; icona: string }> = {
  ok: { titolo: "Tutto a posto", colore: "bg-emerald-600", icona: "✅" },
  attenzione: { titolo: "Entrato, ma controlla", colore: "bg-amber-500", icona: "⚠️" },
  negato: { titolo: "Non risulta valido", colore: "bg-red-600", icona: "⛔" },
  forzato: { titolo: "Fatto entrare", colore: "bg-slate-700", icona: "🚪" },
};
