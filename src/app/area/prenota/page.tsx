import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Card, bottone, parametro, type SearchParams } from "@/components/ui";
import { richiediUtente } from "@/lib/sessione";
import { etichettaGiorno, oraDi } from "@/lib/formato";
import { prenota } from "../actions";
import { postiLiberi, type LezioneBase } from "../dati";

export default async function PrenotaPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo } = await richiediUtente();
  const sp = await searchParams;
  const adesso = new Date();
  const fra7giorni = new Date(adesso.getTime() + 7 * 86_400_000);

  const [lezioniRes, mieRes] = await Promise.all([
    supabase
      .from("lezioni")
      .select("id, inizio, capienza, scadenza_conferma, annullata, corsi(nome)")
      .eq("annullata", false)
      .gt("inizio", adesso.toISOString())
      .lt("inizio", fra7giorni.toISOString())
      .order("inizio"),
    supabase.from("prenotazioni").select("lezione_id").eq("utente_id", profilo.id).in("stato", ["riservata", "confermata"]),
  ]);
  const lezioni = (lezioniRes.data ?? []) as unknown as LezioneBase[];
  const giaMie = new Set(((mieRes.data ?? []) as { lezione_id: string }[]).map((r) => r.lezione_id));
  const prenotabili = lezioni.filter((l) => !giaMie.has(l.id));
  const liberiIn = await postiLiberi(supabase, prenotabili);

  return (
    <>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />
      {!profilo.attivo ? (
        <Card>
          <p className="text-sm">Il tuo account è disattivato. Per informazioni contatta la reception.</p>
        </Card>
      ) : (
        <>
        <h1 className="mb-1 text-2xl font-bold">Prenota un ingresso</h1>
        <p className="mb-3 text-sm text-slate-600">Le lezioni dei prossimi 7 giorni con posti disponibili.</p>
        {prenotabili.length === 0 ? (
          <Card className="mb-10">
            <p className="text-sm text-slate-600">Nessuna altra lezione in programma nei prossimi giorni.</p>
          </Card>
        ) : (
          <ul className="mb-10 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {prenotabili.map((l) => {
              const liberi = liberiIn(l);
              return (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium">
                      {l.corsi?.nome} · {etichettaGiorno(l.inizio)} alle {oraDi(l.inizio)}
                    </p>
                    <p className={`text-sm ${liberi > 0 ? "text-slate-600" : "text-red-700"}`}>
                      {liberi > 0 ? `${liberi} ${liberi === 1 ? "posto libero" : "posti liberi"}` : "Al completo"}
                    </p>
                  </div>
                  {liberi > 0 && (
                    <form action={prenota}>
                      <input type="hidden" name="lezione_id" value={l.id} />
                      <input type="hidden" name="torna" value="/area/prenota" />
                      <BottoneInvio className={bottone}>Prenota</BottoneInvio>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        </>
      )}
    </>
  );
}
