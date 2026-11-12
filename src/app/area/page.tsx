import Link from "next/link";
import { Intestazione } from "@/components/Intestazione";
import { Badge, Card } from "@/components/ui";
import { isStaff, richiediUtente } from "@/lib/sessione";
import { data as formattaData, nomeGiorno, ora } from "@/lib/formato";

type Abbonamento = {
  id: string;
  tipo: string;
  data_inizio: string;
  data_fine: string;
  pagato: boolean;
  abbonamenti_orari: {
    orari_corso: { giorno_settimana: number; ora_inizio: string; corsi: { nome: string } | null } | null;
  }[];
};

export default async function AreaPage() {
  const { supabase, profilo } = await richiediUtente();
  const oggi = new Date().toISOString().slice(0, 10);

  // La Row Level Security fa si che qui arrivino SOLO gli abbonamenti di questa persona
  const { data } = await supabase
    .from("abbonamenti")
    .select("id, tipo, data_inizio, data_fine, pagato, abbonamenti_orari(orari_corso(giorno_settimana, ora_inizio, corsi(nome)))")
    .gte("data_fine", oggi)
    .order("data_inizio");
  const abbonamenti = (data ?? []) as unknown as Abbonamento[];

  return (
    <>
      <Intestazione voci={[]} nome={`${profilo.nome} ${profilo.cognome}`.trim()} ruolo={profilo.ruolo} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold">Ciao {profilo.nome || "!"} 👋</h1>
        <p className="mb-6 text-slate-600">Qui trovi il tuo abbonamento e, a breve, le lezioni da confermare.</p>

        {isStaff(profilo) && (
          <p className="mb-6 text-sm">
            Sei dello staff: vai all&apos;<Link href="/admin" className="text-vasca underline">area di gestione</Link>.
          </p>
        )}

        {abbonamenti.length === 0 ? (
          <Card>
            <p className="text-sm text-slate-600">Non hai abbonamenti attivi. Chiedi informazioni alla reception.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {abbonamenti.map((a) => {
              const orari = a.abbonamenti_orari
                .map((x) => x.orari_corso)
                .filter((o): o is NonNullable<typeof o> => !!o)
                .sort((x, y) => x.giorno_settimana - y.giorno_settimana);
              return (
                <Card key={a.id}>
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-lg font-semibold">{a.tipo}</p>
                    {!a.pagato && <Badge tono="attenzione">da saldare</Badge>}
                  </div>
                  <p className="text-sm text-slate-600">
                    Valido dal {formattaData(a.data_inizio)} al {formattaData(a.data_fine)}
                  </p>
                  <p className="mb-2 mt-4 text-sm font-medium">I tuoi appuntamenti fissi</p>
                  <div className="flex flex-wrap gap-2">
                    {orari.map((o, i) => (
                      <span key={i} className="rounded-lg bg-schiuma px-3 py-1.5 text-sm">
                        {o.corsi?.nome} · <strong>{nomeGiorno(o.giorno_settimana)}</strong> alle {ora(o.ora_inizio)}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-xs text-slate-500">
                    Ricorda: la presenza va confermata entro le 17:00 del giorno della lezione, altrimenti il posto viene liberato.
                  </p>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </>
  );
}
