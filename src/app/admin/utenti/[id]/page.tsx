import Link from "next/link";
import { notFound } from "next/navigation";
import { BottoneInvio } from "@/components/BottoneInvio";
import { BottoneWhatsApp } from "@/components/WhatsApp";
import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff, type Profilo } from "@/lib/sessione";
import { METODI_PAGAMENTO, data as formattaData, etichettaGiorno, euro, nomeMetodo, oraDi } from "@/lib/formato";
import { SELECT_PAGAMENTO, SELECT_PAGAMENTI_ABB, numeroRicevuta, statoPagamento, type PagamentoBreve, type Pagamento } from "@/lib/pagamenti";
import { BadgePagamento } from "@/components/BadgePagamento";
import { registraPagamento, verificaPagamento } from "../../pagamenti/actions";
import { aggiornaUtente, cambiaAttivo, cambiaNomeUtente, eliminaUtente } from "../actions";
import { assegnaTessera, ingressoManuale, rigeneraQrUtente } from "../../ingresso/actions";
import { ReimpostaPassword } from "./ReimpostaPassword";

type Abb = { id: string; tipo: string; data_inizio: string; data_fine: string; pagato: boolean; prezzo: number | string | null; pagamenti: PagamentoBreve[] };
type Attivita = { id: number; creata_il: string; descrizione: string };

export default async function SchedaUtente({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { supabase, profilo: io } = await richiediStaff();
  const { id } = await params;
  const sp = await searchParams;

  const [utenteRes, abbRes, attRes, pagRes] = await Promise.all([
    supabase.from("profili").select("*").eq("id", id).maybeSingle(),
    supabase.from("abbonamenti").select(`id, tipo, data_inizio, data_fine, pagato, prezzo, ${SELECT_PAGAMENTI_ABB}`).eq("utente_id", id).order("data_fine", { ascending: false }),
    supabase.from("attivita").select("id, creata_il, descrizione").eq("utente_id", id).order("creata_il", { ascending: false }).limit(15),
    supabase.from("pagamenti").select(SELECT_PAGAMENTO).eq("utente_id", id).order("pagato_il", { ascending: false }).limit(20),
  ]);
  const pagamenti = (pagRes.data ?? []) as unknown as Pagamento[];
  const u = utenteRes.data as unknown as Profilo | null;
  if (!u) notFound();
  const abbonamenti = (abbRes.data ?? []) as unknown as Abb[];
  const storia = (attRes.data ?? []) as unknown as Attivita[];

  const sonoIo = u.id === io.id;
  const posso = !sonoIo && (u.ruolo === "utente" || io.ruolo === "admin");
  const oggi = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Titolo azione={<Link href="/admin/utenti" className={bottoneSecondario}>← Utenti</Link>}>
        {u.nome} {u.cognome}
      </Titolo>
      <div className="-mt-4 mb-5 flex flex-wrap items-center gap-2 text-sm">
        {u.nome_utente && <span className="font-mono text-slate-600">@{u.nome_utente}</span>}
        <Badge tono={u.ruolo === "utente" ? "neutro" : "attenzione"}>{u.ruolo}</Badge>
        <Badge tono={u.attivo ? "ok" : "neutro"}>{u.attivo ? "attivo" : "disattivato"}</Badge>
        {u.deve_cambiare_password && <Badge tono="attenzione">password temporanea</Badge>}
        <BottoneWhatsApp telefono={u.telefono} etichetta="WhatsApp" />
        {u.telefono && (
          <a href={`tel:${u.telefono.replace(/\s/g, "")}`} className={bottoneSecondario}>
            📞 Chiama
          </a>
        )}
      </div>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      {sonoIo && (
        <Card className="mb-6">
          <p className="text-sm">
            È il tuo account: per cambiare la tua password usa{" "}
            <Link href="/cambia-password" className="text-vasca underline">Cambia password</Link>.
          </p>
        </Card>
      )}
      {!posso && !sonoIo && (
        <Card className="mb-6">
          <p className="text-sm">Questo è un account dello staff: può modificarlo solo un amministratore.</p>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          {/* ---------- Dati ---------- */}
          <Card>
            <h2 className="mb-4 font-semibold">Dati e preferenze</h2>
            <form action={aggiornaUtente} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="id" value={u.id} />
              <fieldset disabled={!posso} className="contents">
                <div>
                  <label className={etichetta} htmlFor="nome">Nome</label>
                  <input id="nome" name="nome" defaultValue={u.nome} required className={campo} />
                </div>
                <div>
                  <label className={etichetta} htmlFor="cognome">Cognome</label>
                  <input id="cognome" name="cognome" defaultValue={u.cognome} required className={campo} />
                </div>
                <div>
                  <label className={etichetta} htmlFor="telefono">Telefono</label>
                  <input id="telefono" name="telefono" type="tel" defaultValue={u.telefono ?? ""} className={campo} />
                </div>
                <div>
                  <label className={etichetta} htmlFor="email">Email di contatto</label>
                  <input id="email" name="email" type="email" defaultValue={u.email ?? ""} className={campo} />
                </div>
                <div>
                  <label className={etichetta} htmlFor="canale_notifica">Avvisi preferiti</label>
                  <select id="canale_notifica" name="canale_notifica" defaultValue={u.canale_notifica === "whatsapp" ? "whatsapp" : "app"} className={campo}>
                    <option value="app">🔔 App</option>
                    <option value="whatsapp">💬 WhatsApp</option>
                  </select>
                </div>
                {io.ruolo === "admin" && (
                  <div>
                    <label className={etichetta} htmlFor="ruolo">Ruolo</label>
                    <select id="ruolo" name="ruolo" defaultValue={u.ruolo} className={campo}>
                      <option value="utente">Cliente</option>
                      <option value="staff">Staff</option>
                      <option value="admin">Admin</option>
                    </select>
                  </div>
                )}
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input type="checkbox" name="consenso_whatsapp" defaultChecked={u.consenso_whatsapp} className="mt-1" />
                  Ha dato il consenso a ricevere messaggi WhatsApp
                </label>
                <div className="sm:col-span-2">
                  <BottoneInvio className={`${bottone} w-full sm:w-auto`} disabled={!posso}>
                    Salva
                  </BottoneInvio>
                </div>
              </fieldset>
            </form>
          </Card>

          {/* ---------- Ingresso: QR e tessera ---------- */}
          {u.ruolo === "utente" && (
            <Card>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-semibold">Ingresso</h2>
                <Link href={`/admin/utenti/${u.id}/tessera`} className="text-sm text-vasca underline">
                  🖨️ Stampa tessera con QR
                </Link>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <form action={ingressoManuale} className="rounded-xl bg-schiuma p-3">
                  <input type="hidden" name="utente_id" value={u.id} />
                  <p className="mb-2 text-sm">Ha dimenticato QR e tessera?</p>
                  <label className="mb-2 flex items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" name="forza" /> Fallo entrare anche se non risulta valido
                  </label>
                  <BottoneInvio className={`${bottoneSecondario} w-full`}>🚪 Registra ingresso ora</BottoneInvio>
                </form>
                <form action={assegnaTessera} className="rounded-xl border border-slate-200 p-3">
                  <input type="hidden" name="utente_id" value={u.id} />
                  <label className="mb-1 block text-sm" htmlFor="tessera">
                    Tessera / braccialetto RFID-NFC
                  </label>
                  <input
                    id="tessera"
                    name="tessera"
                    defaultValue={u.tessera_rfid ?? ""}
                    placeholder="Clicca qui e passa la tessera sul lettore"
                    autoComplete="off"
                    className={`${campo} font-mono`}
                  />
                  <p className="mt-1 text-xs text-slate-500">Usa lo stesso lettore della reception. Vuoto = scollega.</p>
                  <BottoneInvio className={`${bottoneSecondario} mt-2 w-full`}>Salva tessera</BottoneInvio>
                </form>
              </div>
              <form action={rigeneraQrUtente} className="mt-3">
                <input type="hidden" name="utente_id" value={u.id} />
                <BottoneInvio className="text-xs text-slate-500 underline" title="Il QR attuale smette di funzionare">
                  QR perso o condiviso? Creane uno nuovo
                </BottoneInvio>
              </form>
            </Card>
          )}

          {/* ---------- Abbonamenti ---------- */}
          <Card>
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="font-semibold">Abbonamenti</h2>
              <Link href="/admin/abbonamenti/nuovo" className="text-sm text-vasca underline">+ Nuovo</Link>
            </div>
            {abbonamenti.length === 0 ? (
              <p className="text-sm text-slate-500">Nessun abbonamento.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {abbonamenti.map((a) => {
                  const sp = statoPagamento(a);
                  const daSaldare = sp.stato === "da_pagare" || sp.stato === "acconto";
                  return (
                    <li key={a.id} className="py-2">
                      <Link href={`/admin/abbonamenti/${a.id}`} className="flex items-center justify-between gap-2 hover:bg-schiuma/50">
                        <span>
                          <strong>{a.tipo}</strong>
                          <span className="block text-xs text-slate-500">
                            {formattaData(a.data_inizio)} → {formattaData(a.data_fine)}
                            {sp.prezzo !== null && ` · ${euro(sp.prezzo)}`}
                            {sp.residuo ? ` · mancano ${euro(sp.residuo)}` : ""}
                          </span>
                        </span>
                        <span className="flex gap-1">
                          {a.data_fine < oggi && <Badge>scaduto</Badge>}
                          <BadgePagamento stato={sp.stato} />
                        </span>
                      </Link>
                      {/* "Ha saldato": un clic, poi l'admin verifica */}
                      {daSaldare && (
                        <form action={registraPagamento} className="mt-2 flex flex-wrap items-end gap-2 rounded-xl bg-schiuma p-2">
                          <input type="hidden" name="abbonamento_id" value={a.id} />
                          <input type="hidden" name="torna" value={`/admin/utenti/${u.id}`} />
                          <input type="hidden" name="resta" value="1" />
                          <label className="text-xs text-slate-600">
                            Importo €
                            <input
                              name="importo"
                              inputMode="decimal"
                              required
                              defaultValue={sp.residuo ? String(sp.residuo).replace(".", ",") : ""}
                              className={`${campo} w-28`}
                            />
                          </label>
                          <label className="text-xs text-slate-600">
                            Modalità
                            <select name="metodo" defaultValue="contanti" className={`${campo} w-36`}>
                              {METODI_PAGAMENTO.map((m) => (
                                <option key={m.valore} value={m.valore}>
                                  {m.testo}
                                </option>
                              ))}
                            </select>
                          </label>
                          <BottoneInvio className={bottone}>{sp.stato === "acconto" ? "Ha saldato il resto" : "Ha saldato"}</BottoneInvio>
                        </form>
                      )}
                      {sp.stato === "in_verifica" && (
                        <p className="mt-1 text-xs text-slate-500">
                          {euro(sp.inAttesa)} registrati: diventa &quot;pagato&quot; quando l&apos;admin verifica.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* ---------- Pagamenti ---------- */}
          <Card>
            <h2 className="mb-3 font-semibold">Pagamenti</h2>
            {pagamenti.length === 0 ? (
              <p className="text-sm text-slate-500">Nessun pagamento registrato.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {pagamenti.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/ricevuta/${p.id}?torna=${encodeURIComponent(`/admin/utenti/${u.id}`)}`}
                      className={`flex items-center justify-between gap-2 py-2 hover:bg-schiuma/50 ${p.annullato ? "opacity-60" : ""}`}
                    >
                      <span>
                        {p.descrizione}
                        <span className="block text-xs text-slate-500">
                          n. {numeroRicevuta(p)} · {formattaData(p.pagato_il)} · {nomeMetodo(p.metodo)}
                        </span>
                      </span>
                      <span className="flex items-center gap-2">
                        {!p.annullato && !p.verificato && <Badge>in verifica</Badge>}
                        <span className={`font-semibold tabular-nums ${p.annullato ? "line-through" : ""}`}>{euro(p.importo)}</span>
                      </span>
                    </Link>
                    {io.ruolo === "admin" && !p.annullato && !p.verificato && (
                      <form action={verificaPagamento} className="pb-2">
                        <input type="hidden" name="id" value={p.id} />
                        <input type="hidden" name="torna" value={`/admin/utenti/${u.id}`} />
                        <BottoneInvio className={bottone}>✓ Verifica pagamento</BottoneInvio>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* ---------- Storia ---------- */}
          <Card>
            <h2 className="mb-3 font-semibold">Ultime attività</h2>
            {storia.length === 0 ? (
              <p className="text-sm text-slate-500">Ancora niente.</p>
            ) : (
              <ol className="space-y-1.5 text-sm">
                {storia.map((a) => (
                  <li key={a.id} className="flex gap-3">
                    <span className="w-24 shrink-0 text-xs tabular-nums text-slate-500">
                      {etichettaGiorno(a.creata_il)} {oraDi(a.creata_il)}
                    </span>
                    <span>{a.descrizione}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        {/* ---------- Accesso ---------- */}
        {posso && (
          <div className="space-y-6">
            <Card>
              <h2 className="mb-1 font-semibold">Password</h2>
              <p className="mb-4 text-sm text-slate-600">Se l&apos;ha dimenticata, creane una temporanea da comunicargli.</p>
              <ReimpostaPassword id={u.id} nome={u.nome} nomeUtente={u.nome_utente} telefono={u.telefono} />
            </Card>

            <Card>
              <h2 className="mb-1 font-semibold">Nome utente</h2>
              <p className="mb-3 text-sm text-slate-600">
                {u.nome_utente ? (
                  <>
                    Accede con <strong className="font-mono">{u.nome_utente}</strong>.
                  </>
                ) : (
                  <>Ora accede con l&apos;email. Dagli un nome utente per farlo accedere senza email.</>
                )}
              </p>
              <form action={cambiaNomeUtente} className="flex gap-2">
                <input type="hidden" name="id" value={u.id} />
                <input
                  name="nome_utente"
                  defaultValue={u.nome_utente ?? `${u.nome}.${u.cognome}`.toLowerCase().replace(/\s+/g, ".")}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  className={`${campo} font-mono`}
                />
                <BottoneInvio className={bottoneSecondario}>Salva</BottoneInvio>
              </form>
            </Card>

            <Card>
              <h2 className="mb-3 font-semibold">Account</h2>
              <form action={cambiaAttivo}>
                <input type="hidden" name="id" value={u.id} />
                <input type="hidden" name="attivo" value={u.attivo ? "no" : "si"} />
                <input type="hidden" name="torna" value="scheda" />
                <BottoneInvio className={`${bottoneSecondario} w-full`}>
                  {u.attivo ? "Disattiva account" : "Riattiva account"}
                </BottoneInvio>
              </form>
            </Card>

            <Card className="border-red-200">
              <h2 className="mb-1 font-semibold text-red-800">Elimina account</h2>
              <p className="mb-3 text-sm text-slate-600">
                Cancella per sempre accesso, abbonamenti, prenotazioni e avvisi. Le ricevute dei pagamenti restano, con il nome. Se
                vuoi solo bloccarlo, usa &quot;Disattiva&quot;.
              </p>
              <form action={eliminaUtente} className="space-y-3">
                <input type="hidden" name="id" value={u.id} />
                <label className="block text-xs text-slate-600" htmlFor="conferma-elimina">
                  Per conferma scrivi <strong className="font-mono">{u.nome_utente ?? `${u.nome} ${u.cognome}`.trim()}</strong>
                </label>
                <input
                  id="conferma-elimina"
                  name="conferma"
                  required
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  className={campo}
                />
                <BottoneInvio className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">
                  Elimina definitivamente
                </BottoneInvio>
              </form>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
