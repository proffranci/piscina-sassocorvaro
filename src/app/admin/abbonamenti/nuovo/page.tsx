import Link from "next/link";
import { Avviso, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { nomeGiorno, ora } from "@/lib/formato";
import { creaAbbonamento } from "../actions";

type Utente = { id: string; nome: string; cognome: string; email: string | null };
type Orario = { id: string; giorno_settimana: number; ora_inizio: string; corsi: { nome: string } | null };

export default async function NuovoAbbonamentoPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const params = await searchParams;

  const [utentiRes, orariRes] = await Promise.all([
    supabase.from("profili").select("id, nome, cognome, email").eq("ruolo", "utente").eq("attivo", true).order("cognome"),
    supabase
      .from("orari_corso")
      .select("id, giorno_settimana, ora_inizio, corsi(nome)")
      .eq("attivo", true)
      .order("giorno_settimana")
      .order("ora_inizio"),
  ]);
  const utenti = (utentiRes.data ?? []) as unknown as Utente[];
  const orari = (orariRes.data ?? []) as unknown as Orario[];
  const oggi = new Date().toISOString().slice(0, 10);

  return (
    <>
      <Titolo azione={<Link href="/admin/abbonamenti" className={bottoneSecondario}>← Abbonamenti</Link>}>
        Nuovo abbonamento
      </Titolo>
      <Avviso errore={parametro(params.errore)} />

      {utenti.length === 0 || orari.length === 0 ? (
        <Card className="max-w-2xl text-sm">
          {utenti.length === 0 && (
            <p>
              Prima crea almeno un cliente in <Link href="/admin/utenti/nuovo" className="text-vasca underline">Utenti</Link>.
            </p>
          )}
          {orari.length === 0 && (
            <p>
              Prima aggiungi gli orari settimanali in <Link href="/admin/corsi" className="text-vasca underline">Corsi e orari</Link>.
            </p>
          )}
        </Card>
      ) : (
        <Card className="max-w-2xl">
          <form action={creaAbbonamento} className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={etichetta} htmlFor="utente_id">Cliente</label>
              <select id="utente_id" name="utente_id" required className={campo} defaultValue="">
                <option value="" disabled>Scegli…</option>
                {utenti.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.cognome} {u.nome} {u.email ? `(${u.email})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className={etichetta} htmlFor="tipo">Tipo di abbonamento</label>
              <input id="tipo" name="tipo" required placeholder="Es. Hydrobike trimestrale" className={campo} />
            </div>
            <div>
              <label className={etichetta} htmlFor="data_inizio">Inizio</label>
              <input id="data_inizio" name="data_inizio" type="date" required defaultValue={oggi} className={campo} />
            </div>
            <div>
              <label className={etichetta} htmlFor="data_fine">Fine</label>
              <input id="data_fine" name="data_fine" type="date" required className={campo} />
            </div>

            <fieldset className="sm:col-span-2">
              <legend className={etichetta}>I 2 appuntamenti settimanali fissi</legend>
              <p className="mb-2 text-xs text-slate-500">Scegline esattamente 2, in giorni diversi.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {orari.map((o) => (
                  <label key={o.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm has-[:checked]:border-acqua has-[:checked]:bg-schiuma">
                    <input type="checkbox" name="orari" value={o.id} />
                    <span>
                      <span className="font-medium">{nomeGiorno(o.giorno_settimana)}</span> {ora(o.ora_inizio)} · {o.corsi?.nome}
                    </span>
                  </label>
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
              <button className={bottone}>Crea abbonamento</button>
            </div>
          </form>
        </Card>
      )}
    </>
  );
}
