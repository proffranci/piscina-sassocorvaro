import { BottoneInvio } from "@/components/BottoneInvio";
import { Badge, Card, bottoneSecondario } from "@/components/ui";
import { richiediUtente } from "@/lib/sessione";
import { data as formattaData, nomeGiorno, ora } from "@/lib/formato";
import { SELECT_ABBONAMENTI, type Abbonamento } from "../dati";

export default async function ProfiloPage() {
  const { supabase, profilo } = await richiediUtente();
  const oggiData = new Date().toISOString().slice(0, 10);

  const { data } = await supabase.from("abbonamenti").select(SELECT_ABBONAMENTI).gte("data_fine", oggiData).order("data_inizio");
  const abbonamenti = (data ?? []) as unknown as Abbonamento[];

  return (
    <>
      <h1 className="mb-5 text-2xl font-bold">Il tuo profilo</h1>

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
          <div>
            <dt className="text-slate-500">Promemoria via</dt>
            <dd className="font-medium">{profilo.canale_notifica === "whatsapp" ? "WhatsApp" : "Email"} e avvisi nell&apos;app</dd>
          </div>
        </dl>
        <p className="mt-4 text-xs text-slate-500">Per modificare i tuoi dati chiedi in reception.</p>
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
