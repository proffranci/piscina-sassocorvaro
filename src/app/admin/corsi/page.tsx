import Link from "next/link";
import { BottoneInvio } from "@/components/BottoneInvio";
import { CampiScadenza } from "@/components/CampiScadenza";
import { Avviso, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { GIORNI, descriviScadenza, ora } from "@/lib/formato";
import { aggiornaCorso, aggiungiOrari, creaCorso } from "./actions";

type Orario = {
  id: string;
  giorno_settimana: number;
  ora_inizio: string;
  durata_minuti: number;
  attivo: boolean;
  capienza: number | null;
  scadenza_modo: string | null;
};
type Corso = {
  id: string;
  nome: string;
  descrizione: string | null;
  capienza: number;
  attivo: boolean;
  giorni_abbonamento: number;
  scadenza_modo: string;
  scadenza_ora: string;
  scadenza_ore_prima: number;
  orari_corso: Orario[];
};

const GIORNI_BREVI = ["", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export default async function CorsiPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const params = await searchParams;

  const { data } = await supabase
    .from("corsi")
    .select(
      "id, nome, descrizione, capienza, attivo, giorni_abbonamento, scadenza_modo, scadenza_ora, scadenza_ore_prima, orari_corso(id, giorno_settimana, ora_inizio, durata_minuti, attivo, capienza, scadenza_modo)",
    )
    .order("nome");
  const corsi = (data ?? []) as unknown as Corso[];
  const aperto = parametro(params.corso);

  return (
    <>
      <Titolo>Corsi e orari</Titolo>
      <p className="-mt-4 mb-6 max-w-2xl text-sm text-slate-600">
        Ogni corso ha i suoi posti, la sua scadenza di conferma e i suoi orari settimanali. Dagli orari nascono le lezioni del
        calendario (4 settimane in avanti) e tra questi gli abbonati scelgono i loro giorni fissi.
      </p>
      <Avviso errore={parametro(params.errore)} ok={parametro(params.ok)} />

      {/* Salto rapido tra i corsi */}
      <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1">
        {corsi.map((c) => (
          <a key={c.id} href={`#corso-${c.id}`} className="inline-flex min-h-[40px] shrink-0 items-center rounded-full border border-slate-300 bg-white px-3 text-sm hover:bg-schiuma">
            {c.nome}
          </a>
        ))}
        <a href="#nuovo-corso" className="inline-flex min-h-[40px] shrink-0 items-center rounded-full border border-dashed border-slate-400 px-3 text-sm text-slate-600">
          + Nuovo corso
        </a>
      </nav>

      <div className="space-y-8">
        {corsi.map((corso) => {
          const perGiorno = new Map<number, Orario[]>();
          for (const o of corso.orari_corso) perGiorno.set(o.giorno_settimana, [...(perGiorno.get(o.giorno_settimana) ?? []), o]);
          const attivi = corso.orari_corso.filter((o) => o.attivo).length;

          return (
            <section key={corso.id} id={`corso-${corso.id}`} className="scroll-mt-24">
              <Card>
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-xl font-semibold">{corso.nome}</h2>
                  <p className="text-sm text-slate-600">
                    {attivi} orari attivi · {corso.capienza} posti · conferma {descriviScadenza(corso.scadenza_modo, corso.scadenza_ora, corso.scadenza_ore_prima)}
                  </p>
                </div>

                {/* ---------- Impostazioni ---------- */}
                <details className="mb-5 rounded-xl border border-slate-200 p-4" open={aperto === corso.id}>
                  <summary className="cursor-pointer font-medium">⚙️ Impostazioni del corso</summary>
                  <form action={aggiornaCorso} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <input type="hidden" name="corso_id" value={corso.id} />
                    <div>
                      <label className={etichetta} htmlFor={`cap-${corso.id}`}>Posti per lezione</label>
                      <input id={`cap-${corso.id}`} name="capienza" type="number" min={1} max={500} defaultValue={corso.capienza} className={campo} />
                    </div>
                    <div>
                      <label className={etichetta} htmlFor={`gg-${corso.id}`}>Giorni fissi nell&apos;abbonamento</label>
                      <input id={`gg-${corso.id}`} name="giorni_abbonamento" type="number" min={1} max={7} defaultValue={corso.giorni_abbonamento} className={campo} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={etichetta} htmlFor={`desc-${corso.id}`}>Descrizione (facoltativa)</label>
                      <input id={`desc-${corso.id}`} name="descrizione" defaultValue={corso.descrizione ?? ""} placeholder="Es. 5 corsie, turni da un'ora" className={campo} />
                    </div>
                    <div className="sm:col-span-2">
                      <CampiScadenza id={corso.id} modo={corso.scadenza_modo} oraFissa={corso.scadenza_ora} orePrima={corso.scadenza_ore_prima} />
                    </div>
                    <div className="sm:col-span-2">
                      <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Salva impostazioni</BottoneInvio>
                    </div>
                  </form>
                </details>

                {/* ---------- Orari per giorno ---------- */}
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Orari settimanali</h3>
                {corso.orari_corso.length === 0 ? (
                  <p className="mb-4 text-sm text-slate-500">Nessun orario ancora: aggiungili qui sotto.</p>
                ) : (
                  <div className="mb-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {[1, 2, 3, 4, 5, 6, 7]
                      .filter((g) => perGiorno.has(g))
                      .map((g) => (
                        <div key={g} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                          <span className="w-12 shrink-0 text-sm font-medium">{GIORNI_BREVI[g]}</span>
                          {[...(perGiorno.get(g) ?? [])]
                            .sort((a, b) => a.ora_inizio.localeCompare(b.ora_inizio))
                            .map((o) => (
                              <Link
                                key={o.id}
                                href={`/admin/corsi/orari/${o.id}`}
                                title={o.attivo ? "Tocca per modificare o sospendere" : "Sospeso: tocca per riattivarlo"}
                                className={`relative inline-flex min-h-[36px] items-center rounded-lg border px-2.5 text-sm tabular-nums ${
                                  o.attivo ? "border-slate-300 bg-white hover:border-acqua" : "border-dashed border-slate-300 bg-slate-50 text-slate-400 line-through"
                                }`}
                              >
                                {ora(o.ora_inizio)}
                                {(o.capienza !== null || o.scadenza_modo !== null) && (
                                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-corsia" title="Personalizzato" />
                                )}
                              </Link>
                            ))}
                        </div>
                      ))}
                  </div>
                )}

                {/* ---------- Aggiungi orari ---------- */}
                <details className="rounded-xl bg-schiuma p-4">
                  <summary className="cursor-pointer font-medium">+ Aggiungi orari</summary>
                  <form action={aggiungiOrari} className="mt-4 space-y-4">
                    <input type="hidden" name="corso_id" value={corso.id} />
                    <fieldset>
                      <legend className={etichetta}>Giorni</legend>
                      <div className="flex flex-wrap gap-2">
                        {GIORNI.slice(1).map((nome, i) => (
                          <label
                            key={nome}
                            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm has-[:checked]:border-acqua has-[:checked]:bg-acqua has-[:checked]:text-white"
                          >
                            <input type="checkbox" name="giorni" value={i + 1} className="sr-only" />
                            {GIORNI_BREVI[i + 1]}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div>
                        <label className={etichetta} htmlFor={`dalle-${corso.id}`}>Dalle</label>
                        <input id={`dalle-${corso.id}`} name="dalle" type="time" required className={campo} />
                      </div>
                      <div>
                        <label className={etichetta} htmlFor={`alle-${corso.id}`}>Alle (facoltativo)</label>
                        <input id={`alle-${corso.id}`} name="alle" type="time" className={campo} />
                      </div>
                      <div>
                        <label className={etichetta} htmlFor={`durata-${corso.id}`}>Durata (min)</label>
                        <input id={`durata-${corso.id}`} name="durata_minuti" type="number" min={15} max={240} step={5} defaultValue={corso.nome.toLowerCase().includes("nuoto") ? 60 : 45} className={campo} />
                      </div>
                      <div>
                        <label className={etichetta} htmlFor={`ogni-${corso.id}`}>Ogni (min)</label>
                        <input id={`ogni-${corso.id}`} name="ogni" type="number" min={15} max={720} step={5} placeholder="= durata" className={campo} />
                      </div>
                    </div>
                    <p className="text-xs text-slate-500">
                      Solo &quot;Dalle&quot;: un orario. Con &quot;Alle&quot;: tutti i turni della fascia (es. dalle 8:00 alle 21:00, durata
                      60 → 8, 9, … 20). Gli orari che esistono già vengono saltati.
                    </p>
                    <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Aggiungi</BottoneInvio>
                  </form>
                </details>

                <p className="mt-3 text-xs text-slate-500">
                  <span className="mr-1 inline-block h-2.5 w-2.5 rounded-full bg-corsia align-middle" /> orario con posti o scadenza
                  personalizzati · barrato = sospeso
                </p>
              </Card>
            </section>
          );
        })}

        {/* ---------- Nuovo corso ---------- */}
        <section id="nuovo-corso" className="scroll-mt-24">
          <Card>
            <h2 className="mb-1 font-semibold">Nuovo corso</h2>
            <p className="mb-4 text-sm text-slate-600">Es. Acquagym, Nuoto bambini… Dopo averlo creato imposti scadenza e orari.</p>
            <form action={creaCorso} className="grid gap-3 sm:grid-cols-[1fr_160px_auto] sm:items-end">
              <div>
                <label className={etichetta} htmlFor="nuovo-nome">Nome</label>
                <input id="nuovo-nome" name="nome" required className={campo} />
              </div>
              <div>
                <label className={etichetta} htmlFor="nuovo-cap">Posti</label>
                <input id="nuovo-cap" name="capienza" type="number" min={1} max={500} required defaultValue={20} className={campo} />
              </div>
              <BottoneInvio className={bottoneSecondario}>Crea corso</BottoneInvio>
            </form>
          </Card>
        </section>
      </div>
    </>
  );
}

