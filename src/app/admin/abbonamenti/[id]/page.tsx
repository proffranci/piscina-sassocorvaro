import Link from "next/link";
import { notFound } from "next/navigation";
import { BottoneInvio } from "@/components/BottoneInvio";
import { CampiPagamento } from "@/components/CampiPagamento";
import { RichiestaCambio, SELECT_RICHIESTE, type RichiestaStaff } from "@/components/RichiestaCambio";
import { BottoneWhatsApp, testiWhatsApp } from "@/components/WhatsApp";
import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { data as formattaData, euro, nomeGiorno, nomeMetodo, oggiItalia, ora } from "@/lib/formato";
import { SELECT_PAGAMENTO, numeroRicevuta, statoPagamento, type Pagamento } from "@/lib/pagamenti";
import { cambiaGiorno } from "../actions";
import { annullaPagamento, registraPagamento, salvaPrezzo, verificaPagamento } from "../../pagamenti/actions";
import { BadgePagamento } from "@/components/BadgePagamento";

type Orario = { id: string; corso_id: string; giorno_settimana: number; ora_inizio: string; corsi: { nome: string } | null };
type Abbonamento = {
  id: string;
  tipo: string;
  data_inizio: string;
  data_fine: string;
  pagato: boolean;
  prezzo: number | string | null;
  pagare_entro: string | null;
  note: string | null;
  utente_id: string;
  profili: { nome: string; cognome: string; telefono: string | null } | null;
  abbonamenti_orari: { orari_corso: Orario | null }[];
};

export default async function SchedaAbbonamento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { supabase, profilo } = await richiediStaff();
  const { id } = await params;
  const admin = profilo.ruolo === "admin";
  const sp = await searchParams;

  const [abbRes, orariRes, richiesteRes, pagRes] = await Promise.all([
    supabase
      .from("abbonamenti")
      .select(
        "id, tipo, data_inizio, data_fine, pagato, prezzo, pagare_entro, note, utente_id, profili(nome, cognome, telefono), abbonamenti_orari(orari_corso(id, corso_id, giorno_settimana, ora_inizio, corsi(nome)))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("orari_corso").select("id, corso_id, giorno_settimana, ora_inizio, corsi(nome)").eq("attivo", true).order("giorno_settimana").order("ora_inizio"),
    supabase.from("richieste_cambio").select(SELECT_RICHIESTE).eq("abbonamento_id", id).eq("stato", "in_attesa"),
    supabase.from("pagamenti").select(SELECT_PAGAMENTO).eq("abbonamento_id", id).order("pagato_il").order("numero"),
  ]);
  const pagamenti = (pagRes.data ?? []) as unknown as Pagamento[];
  const a = abbRes.data as unknown as Abbonamento | null;
  if (!a) notFound();
  const orari = (orariRes.data ?? []) as unknown as Orario[];
  const richieste = (richiesteRes.data ?? []) as unknown as RichiestaStaff[];

  const miei = a.abbonamenti_orari
    .map((x) => x.orari_corso)
    .filter((o): o is Orario => !!o)
    .sort((x, y) => x.giorno_settimana - y.giorno_settimana);
  const mieiId = new Set(miei.map((o) => o.id));
  const alternative = orari.filter((o) => o.corso_id === miei[0]?.corso_id && !mieiId.has(o.id));
  const scaduto = a.data_fine < new Date().toISOString().slice(0, 10);
  const pagina = `/admin/abbonamenti/${a.id}`;
  const { stato, verificato, inAttesa, prezzo, residuo, urgente } = statoPagamento({ ...a, pagamenti });

  return (
    <>
      <Titolo azione={<Link href="/admin/abbonamenti" className={bottoneSecondario}>← Abbonamenti</Link>}>
        {a.profili ? `${a.profili.nome} ${a.profili.cognome}` : "Abbonamento"}
      </Titolo>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{a.tipo}</p>
              <p className="text-sm text-slate-600">
                Dal {formattaData(a.data_inizio)} al {formattaData(a.data_fine)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {scaduto && <Badge>scaduto</Badge>}
              <BadgePagamento stato={stato} urgente={urgente} pagareEntro={a.pagare_entro} />
            </div>
          </div>
          {a.note && <p className="mt-3 text-sm italic text-slate-600">{a.note}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {(stato === "da_pagare" || stato === "acconto") && (
              <a href="#pagamento" className={bottone}>
                💶 Registra pagamento
              </a>
            )}
            {(stato === "da_pagare" || stato === "acconto") && <BottoneWhatsApp telefono={a.profili?.telefono} testo={testiWhatsApp.pagamento(a.profili?.nome ?? "", a.tipo)} />}
            <Link href={`/admin/utenti/${a.utente_id}`} className={bottoneSecondario}>
              Scheda cliente
            </Link>
          </div>
        </Card>

        {richieste.length > 0 && (
          <Card className="border-corsia">
            <h2 className="mb-3 font-semibold">📝 Richiesta del cliente</h2>
            <div className="space-y-3">
              {richieste.map((r) => (
                <RichiestaCambio key={r.id} r={r} torna={pagina} />
              ))}
            </div>
          </Card>
        )}

        {/* ---------- Pagamenti ---------- */}
        <Card className="lg:col-span-2">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold">Pagamenti</h2>
              <p className="text-sm text-slate-600">
                {prezzo !== null && <>Prezzo {euro(prezzo)} · </>}
                verificato <strong>{euro(verificato)}</strong>
                {inAttesa > 0 && (
                  <>
                    {" "}· in verifica <strong>{euro(inAttesa)}</strong>
                  </>
                )}
                {(residuo ?? 0) > 0 && (
                  <>
                    {" "}· mancano <strong className="text-amber-800">{euro(residuo)}</strong>
                  </>
                )}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Diventa &quot;pagato&quot; da solo quando i pagamenti verificati coprono il prezzo. Quelli registrati dallo staff li verifica
                l&apos;admin.
              </p>
            </div>
            <form action={salvaPrezzo} className="flex items-end gap-2">
              <input type="hidden" name="abbonamento_id" value={a.id} />
              <div>
                <label className="mb-1 block text-xs text-slate-600" htmlFor="prezzo">Prezzo (€)</label>
                <input id="prezzo" name="prezzo" inputMode="decimal" defaultValue={prezzo === null ? "" : String(prezzo).replace(".", ",")} placeholder="—" className={`${campo} w-28`} />
              </div>
              <div>
                <label className="mb-1 block text-xs text-slate-600" htmlFor="pagare_entro">Da pagare entro</label>
                <input id="pagare_entro" name="pagare_entro" type="date" defaultValue={a.pagare_entro ?? a.data_inizio} className={`${campo} w-40`} />
              </div>
              <BottoneInvio className={bottoneSecondario}>Salva</BottoneInvio>
            </form>
          </div>

          {pagamenti.length > 0 && (
            <ul className="mb-5 divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
              {pagamenti.map((p) => (
                <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 ${p.annullato ? "opacity-60" : ""}`}>
                  <span>
                    <strong className={`tabular-nums ${p.annullato ? "line-through" : ""}`}>{euro(p.importo)}</strong> · {nomeMetodo(p.metodo)} ·{" "}
                    {formattaData(p.pagato_il)}
                    {!p.annullato && !p.verificato && (
                      <span className="ml-2">
                        <Badge>in verifica</Badge>
                      </span>
                    )}
                    <span className="block text-xs text-slate-500">
                      Ricevuta n. {numeroRicevuta(p)}
                      {p.note ? ` · ${p.note}` : ""}
                      {p.annullato ? ` · annullata: ${p.motivo_annullamento ?? ""}` : ""}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2">
                    <Link href={`/ricevuta/${p.id}?torna=${encodeURIComponent(pagina)}`} className={bottoneSecondario}>🧾 Ricevuta</Link>
                    {admin && !p.annullato && !p.verificato && (
                      <form action={verificaPagamento}>
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="torna" value={pagina} />
                        <BottoneInvio className={bottone}>✓ Verifica</BottoneInvio>
                      </form>
                    )}
                    {!p.annullato && (admin || !p.verificato) && (
                      <details>
                        <summary className="cursor-pointer text-xs text-slate-500 underline">Annulla</summary>
                        <form action={annullaPagamento} className="mt-2 flex gap-2">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="torna" value={pagina} />
                          <input name="motivo" required placeholder="Motivo" className={campo} />
                          <BottoneInvio className={bottoneSecondario}>OK</BottoneInvio>
                        </form>
                      </details>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <details id="pagamento" open={stato === "da_pagare" || stato === "acconto"} className="scroll-mt-24 rounded-xl bg-schiuma p-4">
            <summary className="cursor-pointer font-medium">💶 Registra un pagamento</summary>
            <form action={registraPagamento} className="mt-4 space-y-3">
              <input type="hidden" name="abbonamento_id" value={a.id} />
              <input type="hidden" name="torna" value={pagina} />
              <CampiPagamento id={a.id} oggi={oggiItalia()} importo={residuo && residuo > 0 ? residuo : null} />
              <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Registra e apri la ricevuta</BottoneInvio>
            </form>
          </details>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-1 font-semibold">Giorni fissi</h2>
          <p className="mb-4 text-sm text-slate-600">
            Cambiando un giorno, i posti delle lezioni future vengono spostati sul nuovo orario.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {miei.map((o) => (
              <form key={o.id} action={cambiaGiorno} className="rounded-xl border border-slate-200 p-4">
                <input type="hidden" name="abbonamento_id" value={a.id} />
                <input type="hidden" name="vecchio" value={o.id} />
                <p className="mb-3 font-medium">
                  {nomeGiorno(o.giorno_settimana)} {ora(o.ora_inizio)} · {o.corsi?.nome}
                </p>
                <label className={etichetta} htmlFor={`nuovo-${o.id}`}>Sostituisci con</label>
                <select id={`nuovo-${o.id}`} name="nuovo" required defaultValue="" className={campo}>
                  <option value="" disabled>
                    Scegli il nuovo orario…
                  </option>
                  {alternative.map((x) => (
                    <option key={x.id} value={x.id}>
                      {nomeGiorno(x.giorno_settimana)} {ora(x.ora_inizio)} · {x.corsi?.nome}
                    </option>
                  ))}
                </select>
                <BottoneInvio className={`${bottoneSecondario} mt-3 w-full`}>Cambia giorno</BottoneInvio>
              </form>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
