import { leggiImporto, oggiItalia, testo } from "@/lib/formato";

const DATA = /^\d{4}-\d{2}-\d{2}$/;

export type DatiPagamento = { importo: number; metodo: string; data: string; note: string | null };

// Legge importo / modalità / data / note (vedi components/CampiPagamento.tsx)
export function leggiPagamento(formData: FormData): DatiPagamento | { errore: string } {
  const importo = leggiImporto(testo(formData, "importo"));
  const metodo = testo(formData, "metodo");
  const data = testo(formData, "pagato_il") || oggiItalia();
  if (importo === null || importo <= 0) return { errore: "Scrivi un importo valido (es. 25,00)." };
  if (!DATA.test(data)) return { errore: "Data del pagamento non valida." };
  if (data > oggiItalia()) return { errore: "La data del pagamento non può essere nel futuro." };
  return { importo, metodo, data, note: testo(formData, "note_pagamento") || null };
}

export type Pagamento = {
  id: string;
  anno: number;
  numero: number;
  intestatario: string;
  descrizione: string;
  importo: number | string;
  metodo: string;
  pagato_il: string;
  note: string | null;
  annullato: boolean;
  motivo_annullamento: string | null;
  utente_id: string | null;
  abbonamento_id: string | null;
  verificato: boolean;
};

export const SELECT_PAGAMENTO =
  "id, anno, numero, intestatario, descrizione, importo, metodo, pagato_il, note, annullato, motivo_annullamento, utente_id, abbonamento_id, verificato";

export const numeroRicevuta = (p: { numero: number; anno: number }) => `${p.numero}/${p.anno}`;

// ---------- Lo stato del pagamento di un abbonamento ----------
// Il "pagato" vero lo decide il database (pagamenti verificati dall'admin);
// qui lo traduciamo in parole per le pagine.
export type StatoPagamento = "pagato" | "in_verifica" | "acconto" | "da_pagare";

export const SELECT_PAGAMENTI_ABB = "pagamenti(importo, verificato, annullato)";

export type PagamentoBreve = { importo: number | string; verificato: boolean; annullato: boolean };

export function statoPagamento(a: { pagato: boolean; prezzo?: number | string | null; pagamenti?: PagamentoBreve[] | null }) {
  const validi = (a.pagamenti ?? []).filter((p) => !p.annullato);
  const verificato = validi.filter((p) => p.verificato).reduce((t, p) => t + Number(p.importo), 0);
  const inAttesa = validi.filter((p) => !p.verificato).reduce((t, p) => t + Number(p.importo), 0);
  const prezzo = a.prezzo === null || a.prezzo === undefined ? null : Number(a.prezzo);
  const residuo = prezzo === null ? null : Math.max(0, Math.round((prezzo - verificato - inAttesa) * 100) / 100);

  let stato: StatoPagamento;
  if (a.pagato) stato = "pagato";
  else if (inAttesa > 0 && (residuo === null || residuo === 0)) stato = "in_verifica";
  else if (verificato + inAttesa > 0) stato = "acconto";
  else stato = "da_pagare";
  return { stato, verificato, inAttesa, prezzo, residuo };
}

export const ETICHETTE_STATO: Record<StatoPagamento, { testo: string; tono: "ok" | "attenzione" | "neutro" }> = {
  pagato: { testo: "pagato ✓", tono: "ok" },
  in_verifica: { testo: "in verifica dall'admin", tono: "neutro" },
  acconto: { testo: "acconto versato", tono: "attenzione" },
  da_pagare: { testo: "da pagare", tono: "attenzione" },
};
