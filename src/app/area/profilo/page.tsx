import { AttivaNotifiche } from "@/components/AttivaNotifiche";
import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Badge, Card, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { aggiornaPreferenze } from "../actions";
import { richiediUtente } from "@/lib/sessione";
import { data as formattaData, nomeGiorno, ora } from "@/lib/formato";
import { SELECT_ABBONAMENTI, type Abbonamento } from "../dati";

export default async function ProfiloPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo } = await richiediUtente();
  const sp = await searchParams;
  const oggiData = new Date().toISOString().slice(0, 10);

  const { data } = await supabase.from("abbonamenti").select(SELECT_ABBONAMENTI).gte("data_fine", oggiData).order("data_inizio");
  const abbonamenti = (data ?? []) as unknown as Abbonamento[];

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold">Il tuo profilo</h1>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />
      <AttivaNotifiche chiavePubblica={process.env.VAPID_PUBLIC_KEY?.trim() || null} />

      <Card className="mb-8">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-slate-500">Nome</dt>
            <dd className="font-medium">{profilo.nome} {profilo.cognome}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Email</dt>
            <dd className="break-all font-medium">{profilo.email ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Telefono</dt>
            <dd className="font-medium">{profilo.telefono ?? "—"}</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">Per modificare nome ed email chiedi in reception.</p>
      </Card>

      {/* Preferenza di contatto: la sceglie il cliente */}
      <Card className="mb-8">
        <h2 className="mb-1 font-semibold">Come preferisci ricevere gli avvisi?</h2>
        <p className="mb-4 text-sm text-slate-600">
          Promemoria per confermare le lezioni, scadenze e comunicazioni della piscina.
        </p>
        <form action={aggiornaPreferenze} className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex min-h-[44px] items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-acqua has-[:checked]:bg-schiuma">
              <input type="radio" name="canale_notifica" value="app" defaultChecked={profilo.canale_notifica !== "whatsapp"} className="mt-1" />
              <span>
                <strong>🔔 Nell&apos;app</strong>
                <span className="block text-xs text-slate-500">Avvisi qui e notifiche sul telefono (attivale qui sopra)</span>
              </span>
            </label>
            <label className="flex min-h-[44px] items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-acqua has-[:checked]:bg-schiuma">
              <input type="radio" name="canale_notifica" value="whatsapp" defaultChecked={profilo.canale_notifica === "whatsapp"} className="mt-1" />
              <span>
                <strong>💬 Su WhatsApp</strong>
                <span className="block text-xs text-slate-500">La reception ti scrive su WhatsApp</span>
              </span>
            </label>
          </div>
          <div>
            <label className={etichetta} htmlFor="telefono">Telefono (per WhatsApp)</label>
            <input id="telefono" name="telefono" type="tel" inputMode="tel" defaultValue={profilo.telefono ?? ""} placeholder="+39 333 1234567" className={campo} />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="consenso_whatsapp" defaultChecked={profilo.consenso_whatsapp} className="mt-1" />
            <span>Acconsento a ricevere messaggi WhatsApp dalla Piscina di Sassocorvaro</span>
          </label>
          <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Salva preferenza</BottoneInvio>
        </form>
      </Card>

        {abbonamenti.length > 0 && (
          <>
            <h2 className="mb-3 text-lg font-semibold">Il tuo abbonamento</h2>
            <div className="space-y-3">
              {abbonamenti.map((a) => {
                const orari = a.abbonamenti_orari
                  .map((x) => x.orari_corso)
                  .filter((o): o is NonNullable<typeof o> => !!o)
                  .sort((x, y) => x.giorno_settimana - y.giorno_settimana);
                return (
                  <Card key={a.id}>
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold">{a.tipo}</p>
                      {!a.pagato && <Badge tono="attenzione">da saldare</Badge>}
                    </div>
                    <p className="text-sm text-slate-600">
                      Valido dal {formattaData(a.data_inizio)} al {formattaData(a.data_fine)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {orari.map((o, i) => (
                        <span key={i} className="rounded-lg bg-schiuma px-3 py-1.5 text-sm">
                          {o.corsi?.nome} · <strong>{nomeGiorno(o.giorno_settimana)}</strong> alle {ora(o.ora_inizio)}
                        </span>
                      ))}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      {abbonamenti.length === 0 && (
        <Card className="mb-8">
          <p className="text-sm text-slate-600">Non hai abbonamenti attivi. Chiedi informazioni in reception.</p>
        </Card>
      )}

      <form action="/esci" method="post" className="mt-8">
        <BottoneInvio className={`${bottoneSecondario} w-full`}>Esci dall&apos;account</BottoneInvio>
      </form>
    </>
  );
}
