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
};

export const SELECT_PAGAMENTO =
  "id, anno, numero, intestatario, descrizione, importo, metodo, pagato_il, note, annullato, motivo_annullamento, utente_id, abbonamento_id";

export const numeroRicevuta = (p: { numero: number; anno: number }) => `${p.numero}/${p.anno}`;
