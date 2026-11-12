import { AttivaNotifiche } from "@/components/AttivaNotifiche";
import { Card } from "@/components/ui";
import { richiediUtente } from "@/lib/sessione";
import { etichettaGiorno, oraDi } from "@/lib/formato";
import Link from "next/link";
import { SegnaLette } from "./SegnaLette";

type Notifica = {
  id: string;
  tipo: string;
  titolo: string;
  testo: string;
  link: string | null;
  letta_il: string | null;
  creata_il: string;
};

const ICONE: Record<string, string> = {
  lezione: "🚴",
  pagamento: "💶",
  scadenza: "🪪",
  sistema: "🏊",
  promemoria: "🔔",
};

// Solo indirizzi interni all'app (mai link esterni dentro una notifica)
function linkSicuro(link: string | null) {
  return link && link.startsWith("/area") ? link : null;
}

export default async function AvvisiCliente() {
  const { supabase, profilo } = await richiediUtente();
  const { data } = await supabase
    .from("notifiche")
    .select("id, tipo, titolo, testo, link, letta_il, creata_il")
    .eq("utente_id", profilo.id)
    .order("creata_il", { ascending: false })
    .limit(50);
  const avvisi = (data ?? []) as unknown as Notifica[];
  const nonLetti = avvisi.filter((a) => !a.letta_il).length;

  return (
    <>
      <SegnaLette attivo={nonLetti > 0} />
      <h1 className="mb-5 text-2xl font-bold">Avvisi</h1>
      <AttivaNotifiche chiavePubblica={process.env.VAPID_PUBLIC_KEY?.trim() || null} />

      {avvisi.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            Nessun avviso per ora. Qui riceverai i promemoria per confermare le lezioni, le scadenze dell&apos;abbonamento e le
            comunicazioni della piscina.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {avvisi.map((a) => {
            const link = linkSicuro(a.link);
            const contenuto = (
              <Card className={a.letta_il ? "" : "border-acqua bg-schiuma/60"}>
                <div className="flex gap-3">
                  <span className="text-xl" aria-hidden="true">{ICONE[a.tipo] ?? "🔔"}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold">{a.titolo}</p>
                      {!a.letta_il && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-600" aria-label="nuovo" />}
                    </div>
                    {a.testo && <p className="mt-1 text-sm text-slate-700">{a.testo}</p>}
                    <p className="mt-2 text-xs text-slate-500">
                      {etichettaGiorno(a.creata_il)} alle {oraDi(a.creata_il)}
                      {link && <span className="ml-2 text-vasca">Apri →</span>}
                    </p>
                  </div>
                </div>
              </Card>
            );
            return <li key={a.id}>{link ? <Link href={link}>{contenuto}</Link> : contenuto}</li>;
          })}
        </ul>
      )}
    </>
  );
}
