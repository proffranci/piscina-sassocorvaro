// ---------- Ingresso in reception ----------
// 1) si legge il codice -> il database risponde con un CONTROLLO (niente registrato)
// 2) la reception sceglie cosa entra a fare -> REGISTRAZIONE

export type Esito = "ok" | "attenzione" | "negato" | "forzato" | "scegli";

// Persone già assegnate a ogni corsia (solo corsi a corsie)
export type Corsia = { n: number; persone: number };

export type LezioneOggi = {
  prenotazione_id: string;
  lezione_id: string;
  corso: string;
  ora: string;
  stato: "riservata" | "confermata" | "liberata";
  tipo: "abbonamento" | "ingresso_singolo";
  entrato_il: string | null;
  adesso: boolean;
  finita: boolean;
  corso_id: string;
  corsia: number | null;
  corsie: Corsia[] | null;
};

export type Proposta = {
  lezione_id: string;
  corso: string;
  corso_id: string;
  ora: string;
  liberi: number;
  prezzo: number | null;
  corsie: Corsia[] | null;
};

export type Controllo = {
  trovato: boolean;
  esito: Esito;
  utente_id?: string;
  nome?: string;
  telefono?: string | null;
  attivo?: boolean;
  avvisi: string[];
  info?: string[];
  abbonamenti?: {
    id: string;
    tipo: string;
    data_fine: string;
    stato: string;
    pagare_entro: string;
    residuo: number | null;
    carnet: boolean;
    rimasti: number | null;
    corso_id: string | null;
  }[];
  lezioni_oggi?: LezioneOggi[];
  prossima?: string | null;
  proposte_singolo?: Proposta[];
};

export type Registrato = {
  esito: Esito;
  nome: string;
  utente_id: string;
  lezione: string | null;
  messaggi: string[];
  pagamento_id: string | null;
};

export type SceltaIngresso = {
  codice: string;
  motivo: "lezione" | "singolo" | "altro";
  lezione?: string | null;
  importo?: string | null;
  metodo?: string | null; // pieno = paga adesso
  nota?: string | null;
  forza?: boolean;
  carnet?: string | null; // scala un ingresso da questo carnet
  corsia?: number | null;
};

export type RigaIngresso = {
  id: number;
  creato_il: string;
  utente_id: string | null;
  nome: string | null;
  esito: Esito;
  messaggi: string[];
  motivo: string | null;
  pagamento_id: string | null;
};

// Il contenuto del QR: "PSC:" + il codice personale
export const testoQr = (codice: string) => `PSC:${codice}`;

export const ESITI: Record<Esito, { titolo: string; colore: string; icona: string }> = {
  ok: { titolo: "Tutto a posto", colore: "bg-emerald-600", icona: "✅" },
  attenzione: { titolo: "C'è qualcosa da controllare", colore: "bg-amber-500", icona: "⚠️" },
  negato: { titolo: "Non risulta valido", colore: "bg-red-600", icona: "⛔" },
  forzato: { titolo: "Entrato su decisione della reception", colore: "bg-slate-700", icona: "🚪" },
  scegli: { titolo: "Nessuna lezione prenotata adesso", colore: "bg-vasca", icona: "🏊" },
};

export const MOTIVI: Record<string, string> = { lezione: "lezione", singolo: "ingresso singolo", altro: "altro" };
