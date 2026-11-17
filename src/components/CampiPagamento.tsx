import { campo, etichetta } from "@/components/ui";
import { METODI_PAGAMENTO } from "@/lib/formato";

// Importo, modalità e data di un pagamento (+ note).
// Usato nella scheda abbonamento, nel nuovo abbonamento e nella pagina Pagamenti.
export function CampiPagamento({
  id,
  importo,
  oggi,
  obbligatorio = true,
}: {
  id: string;
  importo?: number | null;
  oggi: string; // "2026-11-17" in ora italiana
  obbligatorio?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div>
        <label className={etichetta} htmlFor={`importo-${id}`}>Importo (€)</label>
        <input
          id={`importo-${id}`}
          name="importo"
          inputMode="decimal"
          required={obbligatorio}
          defaultValue={importo ? String(importo).replace(".", ",") : ""}
          placeholder="Es. 120,00"
          className={campo}
        />
      </div>
      <div>
        <label className={etichetta} htmlFor={`metodo-${id}`}>Modalità</label>
        <select id={`metodo-${id}`} name="metodo" defaultValue="contanti" className={campo}>
          {METODI_PAGAMENTO.map((m) => (
            <option key={m.valore} value={m.valore}>
              {m.testo}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className={etichetta} htmlFor={`data-${id}`}>Data del pagamento</label>
        <input id={`data-${id}`} name="pagato_il" type="date" max={oggi} defaultValue={oggi} className={campo} />
      </div>
      <div className="sm:col-span-3">
        <label className={etichetta} htmlFor={`note-pag-${id}`}>Note sulla ricevuta (facoltative)</label>
        <input id={`note-pag-${id}`} name="note_pagamento" maxLength={300} placeholder="Es. acconto, saldo, n. bonifico…" className={campo} />
      </div>
    </div>
  );
}
