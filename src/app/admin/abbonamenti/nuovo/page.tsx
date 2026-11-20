import Link from "next/link";
import { BottoneInvio } from "@/components/BottoneInvio";
import { CampiPagamento } from "@/components/CampiPagamento";
import { Avviso, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { oggiItalia, ora } from "@/lib/formato";
import { creaAbbonamento, creaCarnet } from "../actions";

type Utente = { id: string; nome: string; cognome: string; nome_utente: string | null };
type Corso = { id: string; nome: string; giorni_abbonamento: number; prezzo_abbonamento: number | null; prezzo_ingresso: number | null; abbonabile: boolean };
type Orario = { id: string; giorno_settimana: number; ora_inizio: string };

const GIORNI_BREVI = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

export default async function NuovoAbbonamentoPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const params = await searchParams;

  const [utentiRes, corsiRes] = await Promise.all([
    supabase.from("profili").select("id, nome, cognome, nome_utente").eq("ruolo", "utente").eq("attivo", true).order("cognome"),
    supabase.from("corsi").select("id, nome, giorni_abbonamento, prezzo_abbonamento, prezzo_ingresso, abbonabile").eq("attivo", true).order("nome"),
  ]);
  const utenti = (utentiRes.data ?? []) as unknown as Utente[];
  const carnet = parametro(params.tipo) === "carnet";
  // Abbonamento a giorni fissi: solo i corsi che lo prevedono. Carnet: tutti.
  const corsi = ((corsiRes.data ?? []) as unknown as Corso[]).filter((c) => carnet || c.abbonabile);
  const corso = corsi.find((c) => c.id === parametro(params.corso)) ?? (corsi.length === 1 ? corsi[0] : null);
  const qs = (corsoId: string) => `/admin/abbonamenti/nuovo?${carnet ? "tipo=carnet&" : ""}corso=${corsoId}`;

  const { data: orariData } = corso && !carnet
    ? await supabase.from("orari_corso").select("id, giorno_settimana, ora_inizio").eq("corso_id", corso.id).eq("attivo", true).order("ora_inizio")
    : { data: [] };
  const orari = (orariData ?? []) as unknown as Orario[];
  const perGiorno = new Map<number, Orario[]>();
  for (const o of orari) perGiorno.set(o.giorno_settimana, [...(perGiorno.get(o.giorno_settimana) ?? []), o]);

  const oggi = new Date().toISOString().slice(0, 10);
  const fra3mesi = new Date(Date.now() + 91 * 86_400_000).toISOString().slice(0, 10);
  const fra6mesi = new Date(Date.now() + 182 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <Titolo azione={<Link href="/admin/abbonamenti" className={bottoneSecondario}>← Abbonamenti</Link>}>
        {carnet ? "Nuovo carnet" : "Nuovo abbonamento"}
      </Titolo>
      <Avviso errore={parametro(params.errore)} />

      {/* Che cosa compra */}
      <div className="mb-4 grid max-w-3xl grid-cols-2 gap-2">
        <Link
          href="/admin/abbonamenti/nuovo"
          className={`rounded-xl border p-3 text-sm ${!carnet ? "border-acqua bg-acqua text-white" : "border-slate-300 bg-white"}`}
        >
          <strong className="block">📅 Abbonamento</strong>
          giorni fissi ogni settimana (es. Hydrobike)
        </Link>
        <Link
          href="/admin/abbonamenti/nuovo?tipo=carnet"
          className={`rounded-xl border p-3 text-sm ${carnet ? "border-acqua bg-acqua text-white" : "border-slate-300 bg-white"}`}
        >
          <strong className="block">🎟️ Carnet</strong>
          un numero di ingressi da usare quando vuole (es. nuoto libero)
        </Link>
      </div>

      {/* 1. Scegli il corso */}
      <Card className="mb-6 max-w-3xl">
        <p className={etichetta}>1. Corso</p>
        <div className="flex flex-wrap gap-2">
          {corsi.map((c) => (
            <Link
              key={c.id}
              href={qs(c.id)}
              className={`inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium ${
                c.id === corso?.id ? "border-acqua bg-acqua text-white" : "border-slate-300 bg-white hover:bg-schiuma"
              }`}
            >
              {c.nome}
              {!carnet && (
                <span className="ml-2 text-xs opacity-80">{c.giorni_abbonamento} {c.giorni_abbonamento === 1 ? "giorno" : "giorni"} fissi</span>
              )}
            </Link>
          ))}
        </div>
      </Card>

      {corso && carnet && (
        <Card className="max-w-3xl">
          <form action={creaCarnet} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="corso_id" value={corso.id} />
            <div className="sm:col-span-2">
              <label className={etichetta} htmlFor="utente_id_c">2. Cliente</label>
              <select id="utente_id_c" name="utente_id" required className={campo} defaultValue="">
                <option value="" disabled>
                  Scegli…
                </option>
                {utenti.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.cognome} {u.nome} {u.nome_utente ? `(@${u.nome_utente})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={etichetta} htmlFor="ingressi_totali">Numero di ingressi</label>
              <input id="ingressi_totali" name="ingressi_totali" type="number" min={1} max={200} required defaultValue={10} className={campo} />
            </div>
            <div>
              <label className={etichetta} htmlFor="tipo_c">Nome</label>
              <input id="tipo_c" name="tipo" required defaultValue={`Carnet ${corso.nome}`} className={campo} />
            </div>
            <div>
              <label className={etichetta} htmlFor="data_inizio_c">Valido dal</label>
              <input id="data_inizio_c" name="data_inizio" type="date" required defaultValue={oggi} className={campo} />
            </div>
            <div>
              <label className={etichetta} htmlFor="data_fine_c">al</label>
              <input id="data_fine_c" name="data_fine" type="date" required defaultValue={fra6mesi} className={campo} />
            </div>
            <div>
              <label className={etichetta} htmlFor="prezzo_c">Prezzo (€)</label>
              <input
                id="prezzo_c"
                name="prezzo"
                required
                inputMode="decimal"
                defaultValue={corso.prezzo_ingresso ? String(corso.prezzo_ingresso * 10).replace(".", ",") : ""}
                placeholder="Es. 60,00"
                className={campo}
              />
            </div>
            <div>
              <label className={etichetta} htmlFor="pagare_entro_c">Da pagare entro</label>
              <input id="pagare_entro_c" name="pagare_entro" type="date" defaultValue={oggi} className={campo} />
            </div>
            <div className="rounded-xl bg-schiuma p-4 sm:col-span-2">
              <p className="mb-1 text-sm font-semibold">Pagamento</p>
              <p className="mb-3 text-xs text-slate-500">Se paga adesso compila l&apos;importo: si apre la ricevuta. Lascia vuoto se pagherà dopo.</p>
              <CampiPagamento id="carnet" oggi={oggiItalia()} obbligatorio={false} />
            </div>
            <p className="text-xs text-slate-500 sm:col-span-2">
              All&apos;ingresso, scegliendo &quot;Ingresso singolo&quot;, la reception scala un ingresso dal carnet. Vale solo per {corso.nome}.
            </p>
            <div className="sm:col-span-2">
              <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Crea carnet</BottoneInvio>
            </div>
          </form>
        </Card>
      )}

      {corso && !carnet && (
        <Card className="max-w-3xl">
          {utenti.length === 0 ? (
            <p className="text-sm">
              Prima crea almeno un cliente in <Link href="/admin/utenti/nuovo" className="text-vasca underline">Utenti</Link>.
            </p>
          ) : orari.length === 0 ? (
            <p className="text-sm">
              {corso.nome} non ha orari attivi: aggiungili in <Link href="/admin/corsi" className="text-vasca underline">Corsi e orari</Link>.
            </p>
          ) : (
            <form action={creaAbbonamento} className="grid gap-4 sm:grid-cols-2">
              <input type="hidden" name="corso_id" value={corso.id} />
              <div className="sm:col-span-2">
                <label className={etichetta} htmlFor="utente_id">2. Cliente</label>
                <select id="utente_id" name="utente_id" required className={campo} defaultValue="">
                  <option value="" disabled>
                    Scegli…
                  </option>
                  {utenti.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.cognome} {u.nome} {u.nome_utente ? `(@${u.nome_utente})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="sm:col-span-2">
                <label className={etichetta} htmlFor="tipo">Tipo di abbonamento</label>
                <input id="tipo" name="tipo" required defaultValue={`${corso.nome} trimestrale`} className={campo} />
              </div>
              <div>
                <label className={etichetta} htmlFor="data_inizio">Inizio</label>
                <input id="data_inizio" name="data_inizio" type="date" required defaultValue={oggi} className={campo} />
              </div>
              <div>
                <label className={etichetta} htmlFor="data_fine">Fine</label>
                <input id="data_fine" name="data_fine" type="date" required defaultValue={fra3mesi} className={campo} />
              </div>

              <fieldset className="sm:col-span-2">
                <legend className={etichetta}>
                  3. {corso.giorni_abbonamento === 1 ? "L'orario fisso" : `I ${corso.giorni_abbonamento} orari fissi`} settimanali
                </legend>
                <p className="mb-3 text-xs text-slate-500">
                  Scegline {corso.giorni_abbonamento === 1 ? "uno" : `esattamente ${corso.giorni_abbonamento}`}, al massimo uno per giorno.
                </p>
                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {[1, 2, 3, 4, 5, 6, 7]
                    .filter((g) => perGiorno.has(g))
                    .map((g) => (
                      <div key={g} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                        <span className="w-24 shrink-0 text-sm font-medium">{GIORNI_BREVI[g]}</span>
                        {(perGiorno.get(g) ?? []).map((o) => (
                          <label
                            key={o.id}
                            className="inline-flex min-h-[40px] cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-3 text-sm tabular-nums has-[:checked]:border-acqua has-[:checked]:bg-acqua has-[:checked]:text-white"
                          >
                            <input type="checkbox" name="orari" value={o.id} className="sr-only" />
                            {ora(o.ora_inizio)}
                          </label>
                        ))}
                      </div>
                    ))}
                </div>
              </fieldset>

              <div className="sm:col-span-2">
                <label className={etichetta} htmlFor="note">Note (facoltative)</label>
                <textarea id="note" name="note" rows={2} className={campo} />
              </div>
              <div>
                <label className={etichetta} htmlFor="prezzo">Prezzo (€)</label>
                <input
                  id="prezzo"
                  name="prezzo"
                  required
                  inputMode="decimal"
                  defaultValue={corso.prezzo_abbonamento !== null ? String(corso.prezzo_abbonamento).replace(".", ",") : ""}
                  placeholder="Es. 120,00"
                  className={campo}
                />
              </div>
              <div>
                <label className={etichetta} htmlFor="pagare_entro">Da pagare entro</label>
                <input id="pagare_entro" name="pagare_entro" type="date" defaultValue={oggi} className={campo} />
                <p className="mt-1 text-xs text-slate-500">L&apos;avviso ⚠️ compare da una settimana prima.</p>
              </div>
              <div className="rounded-xl bg-schiuma p-4 sm:col-span-2">
                <p className="mb-1 text-sm font-semibold">4. Pagamento</p>
                <p className="mb-3 text-xs text-slate-500">
                  Se paga adesso compila l&apos;importo: si apre subito la ricevuta da stampare. Lascia vuoto se pagherà dopo.
                </p>
                <CampiPagamento id="nuovo" oggi={oggiItalia()} obbligatorio={false} />
              </div>
              <div className="sm:col-span-2">
                <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Crea abbonamento</BottoneInvio>
              </div>
            </form>
          )}
        </Card>
      )}
    </>
  );
}
