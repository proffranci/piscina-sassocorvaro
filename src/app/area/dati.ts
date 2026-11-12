import "server-only";
import type { StatoPrenotazione, TipoPrenotazione } from "@/lib/posti";

export type LezioneBase = {
  id: string;
  inizio: string;
  capienza: number;
  scadenza_conferma: string;
  annullata: boolean;
  corsi: { nome: string } | null;
};

export type MiaPrenotazione = {
  id: string;
  stato: StatoPrenotazione;
  tipo: TipoPrenotazione;
  lezioni: LezioneBase;
};

export type Abbonamento = {
  id: string;
  tipo: string;
  data_inizio: string;
  data_fine: string;
  pagato: boolean;
  abbonamenti_orari: {
    orari_corso: { giorno_settimana: number; ora_inizio: string; corsi: { nome: string } | null } | null;
  }[];
};

type Supabase = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> };

// Quanti posti sono occupati in ogni lezione (solo numeri, nessun nome)
export async function postiLiberi(supabase: Supabase, lezioni: LezioneBase[]) {
  const occupati = new Map<string, number>();
  const ids = [...new Set(lezioni.map((l) => l.id))];
  if (ids.length > 0) {
    const { data } = await supabase.rpc("posti_occupati", { p_lezioni: ids });
    for (const r of (data ?? []) as { lezione_id: string; occupati: number }[]) occupati.set(r.lezione_id, r.occupati);
  }
  return (l: LezioneBase) => Math.max(0, l.capienza - (occupati.get(l.id) ?? 0));
}

export const SELECT_MIE = "id, stato, tipo, lezioni!inner(id, inizio, capienza, scadenza_conferma, annullata, corsi(nome))";
export const SELECT_ABBONAMENTI =
  "id, tipo, data_inizio, data_fine, pagato, abbonamenti_orari(orari_corso(giorno_settimana, ora_inizio, corsi(nome)))";
