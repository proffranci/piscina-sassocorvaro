"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { bottone, bottoneSecondario, campo } from "@/components/ui";
import { METODI_PAGAMENTO, euro } from "@/lib/formato";
import { ESITI, type Controllo, type LezioneOggi, type Registrato } from "@/lib/ingresso";
import { confermaIngresso } from "./actions";

const STATI: Record<LezioneOggi["stato"], string> = {
  confermata: "confermata",
  riservata: "da confermare",
  liberata: "posto liberato (non aveva confermato)",
};

const STATI_PAGAMENTO: Record<string, string> = {
  pagato: "pagato ✓",
  in_verifica: "pagato, in verifica",
  acconto: "acconto",
  da_pagare: "da pagare",
};

// La finestra che si apre dopo la lettura: chi è, le sue lezioni di oggi,
// e la scelta di cosa entra a fare. Solo con "Conferma ingresso" si registra.
export function FinestraIngresso({
  controllo: c,
  codice,
  onChiudi,
}: {
  controllo: Controllo;
  codice: string;
  onChiudi: (fatto: Registrato | null) => void;
}) {
  const lezioni = c.lezioni_oggi ?? [];
  const proposte = c.proposte_singolo ?? [];
  const prenotabili = lezioni.filter((l) => !l.finita);
  // Proposta iniziale: la sua lezione di adesso, altrimenti un ingresso singolo
  const diAdesso = prenotabili.find((l) => l.adesso && l.stato !== "liberata" && !l.entrato_il) ?? prenotabili.find((l) => l.adesso);

  const [motivo, setMotivo] = useState<"lezione" | "singolo" | "altro">(diAdesso ? "lezione" : proposte.length > 0 ? "singolo" : "altro");
  const [lezione, setLezione] = useState(diAdesso?.lezione_id ?? prenotabili[0]?.lezione_id ?? "");
  const [singolo, setSingolo] = useState(proposte[0]?.lezione_id ?? "");
  const [pagaOra, setPagaOra] = useState(true);
  const [metodo, setMetodo] = useState("contanti");
  const [importo, setImporto] = useState(proposte[0]?.prezzo ? String(proposte[0].prezzo).replace(".", ",") : "");
  const [nota, setNota] = useState("");
  const [forza, setForza] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);
  const [invio, setInvio] = useState(false);

  // Esc = "Non entra"
  useEffect(() => {
    const tasto = (e: KeyboardEvent) => e.key === "Escape" && onChiudi(null);
    window.addEventListener("keydown", tasto);
    return () => window.removeEventListener("keydown", tasto);
  }, [onChiudi]);

  const scegliSingolo = (id: string) => {
    setSingolo(id);
    const p = proposte.find((x) => x.lezione_id === id);
    setImporto(p?.prezzo ? String(p.prezzo).replace(".", ",") : "");
  };

  const conferma = async () => {
    setErrore(null);
    setInvio(true);
    try {
      const r = await confermaIngresso({
        codice,
        motivo,
        lezione: motivo === "lezione" ? lezione : motivo === "singolo" ? singolo : null,
        importo: motivo === "singolo" && pagaOra ? importo : null,
        metodo: motivo === "singolo" && pagaOra ? metodo : null,
        nota: nota || null,
        forza,
      });
      if ("errore" in r) setErrore(r.errore);
      else onChiudi(r);
    } catch {
      setErrore("Connessione assente: riprova.");
    } finally {
      setInvio(false);
    }
  };

  const stile = ESITI[c.esito];
  const opzione = (attiva: boolean) =>
    `block cursor-pointer rounded-xl border p-3 ${attiva ? "border-acqua bg-schiuma ring-2 ring-acqua/40" : "border-slate-200 bg-white"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-abisso/60 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Ingresso">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          conferma();
        }}
        className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl"
      >
        {/* Chi è */}
        <div className={`px-5 py-4 text-white ${stile.colore}`}>
          <p className="text-xs font-semibold uppercase tracking-wide opacity-90">
            {stile.icona} {stile.titolo}
          </p>
          <p className="text-2xl font-bold">{c.nome}</p>
          {(c.abbonamenti ?? []).length > 0 && (
            <p className="mt-1 text-sm opacity-90">
              {(c.abbonamenti ?? []).map((a) => `${a.tipo} · ${STATI_PAGAMENTO[a.stato] ?? a.stato}`).join("  ·  ")}
            </p>
          )}
        </div>

        <div className="space-y-4 p-5">
          {c.avvisi.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
              {c.avvisi.map((a) => (
                <li key={a}>⚠️ {a}</li>
              ))}
            </ul>
          )}
          {(c.info ?? []).length > 0 && (
            <ul className="space-y-0.5 text-sm text-slate-600">
              {(c.info ?? []).map((a) => (
                <li key={a}>ℹ️ {a}</li>
              ))}
            </ul>
          )}

          {/* Le sue lezioni di oggi */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Le sue lezioni di oggi</p>
            {lezioni.length === 0 ? (
              <p className="text-sm text-slate-500">
                Nessuna.{c.prossima ? ` Prossima: ${c.prossima}.` : ""}
              </p>
            ) : (
              <ul className="space-y-1 text-sm">
                {lezioni.map((l) => (
                  <li key={l.prenotazione_id} className={l.finita ? "text-slate-400" : ""}>
                    <strong className="tabular-nums">{l.ora}</strong> {l.corso} · {STATI[l.stato]}
                    {l.tipo === "ingresso_singolo" && " · ingresso singolo"}
                    {l.entrato_il && " · ✓ già entrato"}
                    {l.adesso && !l.entrato_il && <span className="ml-1 rounded bg-acqua px-1.5 text-xs text-white">adesso</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Cosa entra a fare? */}
          <fieldset className="space-y-2">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Cosa entra a fare?</legend>

            {prenotabili.length > 0 && (
              <label className={opzione(motivo === "lezione")}>
                <span className="flex items-center gap-2 font-medium">
                  <input type="radio" name="motivo" checked={motivo === "lezione"} onChange={() => setMotivo("lezione")} />
                  La sua lezione prenotata
                </span>
                {motivo === "lezione" && (
                  <select value={lezione} onChange={(e) => setLezione(e.target.value)} className={`${campo} mt-2`}>
                    {prenotabili.map((l) => (
                      <option key={l.lezione_id} value={l.lezione_id}>
                        {l.ora} {l.corso} — {STATI[l.stato]}
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}

            <label className={opzione(motivo === "singolo")}>
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name="motivo" checked={motivo === "singolo"} onChange={() => setMotivo("singolo")} disabled={proposte.length === 0} />
                Ingresso singolo {proposte.length === 0 && <span className="text-xs font-normal text-slate-500">(oggi nessun posto libero)</span>}
              </span>
              {motivo === "singolo" && proposte.length > 0 && (
                <div className="mt-2 space-y-2">
                  <select value={singolo} onChange={(e) => scegliSingolo(e.target.value)} className={campo}>
                    {proposte.map((p) => (
                      <option key={p.lezione_id} value={p.lezione_id}>
                        {p.ora} {p.corso} — {p.liberi} {p.liberi === 1 ? "posto" : "posti"}
                        {p.prezzo ? ` · ${euro(p.prezzo)}` : ""}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={pagaOra} onChange={(e) => setPagaOra(e.target.checked)} />
                    Paga adesso (fa la ricevuta)
                  </label>
                  {pagaOra && (
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        value={importo}
                        onChange={(e) => setImporto(e.target.value)}
                        inputMode="decimal"
                        placeholder="Importo €"
                        aria-label="Importo"
                        required
                        className={campo}
                      />
                      <select value={metodo} onChange={(e) => setMetodo(e.target.value)} aria-label="Modalità" className={campo}>
                        {METODI_PAGAMENTO.map((m) => (
                          <option key={m.valore} value={m.valore}>
                            {m.testo}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}
            </label>

            <label className={opzione(motivo === "altro")}>
              <span className="flex items-center gap-2 font-medium">
                <input type="radio" name="motivo" checked={motivo === "altro"} onChange={() => setMotivo("altro")} />
                Altro
              </span>
              {motivo === "altro" && <p className="mt-1 text-xs text-slate-500">Es. accompagna un bambino, viene solo a pagare o a informarsi.</p>}
            </label>

            <input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder={motivo === "altro" ? "Perché entra? (obbligatorio)" : "Nota (facoltativa)"}
              required={motivo === "altro"}
              maxLength={200}
              className={campo}
            />
          </fieldset>

          {c.attivo === false && (
            <label className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-800">
              <input type="checkbox" checked={forza} onChange={(e) => setForza(e.target.checked)} />
              Account disattivato: fallo entrare comunque
            </label>
          )}

          {errore && <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{errore}</p>}

          <div className="flex flex-wrap gap-2 pt-1">
            <button type="submit" disabled={invio || (c.attivo === false && !forza)} className={`${bottone} flex-1`}>
              {invio ? "Registro…" : "✓ Conferma ingresso"}
            </button>
            <button type="button" onClick={() => onChiudi(null)} className={bottoneSecondario}>
              Non entra
            </button>
          </div>
          {c.utente_id && (
            <Link href={`/admin/utenti/${c.utente_id}`} className="block text-center text-xs text-vasca underline">
              Apri la scheda cliente
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}
