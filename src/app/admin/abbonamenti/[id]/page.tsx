import Link from "next/link";
import { notFound } from "next/navigation";
import { BottoneInvio } from "@/components/BottoneInvio";
import { RichiestaCambio, SELECT_RICHIESTE, type RichiestaStaff } from "@/components/RichiestaCambio";
import { BottoneWhatsApp, testiWhatsApp } from "@/components/WhatsApp";
import { Avviso, Badge, Card, Titolo, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { data as formattaData, nomeGiorno, ora } from "@/lib/formato";
import { cambiaGiorno, cambiaPagato } from "../actions";

type Orario = { id: string; giorno_settimana: number; ora_inizio: string; corsi: { nome: string } | null };
type Abbonamento = {
  id: string;
  tipo: string;
  data_inizio: string;
  data_fine: string;
  pagato: boolean;
  note: string | null;
  utente_id: string;
  profili: { nome: string; cognome: string; telefono: string | null } | null;
  abbonamenti_orari: { orari_corso: Orario | null }[];
};

export default async function SchedaAbbonamento({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
  const { supabase } = await richiediStaff();
  const { id } = await params;
  const sp = await searchParams;

  const [abbRes, orariRes, richiesteRes] = await Promise.all([
    supabase
      .from("abbonamenti")
      .select(
        "id, tipo, data_inizio, data_fine, pagato, note, utente_id, profili(nome, cognome, telefono), abbonamenti_orari(orari_corso(id, giorno_settimana, ora_inizio, corsi(nome)))",
      )
      .eq("id", id)
      .maybeSingle(),
    supabase.from("orari_corso").select("id, giorno_settimana, ora_inizio, corsi(nome)").eq("attivo", true).order("giorno_settimana").order("ora_inizio"),
    supabase.from("richieste_cambio").select(SELECT_RICHIESTE).eq("abbonamento_id", id).eq("stato", "in_attesa"),
  ]);
  const a = abbRes.data as unknown as Abbonamento | null;
  if (!a) notFound();
  const orari = (orariRes.data ?? []) as unknown as Orario[];
  const richieste = (richiesteRes.data ?? []) as unknown as RichiestaStaff[];

  const miei = a.abbonamenti_orari
    .map((x) => x.orari_corso)
    .filter((o): o is Orario => !!o)
    .sort((x, y) => x.giorno_settimana - y.giorno_settimana);
  const mieiId = new Set(miei.map((o) => o.id));
  const alternative = orari.filter((o) => !mieiId.has(o.id));
  const scaduto = a.data_fine < new Date().toISOString().slice(0, 10);
  const pagina = `/admin/abbonamenti/${a.id}`;

  return (
    <>
      <Titolo azione={<Link href="/admin/abbonamenti" className={bottoneSecondario}>← Abbonamenti</Link>}>
        {a.profili ? `${a.profili.nome} ${a.profili.cognome}` : "Abbonamento"}
      </Titolo>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{a.tipo}</p>
              <p className="text-sm text-slate-600">
                Dal {formattaData(a.data_inizio)} al {formattaData(a.data_fine)}
              </p>
            </div>
            <div className="flex flex-col items-end gap-1">
              {scaduto && <Badge>scaduto</Badge>}
              <Badge tono={a.pagato ? "ok" : "attenzione"}>{a.pagato ? "pagato" : "da pagare"}</Badge>
            </div>
          </div>
          {a.note && <p className="mt-3 text-sm italic text-slate-600">{a.note}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <form action={cambiaPagato}>
              <input type="hidden" name="id" value={a.id} />
              <input type="hidden" name="pagato" value={a.pagato ? "no" : "si"} />
              <BottoneInvio className={bottoneSecondario}>{a.pagato ? "Segna come non pagato" : "Segna come pagato"}</BottoneInvio>
            </form>
            {!a.pagato && <BottoneWhatsApp telefono={a.profili?.telefono} testo={testiWhatsApp.pagamento(a.profili?.nome ?? "", a.tipo)} />}
            <Link href={`/admin/utenti/${a.utente_id}`} className={bottoneSecondario}>
              Scheda cliente
            </Link>
          </div>
        </Card>

        {richieste.length > 0 && (
          <Card className="border-corsia">
            <h2 className="mb-3 font-semibold">📝 Richiesta del cliente</h2>
            <div className="space-y-3">
              {richieste.map((r) => (
                <RichiestaCambio key={r.id} r={r} torna={pagina} />
              ))}
            </div>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <h2 className="mb-1 font-semibold">Giorni fissi</h2>
          <p className="mb-4 text-sm text-slate-600">
            Cambiando un giorno, i posti delle lezioni future vengono spostati sul nuovo orario.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {miei.map((o) => (
              <form key={o.id} action={cambiaGiorno} className="rounded-xl border border-slate-200 p-4">
                <input type="hidden" name="abbonamento_id" value={a.id} />
                <input type="hidden" name="vecchio" value={o.id} />
                <p className="mb-3 font-medium">
                  {nomeGiorno(o.giorno_settimana)} {ora(o.ora_inizio)} · {o.corsi?.nome}
                </p>
                <label className={etichetta} htmlFor={`nuovo-${o.id}`}>Sostituisci con</label>
                <select id={`nuovo-${o.id}`} name="nuovo" required defaultValue="" className={campo}>
                  <option value="" disabled>
                    Scegli il nuovo orario…
                  </option>
                  {alternative.map((x) => (
                    <option key={x.id} value={x.id}>
                      {nomeGiorno(x.giorno_settimana)} {ora(x.ora_inizio)} · {x.corsi?.nome}
                    </option>
                  ))}
                </select>
                <BottoneInvio className={`${bottoneSecondario} mt-3 w-full`}>Cambia giorno</BottoneInvio>
              </form>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
