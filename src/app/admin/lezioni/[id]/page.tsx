import { BottoneWhatsApp, testiWhatsApp } from "@/components/WhatsApp";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BarraPosti } from "@/components/BarraPosti";
import { Avviso, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { etichettaGiorno, oraDi, perCampoDataOra, quando } from "@/lib/formato";
import { contaPosti, type StatoPrenotazione, type TipoPrenotazione } from "@/lib/posti";
import { aggiungiIngresso, annullaLezione, confermaIngresso, confermaPerConto, liberaPosto, modificaLezione } from "../actions";
import { BottoneInvio } from "@/components/BottoneInvio";

type Prenotazione = {
  id: string;
  stato: StatoPrenotazione;
  tipo: TipoPrenotazione;
  nome_ospite: string | null;
  da_confermare_staff: boolean;
  confermata_il: string | null;
  profili: { nome: string; cognome: string; telefono: string | null; email: string | null } | null;
};

type Lezione = {
  id: string;
  inizio: string;
  fine: string;
  capienza: number;
  scadenza_conferma: string;
  annullata: boolean;
  personalizzata: boolean;
  motivo_annullamento: string | null;
  orario_corso_id: string | null;
  corsi: { nome: string } | null;
  prenotazioni: Prenotazione[];
};

function nomeDi(p: Prenotazione) {
  if (p.profili) return `${p.profili.cognome} ${p.profili.nome}`.trim();
  return p.nome_ospite ? `${p.nome_ospite} (ospite)` : "—";
}

export default async function LezionePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { supabase } = await richiediStaff();
  const { id } = await params;
  const sp = await searchParams;

  const [lezioneRes, utentiRes] = await Promise.all([
    supabase
      .from("lezioni")
      .select(
        "id, inizio, fine, capienza, scadenza_conferma, annullata, personalizzata, motivo_annullamento, orario_corso_id, corsi(nome), prenotazioni(id, stato, tipo, nome_ospite, confermata_il, da_confermare_staff, profili(nome, cognome, telefono, email))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("profili").select("id, nome, cognome").eq("attivo", true).order("cognome"),
  ]);

  // Se il database risponde con un errore lo mostriamo, invece di una pagina vuota:
  // così capiamo subito cosa non va (es. uno script SQL non eseguito)
  if (lezioneRes.error) {
    console.error("[lezione] errore nel caricamento:", lezioneRes.error);
    return (
      <>
        <Titolo azione={<Link href="/admin/lezioni" className={bottoneSecondario}>← Lezioni</Link>}>Lezione</Titolo>
        <Avviso
          errore={`Non riesco a caricare la lezione. Dettaglio tecnico: ${lezioneRes.error.message} (${lezioneRes.error.code ?? "?"})`}
        />
      </>
    );
  }

  const lezione = lezioneRes.data as unknown as Lezione | null;
  if (!lezione) notFound();
  const utenti = (utentiRes.data ?? []) as unknown as { id: string; nome: string; cognome: string }[];

  const adesso = new Date();
  const iniziata = new Date(lezione.inizio) <= adesso;
  const confermeChiuse = new Date(lezione.scadenza_conferma) <= adesso;
  const c = contaPosti(lezione.capienza, lezione.prenotazioni);
  const titoloLezione = `${lezione.corsi?.nome ?? "lezione"} ${etichettaGiorno(lezione.inizio).toLowerCase()} alle ${oraDi(lezione.inizio)}`;
  const ordina = (a: Prenotazione, b: Prenotazione) => nomeDi(a).localeCompare(nomeDi(b));

  const gruppi = [
    {
      titolo: "Da confermare",
      nota: confermeChiuse ? "Le conferme sono chiuse: tra pochi istanti questi posti verranno liberati." : `Entro ${quando(lezione.scadenza_conferma)}`,
      righe: lezione.prenotazioni.filter((p) => p.stato === "riservata").sort(ordina),
    },
    {
      titolo: "Abbonati confermati",
      righe: lezione.prenotazioni.filter((p) => p.stato === "confermata" && p.tipo === "abbonamento").sort(ordina),
    },
    {
      titolo: "Ingressi singoli",
      nota: "Quelli \"da confermare\" aspettano la tua conferma: premendo Conferma il cliente riceve l'avviso",
      // prima quelli da confermare
      righe: lezione.prenotazioni
        .filter((p) => p.stato === "confermata" && p.tipo === "ingresso_singolo")
        .sort((a, b) => Number(b.da_confermare_staff) - Number(a.da_confermare_staff) || ordina(a, b)),
    },
    {
      titolo: "Posti liberati",
      nota: "Abbonati che non hanno confermato o hanno disdetto",
      righe: lezione.prenotazioni.filter((p) => p.stato === "liberata").sort(ordina),
    },
  ];

  return (
    <>
      <Titolo azione={<Link href="/admin/lezioni" className={bottoneSecondario}>← Lezioni</Link>}>
        {lezione.corsi?.nome} · {etichettaGiorno(lezione.inizio)} alle {oraDi(lezione.inizio)}
      </Titolo>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      {lezione.annullata && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <strong>Lezione annullata.</strong> {lezione.motivo_annullamento ?? ""} I prenotati sono stati avvisati.
        </div>
      )}
      <Card className="mb-6">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-lg font-semibold">
            {lezione.capienza - c.liberi} / {lezione.capienza} posti occupati
          </p>
          <p className="text-sm text-slate-600">
            {lezione.annullata ? "Lezione annullata" : iniziata ? "Lezione iniziata" : `${c.liberi} posti prenotabili`}
          </p>
        </div>
        <BarraPosti conteggio={c} legenda />
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {gruppi.map((g) => (
            <section key={g.titolo}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {g.titolo} <span className="text-abisso">({g.righe.length})</span>
              </h2>
              {g.nota && <p className="mb-2 text-xs text-slate-500">{g.nota}</p>}
              {g.righe.length === 0 ? (
                <p className="mt-2 text-sm text-slate-400">Nessuno.</p>
              ) : (
                <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {g.righe.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                      <span>
                        <span className="font-medium">{nomeDi(p)}</span>
                        {p.da_confermare_staff && p.stato === "confermata" && (
                          <span className="ml-2 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
                            da confermare
                          </span>
                        )}
                        {p.profili?.telefono && (
                          <a href={`tel:${p.profili.telefono.replace(/\s/g, "")}`} className="ml-2 text-vasca underline">
                            {p.profili.telefono}
                          </a>
                        )}
                      </span>
                      <span className="flex flex-wrap gap-2">
                        {/* WhatsApp con il testo giusto: promemoria per chi deve confermare, messaggio libero per gli altri */}
                        {!iniziata && (
                          <BottoneWhatsApp
                            telefono={p.profili?.telefono}
                            etichetta=""
                            testo={
                              p.stato === "riservata" && !confermeChiuse
                                ? testiWhatsApp.conferma(p.profili?.nome ?? "", titoloLezione, quando(lezione.scadenza_conferma))
                                : p.stato === "confermata"
                                  ? testiWhatsApp.confermata(p.profili?.nome ?? p.nome_ospite ?? "", titoloLezione)
                                  : testiWhatsApp.lezione(p.profili?.nome ?? "", titoloLezione)
                            }
                          />
                        )}
                      {!iniziata && (p.stato === "riservata" || p.stato === "confermata") && (
                        <span className="flex gap-2">
                          {p.da_confermare_staff && p.stato === "confermata" && (
                            <form action={confermaIngresso}>
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="lezione_id" value={lezione.id} />
                              <BottoneInvio className={bottone}>✓ Conferma</BottoneInvio>
                            </form>
                          )}
                          {p.stato === "riservata" && !confermeChiuse && (
                            <form action={confermaPerConto}>
                              <input type="hidden" name="id" value={p.id} />
                              <input type="hidden" name="lezione_id" value={lezione.id} />
                              <BottoneInvio className={bottoneSecondario}>Conferma</BottoneInvio>
                            </form>
                          )}
                          <form action={liberaPosto}>
                            <input type="hidden" name="id" value={p.id} />
                            <input type="hidden" name="lezione_id" value={lezione.id} />
                            <input type="hidden" name="tipo" value={p.tipo} />
                            <BottoneInvio className={bottoneSecondario}>{p.tipo === "abbonamento" ? "Libera posto" : "Annulla"}</BottoneInvio>
                          </form>
                        </span>
                      )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {!iniziata && !lezione.annullata && (
          <Card className="order-first h-fit lg:order-none">
            <h2 className="mb-1 font-semibold">Aggiungi ingresso singolo</h2>
            <p className="mb-4 text-xs text-slate-500">
              Per chi telefona o si presenta in reception. {c.liberi === 0 && "Ora non ci sono posti liberi."}
            </p>
            <form action={aggiungiIngresso} className="space-y-3">
              <input type="hidden" name="lezione_id" value={lezione.id} />
              <div>
                <label className={etichetta} htmlFor="utente_id">Cliente registrato</label>
                <select id="utente_id" name="utente_id" className={campo} defaultValue="">
                  <option value="">— nessuno —</option>
                  {utenti.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.cognome} {u.nome}
                    </option>
                  ))}
                </select>
              </div>
              <p className="text-center text-xs text-slate-400">oppure</p>
              <div>
                <label className={etichetta} htmlFor="nome_ospite">Nome e cognome (senza account)</label>
                <input id="nome_ospite" name="nome_ospite" placeholder="Es. Anna Bianchi" className={campo} />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <input type="checkbox" name="conferma_subito" className="mt-1" />
                <span>
                  Invia subito la conferma
                  <span className="block text-xs text-slate-500">Altrimenti la confermi dopo con il pulsante ✓ Conferma</span>
                </span>
              </label>
              <BottoneInvio className={`${bottone} w-full`} disabled={c.liberi === 0}>
                Aggiungi
              </BottoneInvio>
            </form>
          </Card>
        )}
      </div>

      {/* ---------- Modifica / annulla ---------- */}
      {!iniziata && (
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <Card>
            <h2 className="mb-1 font-semibold">Modifica questa lezione</h2>
            <p className="mb-4 text-sm text-slate-600">
              Solo per questa data. {lezione.personalizzata && "Questa lezione è già personalizzata: non segue più le impostazioni dell'orario."}
            </p>
            <form action={modificaLezione} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="lezione_id" value={lezione.id} />
              <div>
                <label className={etichetta} htmlFor="capienza">Posti</label>
                <input id="capienza" name="capienza" type="number" min={1} max={500} defaultValue={lezione.capienza} className={campo} />
              </div>
              <div>
                <label className={etichetta} htmlFor="scadenza">Scadenza conferma abbonati</label>
                <input id="scadenza" name="scadenza" type="datetime-local" defaultValue={perCampoDataOra(lezione.scadenza_conferma)} className={campo} />
              </div>
              <div className="sm:col-span-2">
                <BottoneInvio className={`${bottoneSecondario} w-full sm:w-auto`}>Salva modifiche</BottoneInvio>
              </div>
            </form>
            {lezione.orario_corso_id && (
              <p className="mt-4 text-xs text-slate-500">
                Per cambiare tutte le lezioni di questo orario vai su{" "}
                <Link href={`/admin/corsi/orari/${lezione.orario_corso_id}`} className="text-vasca underline">impostazioni dell&apos;orario</Link>.
              </p>
            )}
          </Card>

          <Card className={lezione.annullata ? "" : "border-red-200"}>
            <h2 className="mb-1 font-semibold">{lezione.annullata ? "Ripristina la lezione" : "Annulla la lezione"}</h2>
            <p className="mb-4 text-sm text-slate-600">
              {lezione.annullata
                ? "La lezione torna in calendario e i prenotati ricevono un avviso."
                : "Es. chiusura o manutenzione: chi è prenotato riceve subito un avviso (app e notifica)."}
            </p>
            <form action={annullaLezione} className="space-y-3">
              <input type="hidden" name="lezione_id" value={lezione.id} />
              <input type="hidden" name="annulla" value={lezione.annullata ? "no" : "si"} />
              {!lezione.annullata && (
                <input name="motivo" maxLength={200} placeholder="Motivo (facoltativo), es. Manutenzione vasca" className={campo} />
              )}
              <BottoneInvio
                className={
                  lezione.annullata
                    ? `${bottone} w-full sm:w-auto`
                    : "inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700 sm:w-auto"
                }
              >
                {lezione.annullata ? "Ripristina" : "Annulla lezione"}
              </BottoneInvio>
            </form>
          </Card>
        </div>
      )}
    </>
  );
}
