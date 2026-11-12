import Link from "next/link";
import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { data as formattaData, nomeGiorno, ora } from "@/lib/formato";
import { cambiaPagato } from "./actions";
import { BottoneInvio } from "@/components/BottoneInvio";

type Riga = {
  id: string;
  tipo: string;
  data_inizio: string;
  data_fine: string;
  pagato: boolean;
  note: string | null;
  profili: { nome: string; cognome: string; email: string | null } | null;
  abbonamenti_orari: {
    orari_corso: { giorno_settimana: number; ora_inizio: string; corsi: { nome: string } | null } | null;
  }[];
};

export default async function AbbonamentiPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const params = await searchParams;
  const mostraScaduti = parametro(params.scaduti) === "1";
  const oggi = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from("abbonamenti")
    .select(
      "id, tipo, data_inizio, data_fine, pagato, note, profili(nome, cognome, email), abbonamenti_orari(orari_corso(giorno_settimana, ora_inizio, corsi(nome)))",
    )
    .order("data_fine", { ascending: true });
  if (!mostraScaduti) query = query.gte("data_fine", oggi);

  const { data } = await query;
  const abbonamenti = (data ?? []) as unknown as Riga[];

  return (
    <>
      <Titolo azione={<Link href="/admin/abbonamenti/nuovo" className={bottone}>+ Nuovo abbonamento</Link>}>
        Abbonamenti
      </Titolo>
      <Avviso errore={parametro(params.errore)} ok={parametro(params.ok)} />

      <div className="mb-4 text-sm">
        {mostraScaduti ? (
          <Link href="/admin/abbonamenti" className="text-vasca underline">Mostra solo quelli attivi</Link>
        ) : (
          <Link href="/admin/abbonamenti?scaduti=1" className="text-vasca underline">Mostra anche gli scaduti</Link>
        )}
      </div>

      {abbonamenti.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Nessun abbonamento. Crea il primo con il pulsante in alto.</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {abbonamenti.map((a) => {
          const scaduto = a.data_fine < oggi;
          const orari = a.abbonamenti_orari
            .map((x) => x.orari_corso)
            .filter((o): o is NonNullable<typeof o> => !!o)
            .sort((x, y) => x.giorno_settimana - y.giorno_settimana);
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">
                    {a.profili ? `${a.profili.cognome} ${a.profili.nome}` : "Utente eliminato"}
                  </p>
                  <p className="text-sm text-slate-600">{a.tipo}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {scaduto && <Badge>scaduto</Badge>}
                  <Badge tono={a.pagato ? "ok" : "attenzione"}>{a.pagato ? "pagato" : "da pagare"}</Badge>
                </div>
              </div>

              <p className="mt-3 text-sm">
                Dal <strong>{formattaData(a.data_inizio)}</strong> al <strong>{formattaData(a.data_fine)}</strong>
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {orari.map((o, i) => (
                  <span key={i} className="rounded-lg bg-schiuma px-2.5 py-1 text-sm">
                    {o.corsi?.nome} · {nomeGiorno(o.giorno_settimana)} {ora(o.ora_inizio)}
                  </span>
                ))}
              </div>

              {a.note && <p className="mt-3 text-sm italic text-slate-600">{a.note}</p>}

              <form action={cambiaPagato} className="mt-4">
                <input type="hidden" name="id" value={a.id} />
                <input type="hidden" name="pagato" value={a.pagato ? "no" : "si"} />
                <BottoneInvio className={bottoneSecondario}>{a.pagato ? "Segna come non pagato" : "Segna come pagato"}</BottoneInvio>
              </form>
            </Card>
          );
        })}
      </div>
    </>
  );
}
