import Link from "next/link";
import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { ora } from "@/lib/formato";
import { creaAbbonamento } from "../actions";

type Utente = { id: string; nome: string; cognome: string; nome_utente: string | null };
type Corso = { id: string; nome: string; giorni_abbonamento: number };
type Orario = { id: string; giorno_settimana: number; ora_inizio: string };

const GIORNI_BREVI = ["", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato", "Domenica"];

export default async function NuovoAbbonamentoPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const params = await searchParams;

  const [utentiRes, corsiRes] = await Promise.all([
    supabase.from("profili").select("id, nome, cognome, nome_utente").eq("ruolo", "utente").eq("attivo", true).order("cognome"),
    supabase.from("corsi").select("id, nome, giorni_abbonamento").eq("attivo", true).order("nome"),
  ]);
  const utenti = (utentiRes.data ?? []) as unknown as Utente[];
  const corsi = (corsiRes.data ?? []) as unknown as Corso[];
  const corso = corsi.find((c) => c.id === parametro(params.corso)) ?? (corsi.length === 1 ? corsi[0] : null);

  const { data: orariData } = corso
    ? await supabase.from("orari_corso").select("id, giorno_settimana, ora_inizio").eq("corso_id", corso.id).eq("attivo", true).order("ora_inizio")
    : { data: [] };
  const orari = (orariData ?? []) as unknown as Orario[];
  const perGiorno = new Map<number, Orario[]>();
  for (const o of orari) perGiorno.set(o.giorno_settimana, [...(perGiorno.get(o.giorno_settimana) ?? []), o]);

  const oggi = new Date().toISOString().slice(0, 10);
  const fra3mesi = new Date(Date.now() + 91 * 86_400_000).toISOString().slice(0, 10);

  return (
    <>
      <Titolo azione={<Link href="/admin/abbonamenti" className={bottoneSecondario}>← Abbonamenti</Link>}>Nuovo abbonamento</Titolo>
      <Avviso errore={parametro(params.errore)} />

      {/* 1. Scegli il corso */}
      <Card className="mb-6 max-w-3xl">
        <p className={etichetta}>1. Corso</p>
        <div className="flex flex-wrap gap-2">
          {corsi.map((c) => (
            <Link
              key={c.id}
              href={`/admin/abbonamenti/nuovo?corso=${c.id}`}
              className={`inline-flex min-h-[44px] items-center rounded-xl border px-4 text-sm font-medium ${
                c.id === corso?.id ? "border-acqua bg-acqua text-white" : "border-slate-300 bg-white hover:bg-schiuma"
              }`}
            >
              {c.nome}
              <span className="ml-2 text-xs opacity-80">{c.giorni_abbonamento} {c.giorni_abbonamento === 1 ? "giorno" : "giorni"} fissi</span>
            </Link>
          ))}
        </div>
      </Card>

      {corso && (
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
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" name="pagato" />
                Già pagato
              </label>
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
