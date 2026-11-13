import Link from "next/link";
import { notFound } from "next/navigation";
import { BottoneInvio } from "@/components/BottoneInvio";
import { CampiScadenza } from "@/components/CampiScadenza";
import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { descriviScadenza, nomeGiorno, ora } from "@/lib/formato";
import { aggiornaOrario, sospendiOrario } from "../../actions";

type Orario = {
  id: string;
  corso_id: string;
  giorno_settimana: number;
  ora_inizio: string;
  durata_minuti: number;
  attivo: boolean;
  capienza: number | null;
  scadenza_modo: string | null;
  scadenza_ora: string | null;
  scadenza_ore_prima: number | null;
  corsi: { nome: string; capienza: number; scadenza_modo: string; scadenza_ora: string; scadenza_ore_prima: number } | null;
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
        "id, corso_id, giorno_settimana, ora_inizio, durata_minuti, attivo, capienza, scadenza_modo, scadenza_ora, scadenza_ore_prima, corsi(nome, capienza, scadenza_modo, scadenza_ora, scadenza_ore_prima)",
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
          <h2 className="mb-4 font-semibold">Personalizza questo orario</h2>
          <form action={aggiornaOrario} className="space-y-4">
            <input type="hidden" name="id" value={o.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={etichetta} htmlFor="durata">Durata (minuti)</label>
                <input id="durata" name="durata_minuti" type="number" min={15} max={240} step={5} defaultValue={o.durata_minuti} className={campo} />
              </div>
              <div>
                <label className={etichetta} htmlFor="capienza">Posti</label>
                <input id="capienza" name="capienza" type="number" min={1} max={500} defaultValue={o.capienza ?? ""} placeholder={`come il corso (${c.capienza})`} className={campo} />
              </div>
            </div>
            <CampiScadenza id={o.id} conEreditata modo={o.scadenza_modo} oraFissa={o.scadenza_ora ?? c.scadenza_ora} orePrima={o.scadenza_ore_prima ?? c.scadenza_ore_prima} />
            <p className="text-xs text-slate-500">
              Il corso conferma {descriviScadenza(c.scadenza_modo, c.scadenza_ora, c.scadenza_ore_prima)}. Scegli &quot;Come il corso&quot; per
              non personalizzare.
            </p>
            <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Salva</BottoneInvio>
          </form>
          <p className="mt-4 text-xs text-slate-500">
            Per cambiare giorno o ora: aggiungi il nuovo orario in &quot;Corsi e orari&quot; e sospendi questo (poi sposta gli abbonati).
          </p>
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
