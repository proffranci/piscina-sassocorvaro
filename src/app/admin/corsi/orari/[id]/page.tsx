import Link from "next/link";
import { notFound } from "next/navigation";
import { BottoneInvio } from "@/components/BottoneInvio";
import { CampiScadenza } from "@/components/CampiScadenza";
import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { descriviScadenza, esempioScadenza, nomeGiorno, ora } from "@/lib/formato";
import { aggiornaOrario, eliminaOrario, sospendiOrario } from "../../actions";

type Orario = {
  id: string;
  corso_id: string;
  giorno_settimana: number;
  ora_inizio: string;
  durata_minuti: number;
  attivo: boolean;
  capienza: number | null;
  corsie: number | null;
  scadenza_modo: string | null;
  scadenza_ora: string | null;
  scadenza_ore_prima: number | null;
  scadenza_giorni_prima: number | null;
  corsi: {
    nome: string;
    capienza: number;
    scadenza_modo: string;
    scadenza_ora: string;
    scadenza_ore_prima: number;
    scadenza_giorni_prima: number;
    usa_corsie: boolean;
    corsie_max: number;
    persone_per_corsia: number;
  } | null;
};
type Abbonato = { abbonamenti: { id: string; tipo: string; data_fine: string; profili: { nome: string; cognome: string } | null } | null };

export default async function OrarioPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const { id } = await params;
  const sp = await searchParams;
  const oggi = new Date().toISOString().slice(0, 10);

  const [orarioRes, abbRes] = await Promise.all([
    supabase
      .from("orari_corso")
      .select(
        "id, corso_id, giorno_settimana, ora_inizio, durata_minuti, attivo, capienza, corsie, scadenza_modo, scadenza_ora, scadenza_ore_prima, scadenza_giorni_prima, corsi(nome, capienza, scadenza_modo, scadenza_ora, scadenza_ore_prima, scadenza_giorni_prima, usa_corsie, corsie_max, persone_per_corsia)",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("abbonamenti_orari").select("abbonamenti(id, tipo, data_fine, profili(nome, cognome))").eq("orario_corso_id", id),
  ]);
  const o = orarioRes.data as unknown as Orario | null;
  if (!o || !o.corsi) notFound();
  const abbonati = ((abbRes.data ?? []) as unknown as Abbonato[])
    .map((x) => x.abbonamenti)
    .filter((a): a is NonNullable<typeof a> => !!a && a.data_fine >= oggi);

  const c = o.corsi;
  const titolo = `${c.nome} · ${nomeGiorno(o.giorno_settimana)} ${ora(o.ora_inizio)}`;

  return (
    <>
      <Titolo azione={<Link href={`/admin/corsi?corso=${o.corso_id}#corso-${o.corso_id}`} className={bottoneSecondario}>← Corsi e orari</Link>}>
        {titolo}
      </Titolo>
      <div className="-mt-4 mb-5 flex flex-wrap gap-2">
        <Badge tono={o.attivo ? "ok" : "neutro"}>{o.attivo ? "attivo" : "sospeso"}</Badge>
        {abbonati.length > 0 && <Badge tono="attenzione">{abbonati.length} abbonati con questo giorno fisso</Badge>}
      </div>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <Card>
          <h2 className="mb-4 font-semibold">Modifica questo orario</h2>
          <form action={aggiornaOrario} className="space-y-4">
            <input type="hidden" name="id" value={o.id} />
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <label className={etichetta} htmlFor="giorno">Giorno</label>
                <select id="giorno" name="giorno_settimana" defaultValue={o.giorno_settimana} className={campo}>
                  {[1, 2, 3, 4, 5, 6, 7].map((g) => (
                    <option key={g} value={g}>
                      {nomeGiorno(g)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={etichetta} htmlFor="ora_inizio">Ora di inizio</label>
                <input id="ora_inizio" name="ora_inizio" type="time" required defaultValue={o.ora_inizio.slice(0, 5)} className={campo} />
              </div>
              <div>
                <label className={etichetta} htmlFor="durata">Durata (minuti)</label>
                <input id="durata" name="durata_minuti" type="number" min={15} max={240} step={5} defaultValue={o.durata_minuti} className={campo} />
              </div>
              {c.usa_corsie ? (
                <div className="sm:col-span-3">
                  <label className={etichetta} htmlFor="corsie">Corsie aperte</label>
                  <select id="corsie" name="corsie" defaultValue={o.corsie ?? ""} className={campo}>
                    <option value="">Tutte ({c.corsie_max} corsie = {c.corsie_max * c.persone_per_corsia} posti)</option>
                    {Array.from({ length: c.corsie_max }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n} {n === 1 ? "corsia" : "corsie"} = {n * c.persone_per_corsia} posti
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    {c.persone_per_corsia} persone per corsia. Per un solo giorno (es. gara, corso) cambiale dalla lezione.
                  </p>
                </div>
              ) : (
                <div className="sm:col-span-3">
                  <label className={etichetta} htmlFor="capienza">Posti</label>
                  <input id="capienza" name="capienza" type="number" min={1} max={500} defaultValue={o.capienza ?? ""} placeholder={`come il corso (${c.capienza})`} className={campo} />
                </div>
              )}
            </div>
            <p className="rounded-lg bg-schiuma px-3 py-2 text-xs text-slate-600">
              Cambiando giorno o ora, le lezioni future si rifanno al nuovo orario: chi era prenotato riceve un avviso e gli abbonati
              con questo giorno fisso lo seguono.
            </p>
            <CampiScadenza
              id={o.id}
              conEreditata
              modo={o.scadenza_modo}
              oraFissa={o.scadenza_ora ?? c.scadenza_ora}
              orePrima={o.scadenza_ore_prima ?? c.scadenza_ore_prima}
              giorniPrima={o.scadenza_giorni_prima ?? c.scadenza_giorni_prima}
            />
            <p className="text-xs text-slate-500">
              Il corso conferma {descriviScadenza(c.scadenza_modo, c.scadenza_ora, c.scadenza_ore_prima, c.scadenza_giorni_prima)}. Scegli &quot;Come il corso&quot; per
              non personalizzare.
              <br />
              <strong>
                {esempioScadenza(
                  o.scadenza_modo ?? c.scadenza_modo,
                  o.scadenza_ora ?? c.scadenza_ora,
                  o.scadenza_ore_prima ?? c.scadenza_ore_prima,
                  o.scadenza_giorni_prima ?? c.scadenza_giorni_prima,
                  o.giorno_settimana,
                  o.ora_inizio,
                )}
              </strong>
            </p>
            <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Salva</BottoneInvio>
          </form>
        </Card>

        <div className="space-y-6">
          <Card>
            <h2 className="mb-1 font-semibold">{o.attivo ? "Sospendi orario" : "Riattiva orario"}</h2>
            <p className="mb-4 text-sm text-slate-600">
              {o.attivo
                ? "Le lezioni future di questo orario vengono annullate e chi è prenotato riceve un avviso."
                : "Le lezioni tornano in calendario e i prenotati ricevono un avviso."}
            </p>
            <form action={sospendiOrario}>
              <input type="hidden" name="id" value={o.id} />
              <input type="hidden" name="attivo" value={o.attivo ? "no" : "si"} />
              <input type="hidden" name="torna" value="orario" />
              <BottoneInvio className={`${o.attivo ? bottoneSecondario : bottone} w-full`}>
                {o.attivo ? "Sospendi" : "Riattiva"}
              </BottoneInvio>
            </form>
          </Card>

          <Card className="border-red-200">
            <h2 className="mb-1 font-semibold text-red-800">Elimina orario</h2>
            <p className="mb-3 text-sm text-slate-600">
              {abbonati.length > 0
                ? "Prima sposta gli abbonati che hanno questo giorno fisso (qui sotto)."
                : "Le lezioni future vengono annullate (con avviso ai prenotati) e l'orario sparisce. Le lezioni passate restano nello storico."}
            </p>
            {abbonati.length === 0 && (
              <form action={eliminaOrario} className="space-y-3">
                <input type="hidden" name="id" value={o.id} />
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" name="conferma" value="si" required className="mt-1" />
                  Sì, voglio eliminare questo orario
                </label>
                <BottoneInvio className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white hover:bg-red-800">
                  Elimina orario
                </BottoneInvio>
              </form>
            )}
          </Card>

          <Card>
            <h2 className="mb-2 font-semibold">Abbonati con questo giorno fisso</h2>
            {abbonati.length === 0 ? (
              <p className="text-sm text-slate-500">Nessuno.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {abbonati.map((a) => (
                  <li key={a.id}>
                    <Link href={`/admin/abbonamenti/${a.id}`} className="block py-2 text-vasca underline">
                      {a.profili ? `${a.profili.cognome} ${a.profili.nome}` : "—"} · {a.tipo}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {abbonati.length > 0 && !o.attivo && (
              <p className="mt-3 text-xs text-amber-800">Orario sospeso: apri ogni abbonamento e cambia il loro giorno fisso.</p>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
