import Link from "next/link";
import { BottoneInvio } from "@/components/BottoneInvio";
import { CampiPagamento } from "@/components/CampiPagamento";
import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { data as formattaData, euro, nomeMetodo, oggiItalia } from "@/lib/formato";
import { SELECT_PAGAMENTO, numeroRicevuta, type Pagamento } from "@/lib/pagamenti";
import { annullaPagamento, registraPagamento, salvaIntestazione, verificaPagamento } from "./actions";

const MESE = /^\d{4}-\d{2}$/;

// "2026-11" -> primo giorno, primo giorno del mese dopo, "novembre 2026"
function limitiMese(mese: string) {
  const [a, m] = mese.split("-").map(Number);
  const dopo = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  const prima = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  const nome = new Date(Date.UTC(a, m - 1, 15)).toLocaleDateString("it-IT", { month: "long", year: "numeric", timeZone: "UTC" });
  return { da: `${mese}-01`, a: `${dopo}-01`, prima, dopo, nome };
}

export default async function PagamentiPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo } = await richiediStaff();
  const sp = await searchParams;
  const oggi = oggiItalia();
  const scelto = parametro(sp.mese) ?? "";
  const mese = MESE.test(scelto) ? scelto : oggi.slice(0, 7);
  const lim = limitiMese(mese);

  const admin = profilo.ruolo === "admin";
  const [pagRes, clientiRes, corsiRes, impRes, attesaRes] = await Promise.all([
    supabase
      .from("pagamenti")
      .select(SELECT_PAGAMENTO)
      .gte("pagato_il", lim.da)
      .lt("pagato_il", lim.a)
      .order("pagato_il", { ascending: false })
      .order("numero", { ascending: false }),
    supabase.from("profili").select("id, nome, cognome").eq("ruolo", "utente").eq("attivo", true).order("cognome"),
    supabase.from("corsi").select("nome, prezzo_ingresso").eq("attivo", true).order("nome"),
    supabase.from("impostazioni").select("chiave, valore").in("chiave", ["ricevuta_intestazione", "ricevuta_piede"]),
    // Da verificare: di qualsiasi mese
    supabase.from("pagamenti").select(SELECT_PAGAMENTO).eq("verificato", false).eq("annullato", false).order("creato_il"),
  ]);
  const daVerificare = (attesaRes.data ?? []) as unknown as Pagamento[];
  const pagamenti = (pagRes.data ?? []) as unknown as Pagamento[];
  const clienti = (clientiRes.data ?? []) as { id: string; nome: string; cognome: string }[];
  const corsi = (corsiRes.data ?? []) as { nome: string; prezzo_ingresso: number | null }[];
  const imp = new Map(((impRes.data ?? []) as { chiave: string; valore: string }[]).map((r) => [r.chiave, r.valore]));

  const validi = pagamenti.filter((p) => !p.annullato);
  const totale = validi.reduce((t, p) => t + Number(p.importo), 0);
  const perMetodo = new Map<string, number>();
  for (const p of validi) perMetodo.set(p.metodo, (perMetodo.get(p.metodo) ?? 0) + Number(p.importo));
  const torna = `/admin/pagamenti`;

  return (
    <>
      <Titolo>Pagamenti</Titolo>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {/* ---------- Da verificare ---------- */}
          {daVerificare.length > 0 && (
            <Card className="border-corsia">
              <h2 className="mb-1 font-semibold">
                🔎 Pagamenti da verificare <Badge tono="attenzione">{daVerificare.length}</Badge>
              </h2>
              <p className="mb-3 text-sm text-slate-600">
                {admin
                  ? "Registrati dallo staff: controlla che i soldi ci siano (cassa, POS, conto) e conferma. Solo dopo l'abbonamento risulta pagato."
                  : "Registrati in reception: l'admin li deve confermare prima che l'abbonamento risulti pagato."}
              </p>
              <ul className="divide-y divide-slate-100 text-sm">
                {daVerificare.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <strong>{p.intestatario}</strong> · {euro(p.importo)} · {nomeMetodo(p.metodo)}
                      <span className="block text-xs text-slate-500">
                        {p.descrizione} · {formattaData(p.pagato_il)} · n. {numeroRicevuta(p)}
                      </span>
                    </span>
                    {admin && (
                      <span className="flex flex-wrap gap-2">
                        <form action={verificaPagamento}>
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="torna" value={torna} />
                          <BottoneInvio className={bottone}>✓ Verifica</BottoneInvio>
                        </form>
                        <details>
                          <summary className="cursor-pointer py-2 text-xs text-slate-500 underline">Non va bene</summary>
                          <form action={verificaPagamento} className="mt-2 flex gap-2">
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="torna" value={torna} />
                            <input type="hidden" name="esito" value="rifiuta" />
                            <input name="motivo" required placeholder="Perché? (es. non in cassa)" className={campo} />
                            <BottoneInvio className={bottoneSecondario}>Rifiuta</BottoneInvio>
                          </form>
                        </details>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {/* ---------- Mese ---------- */}
          <Card>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Link href={`/admin/pagamenti?mese=${lim.prima}`} className={bottoneSecondario} aria-label="Mese prima">←</Link>
                <h2 className="min-w-[150px] text-center text-lg font-semibold capitalize">{lim.nome}</h2>
                <Link href={`/admin/pagamenti?mese=${lim.dopo}`} className={bottoneSecondario} aria-label="Mese dopo">→</Link>
              </div>
              <a href={`/admin/pagamenti/csv?mese=${mese}`} className={bottoneSecondario}>
                ⬇️ Scarica per il commercialista (CSV)
              </a>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="rounded-xl bg-abisso px-4 py-3 text-white">
                <p className="text-xs uppercase tracking-wide text-white/70">Totale incassato</p>
                <p className="text-2xl font-bold tabular-nums">{euro(totale)}</p>
              </div>
              {[...perMetodo.entries()].map(([m, t]) => (
                <div key={m} className="rounded-xl bg-schiuma px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">{nomeMetodo(m)}</p>
                  <p className="text-lg font-semibold tabular-nums">{euro(t)}</p>
                </div>
              ))}
            </div>
          </Card>

          {/* ---------- Elenco ---------- */}
          <Card className="p-0">
            {pagamenti.length === 0 ? (
              <p className="p-5 text-sm text-slate-500">Nessun pagamento in questo mese.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {pagamenti.map((p) => (
                  <li key={p.id} className={`p-4 ${p.annullato ? "opacity-60" : ""}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold">
                          {p.utente_id ? (
                            <Link href={`/admin/utenti/${p.utente_id}`} className="text-vasca underline">{p.intestatario}</Link>
                          ) : (
                            p.intestatario
                          )}
                        </p>
                        <p className="text-sm text-slate-600">{p.descrizione}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          n. {numeroRicevuta(p)} · {formattaData(p.pagato_il)} · {nomeMetodo(p.metodo)}
                          {p.note ? ` · ${p.note}` : ""}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <span className={`text-lg font-bold tabular-nums ${p.annullato ? "line-through" : ""}`}>{euro(p.importo)}</span>
                        {p.annullato && <Badge>annullata</Badge>}
                        {!p.annullato && !p.verificato && <Badge>in verifica</Badge>}
                      </div>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Link href={`/ricevuta/${p.id}?torna=${encodeURIComponent(`${torna}?mese=${mese}`)}`} className={bottoneSecondario}>
                        🧾 Ricevuta
                      </Link>
                      {!p.annullato && (
                        <details className="text-sm">
                          <summary className="cursor-pointer text-slate-500 underline">Annulla</summary>
                          <form action={annullaPagamento} className="mt-2 flex gap-2">
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="torna" value={torna} />
                            <input name="motivo" required placeholder="Motivo (es. importo sbagliato)" className={campo} />
                            <BottoneInvio className={bottoneSecondario}>Annulla ricevuta</BottoneInvio>
                          </form>
                        </details>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          {/* ---------- Nuovo pagamento ---------- */}
          <Card>
            <h2 className="mb-1 font-semibold">Nuovo pagamento</h2>
            <p className="mb-4 text-sm text-slate-600">
              Ingressi singoli, iscrizioni, cuffie… Per gli abbonamenti è più comodo dalla scheda dell&apos;abbonamento.
            </p>
            <form action={registraPagamento} className="space-y-3">
              <input type="hidden" name="torna" value={torna} />
              <div>
                <label className={etichetta} htmlFor="utente_id">Cliente</label>
                <select id="utente_id" name="utente_id" defaultValue="" className={campo}>
                  <option value="">— Nessuno (scrivi il nome qui sotto) —</option>
                  {clienti.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.cognome} {c.nome}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={etichetta} htmlFor="intestatario">Intestata a (se diverso o senza account)</label>
                <input id="intestatario" name="intestatario" maxLength={120} placeholder="Es. Anna Bianchi" className={campo} />
              </div>
              <div>
                <label className={etichetta} htmlFor="descrizione">Per</label>
                <input id="descrizione" name="descrizione" required list="voci-pagamento" maxLength={200} placeholder="Es. Ingresso singolo Hydrobike" className={campo} />
                <datalist id="voci-pagamento">
                  {corsi.map((c) => (
                    <option key={c.nome} value={`Ingresso singolo ${c.nome}`}>
                      {c.prezzo_ingresso !== null ? euro(c.prezzo_ingresso) : ""}
                    </option>
                  ))}
                  <option value="Iscrizione annuale" />
                </datalist>
              </div>
              <CampiPagamento id="libero" oggi={oggi} />
              <BottoneInvio className={`${bottone} w-full`}>Registra e apri la ricevuta</BottoneInvio>
            </form>
          </Card>

          {/* ---------- Intestazione ricevute ---------- */}
          <Card>
            <h2 className="mb-1 font-semibold">Intestazione delle ricevute</h2>
            {profilo.ruolo === "admin" ? (
              <form action={salvaIntestazione} className="space-y-3">
                <textarea name="intestazione" rows={4} defaultValue={imp.get("ricevuta_intestazione") ?? ""} className={campo} placeholder={"Nome della società\nIndirizzo\nP. IVA / C.F."} />
                <label className={etichetta} htmlFor="piede">Piè di pagina</label>
                <textarea id="piede" name="piede" rows={2} defaultValue={imp.get("ricevuta_piede") ?? ""} className={campo} />
                <BottoneInvio className={bottoneSecondario}>Salva</BottoneInvio>
              </form>
            ) : (
              <p className="whitespace-pre-line text-sm text-slate-600">{imp.get("ricevuta_intestazione")}</p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Le ricevute dell&apos;app sono ricevute di pagamento <strong>non fiscali</strong>: lo scontrino o la fattura vanno emessi
              come sempre con il registratore di cassa.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
