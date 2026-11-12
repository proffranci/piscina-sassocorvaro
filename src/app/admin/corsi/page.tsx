import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { GIORNI, nomeGiorno, ora } from "@/lib/formato";
import { aggiornaCapienza, aggiungiOrario, cambiaAttivoOrario } from "./actions";

type Orario = { id: string; giorno_settimana: number; ora_inizio: string; durata_minuti: number; attivo: boolean };
type Corso = { id: string; nome: string; capienza: number; attivo: boolean; orari_corso: Orario[] };

export default async function CorsiPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const params = await searchParams;

  const { data } = await supabase
    .from("corsi")
    .select("id, nome, capienza, attivo, orari_corso(id, giorno_settimana, ora_inizio, durata_minuti, attivo)")
    .order("nome");
  const corsi = (data ?? []) as unknown as Corso[];

  return (
    <>
      <Titolo>Corsi e orari</Titolo>
      <p className="-mt-4 mb-6 max-w-2xl text-sm text-slate-600">
        Gli orari settimanali sono la base di tutto: gli abbonati scelgono qui i loro 2 appuntamenti fissi,
        e nella prossima fase il sistema genererà da questi le singole lezioni del calendario.
      </p>
      <Avviso errore={parametro(params.errore)} ok={parametro(params.ok)} />

      <div className="space-y-6">
        {corsi.map((corso) => {
          const orari = [...corso.orari_corso].sort(
            (a, b) => a.giorno_settimana - b.giorno_settimana || a.ora_inizio.localeCompare(b.ora_inizio),
          );
          return (
            <Card key={corso.id}>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
                <h2 className="text-xl font-semibold">{corso.nome}</h2>
                <form action={aggiornaCapienza} className="flex items-end gap-2">
                  <input type="hidden" name="corso_id" value={corso.id} />
                  <div>
                    <label className={etichetta} htmlFor={`cap-${corso.id}`}>Posti per lezione</label>
                    <input id={`cap-${corso.id}`} name="capienza" type="number" min={1} defaultValue={corso.capienza} className={`${campo} w-28`} />
                  </div>
                  <button className={bottoneSecondario}>Salva</button>
                </form>
              </div>

              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">Orari settimanali</h3>
              {orari.length === 0 ? (
                <p className="mb-4 text-sm text-slate-500">Nessun orario ancora: aggiungi il primo qui sotto.</p>
              ) : (
                <ul className="mb-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
                  {orari.map((o) => (
                    <li key={o.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                      <span>
                        <span className="font-medium">{nomeGiorno(o.giorno_settimana)}</span> · {ora(o.ora_inizio)} · {o.durata_minuti} min
                      </span>
                      <span className="flex items-center gap-2">
                        <Badge tono={o.attivo ? "ok" : "neutro"}>{o.attivo ? "attivo" : "sospeso"}</Badge>
                        <form action={cambiaAttivoOrario}>
                          <input type="hidden" name="id" value={o.id} />
                          <input type="hidden" name="attivo" value={o.attivo ? "no" : "si"} />
                          <button className={bottoneSecondario}>{o.attivo ? "Sospendi" : "Riattiva"}</button>
                        </form>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <form action={aggiungiOrario} className="flex flex-wrap items-end gap-3 rounded-lg bg-schiuma p-3">
                <input type="hidden" name="corso_id" value={corso.id} />
                <div>
                  <label className={etichetta} htmlFor={`g-${corso.id}`}>Giorno</label>
                  <select id={`g-${corso.id}`} name="giorno_settimana" className={campo} defaultValue="1">
                    {GIORNI.slice(1).map((g, i) => (
                      <option key={g} value={i + 1}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={etichetta} htmlFor={`o-${corso.id}`}>Ora</label>
                  <input id={`o-${corso.id}`} name="ora_inizio" type="time" required className={campo} />
                </div>
                <div>
                  <label className={etichetta} htmlFor={`d-${corso.id}`}>Durata (min)</label>
                  <input id={`d-${corso.id}`} name="durata_minuti" type="number" min={15} step={5} defaultValue={45} className={`${campo} w-28`} />
                </div>
                <button className={bottone}>Aggiungi orario</button>
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
}
