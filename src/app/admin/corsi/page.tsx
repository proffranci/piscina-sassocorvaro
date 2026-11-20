import Link from "next/link";
import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, campo, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { descriviScadenza, esempioScadenza, euro, ora } from "@/lib/formato";
import { aggiornaCorso, aggiungiOrari, attivaCorso, creaCorso, eliminaCorso } from "./actions";
import { CORSO_NUOVO, CampiCorso, CampiTurni, SELECT_IMPOSTAZIONI, type ImpostazioniCorso } from "./CampiCorso";

type Orario = {
  id: string;
  giorno_settimana: number;
  ora_inizio: string;
  durata_minuti: number;
  attivo: boolean;
  capienza: number | null;
  corsie: number | null;
  scadenza_modo: string | null;
};
type Corso = ImpostazioniCorso & {
  id: string;
  attivo: boolean;
  orari_corso: Orario[];
};

const GIORNI_BREVI = ["", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export default async function CorsiPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo } = await richiediStaff();
  const params = await searchParams;
  const admin = profilo.ruolo === "admin";

  const { data } = await supabase
    .from("corsi")
    .select(`id, attivo, ${SELECT_IMPOSTAZIONI}, orari_corso(id, giorno_settimana, ora_inizio, durata_minuti, attivo, capienza, corsie, scadenza_modo)`)
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
          <a
            key={c.id}
            href={`#corso-${c.id}`}
            className={`inline-flex min-h-[40px] shrink-0 items-center rounded-full border border-slate-300 bg-white px-3 text-sm hover:bg-schiuma ${c.attivo ? "" : "text-slate-400 line-through"}`}
          >
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
                  <h2 className="flex items-center gap-2 text-xl font-semibold">
                    {corso.nome}
                    {!corso.attivo && <Badge>sospeso</Badge>}
                  </h2>
                  <p className="text-sm text-slate-600">
                    {attivi} orari attivi ·{" "}
                    {corso.usa_corsie ? `fino a ${corso.corsie_max * corso.persone_per_corsia} posti` : `${corso.capienza} posti`}
                    {corso.abbonabile &&
                      ` · conferma ${descriviScadenza(corso.scadenza_modo, corso.scadenza_ora, corso.scadenza_ore_prima, corso.scadenza_giorni_prima)}`}
                  </p>
                </div>
                <p className="-mt-2 mb-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                  <span>
                    {corso.abbonabile
                      ? `${corso.giorni_abbonamento} ${corso.giorni_abbonamento === 1 ? "giorno fisso" : "giorni fissi"} per abbonato`
                      : "niente abbonamenti: ingressi singoli e carnet"}
                  </span>
                  {corso.usa_corsie && <span>{corso.corsie_max} corsie × {corso.persone_per_corsia} persone</span>}
                  <span>disdetta {corso.disdetta_ore_prima > 0 ? `fino a ${corso.disdetta_ore_prima} h prima` : "fino all'inizio"}</span>
                  <span>
                    ingressi dall&apos;app: {corso.ingressi_clienti ? `${corso.ingressi_da === "subito" ? "subito" : "dopo l'orario limite"}, ${corso.prenotabile_giorni} gg prima` : "no"}
                  </span>
                  {corso.prezzo_ingresso !== null && <span>ingresso {euro(corso.prezzo_ingresso)}</span>}
                  {corso.prezzo_abbonamento !== null && <span>abbonamento {euro(corso.prezzo_abbonamento)}</span>}
                </p>

                {(() => {
                  const primo = corso.orari_corso.filter((o) => o.attivo).sort((a, b) => a.giorno_settimana - b.giorno_settimana || a.ora_inizio.localeCompare(b.ora_inizio))[0];
                  return primo && corso.abbonabile ? (
                    <p className="mb-4 rounded-xl bg-schiuma px-3 py-2 text-sm text-slate-700">
                      🕔{" "}
                      {esempioScadenza(corso.scadenza_modo, corso.scadenza_ora, corso.scadenza_ore_prima, corso.scadenza_giorni_prima, primo.giorno_settimana, primo.ora_inizio)}
                    </p>
                  ) : null;
                })()}

                {/* ---------- Impostazioni ---------- */}
                <details className="mb-5 rounded-xl border border-slate-200 p-4" open={aperto === corso.id}>
                  <summary className="cursor-pointer font-medium">⚙️ Impostazioni del corso</summary>
                  <form action={aggiornaCorso} className="mt-4 grid gap-4 sm:grid-cols-2">
                    <input type="hidden" name="corso_id" value={corso.id} />
                    <CampiCorso id={corso.id} c={corso} />
                    <div className="sm:col-span-2">
                      <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Salva impostazioni</BottoneInvio>
                    </div>
                  </form>

                  {/* Sospendi / elimina */}
                  <div className="mt-6 grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2">
                    <form action={attivaCorso} className="rounded-xl bg-slate-50 p-4">
                      <input type="hidden" name="corso_id" value={corso.id} />
                      <input type="hidden" name="attivo" value={corso.attivo ? "no" : "si"} />
                      <p className="mb-1 font-medium">{corso.attivo ? "Sospendi il corso" : "Riattiva il corso"}</p>
                      <p className="mb-3 text-xs text-slate-600">
                        {corso.attivo
                          ? "Le lezioni future vengono annullate e chi è prenotato riceve un avviso. Orari e abbonamenti restano."
                          : "Le lezioni annullate per la sospensione tornano in calendario e i prenotati ricevono un avviso."}
                      </p>
                      <BottoneInvio className={`${corso.attivo ? bottoneSecondario : bottone} w-full sm:w-auto`}>
                        {corso.attivo ? "Sospendi" : "Riattiva"}
                      </BottoneInvio>
                    </form>
                    {admin && (
                      <form action={eliminaCorso} className="rounded-xl border border-red-200 bg-red-50 p-4">
                        <input type="hidden" name="corso_id" value={corso.id} />
                        <p className="mb-1 font-medium text-red-800">Elimina il corso</p>
                        <p className="mb-3 text-xs text-red-800">
                          Cancella orari e lezioni (anche lo storico delle presenze). Non si può annullare. Serve che non ci siano
                          abbonamenti ancora validi.
                        </p>
                        <label className="mb-1 block text-xs text-red-800" htmlFor={`conf-${corso.id}`}>
                          Per conferma scrivi <strong>{corso.nome}</strong>
                        </label>
                        <input id={`conf-${corso.id}`} name="conferma" required autoComplete="off" className={campo} />
                        <BottoneInvio className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800 sm:w-auto sm:min-h-0 sm:py-2">
                          Elimina definitivamente
                        </BottoneInvio>
                      </form>
                    )}
                  </div>
                </details>

                {/* ---------- Settimana tipo: una griglia giorni × ore ---------- */}
                <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Settimana tipo</h3>
                {corso.orari_corso.length === 0 ? (
                  <p className="mb-4 text-sm text-slate-500">Nessun orario ancora: aggiungili qui sotto.</p>
                ) : (
                  <div className="mb-5 overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full min-w-[560px] border-collapse text-sm">
                      <thead>
                        <tr className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                          <th className="w-16 px-2 py-2 text-left font-medium">Ora</th>
                          {GIORNI_BREVI.slice(1).map((g) => (
                            <th key={g} className="px-1 py-2 font-medium">{g}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[...new Set(corso.orari_corso.map((o) => o.ora_inizio))].sort().map((oraRiga) => (
                          <tr key={oraRiga} className="border-t border-slate-100">
                            <td className="px-2 py-1 tabular-nums text-slate-500">{ora(oraRiga)}</td>
                            {[1, 2, 3, 4, 5, 6, 7].map((g) => {
                              const o = (perGiorno.get(g) ?? []).find((x) => x.ora_inizio === oraRiga);
                              if (!o) return <td key={g} className="px-1 py-1 text-center text-slate-200">·</td>;
                              const etichettaCella = corso.usa_corsie
                                ? `${o.corsie ?? corso.corsie_max} c`
                                : `${o.capienza ?? corso.capienza} p`;
                              return (
                                <td key={g} className="px-1 py-1 text-center">
                                  <Link
                                    href={`/admin/corsi/orari/${o.id}`}
                                    title={`${o.durata_minuti} min · tocca per modificare, spostare o sospendere`}
                                    className={`relative inline-flex min-h-[34px] w-full items-center justify-center rounded-lg border px-1 text-xs tabular-nums ${
                                      o.attivo
                                        ? "border-slate-300 bg-white hover:border-acqua"
                                        : "border-dashed border-slate-300 bg-slate-50 text-slate-400 line-through"
                                    }`}
                                  >
                                    {etichettaCella}
                                    {(o.capienza !== null || o.corsie !== null || o.scadenza_modo !== null) && (
                                      <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-corsia" />
                                    )}
                                  </Link>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* ---------- Aggiungi orari ---------- */}
                <details className="rounded-xl bg-schiuma p-4">
                  <summary className="cursor-pointer font-medium">+ Aggiungi orari</summary>
                  <form action={aggiungiOrari} className="mt-4 space-y-4">
                    <input type="hidden" name="corso_id" value={corso.id} />
                    <CampiTurni id={corso.id} durata={corso.durata_predefinita} />
                    <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Aggiungi</BottoneInvio>
                  </form>
                </details>

                <p className="mt-3 text-xs text-slate-500">
                  {corso.usa_corsie ? "c = corsie aperte" : "p = posti"} · <span className="mx-1 inline-block h-2.5 w-2.5 rounded-full bg-corsia align-middle" />
                  personalizzato · barrato = sospeso · tocca una casella per cambiare giorno, ora, durata o {corso.usa_corsie ? "corsie" : "posti"}
                </p>
              </Card>
            </section>
          );
        })}

        {/* ---------- Nuovo corso ---------- */}
        <section id="nuovo-corso" className="scroll-mt-24">
          <Card>
            <details open={corsi.length === 0}>
              <summary className="cursor-pointer text-lg font-semibold">+ Nuovo corso</summary>
              <p className="mb-4 mt-1 text-sm text-slate-600">
                Es. Acquagym, Nuoto bambini… Imposta subito tutto: posti, orario limite, regole per gli ingressi, prezzi e, se vuoi, i
                primi orari. Potrai cambiare ogni cosa anche dopo.
              </p>
              <form action={creaCorso} className="grid gap-4 sm:grid-cols-2">
                <CampiCorso id="nuovo" c={CORSO_NUOVO} />
                <div className="rounded-xl bg-schiuma p-4 sm:col-span-2">
                  <p className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Primi orari (facoltativi)</p>
                  <CampiTurni id="nuovo" durata={CORSO_NUOVO.durata_predefinita} obbligatori={false} />
                </div>
                <div className="sm:col-span-2">
                  <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Crea corso</BottoneInvio>
                </div>
              </form>
            </details>
          </Card>
        </section>
      </div>
    </>
  );
}

