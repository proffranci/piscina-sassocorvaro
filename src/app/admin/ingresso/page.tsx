import Link from "next/link";
import { Card, Titolo, bottoneSecondario } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { oraDi } from "@/lib/formato";
import { ESITI, type RigaIngresso } from "@/lib/ingresso";
import { LettoreIngresso } from "./LettoreIngresso";

export const metadata = { title: "Ingresso · Piscina Sassocorvaro" };

export default async function IngressoPage() {
  const { supabase } = await richiediStaff();

  // Gli ingressi di oggi (da mezzanotte, ora italiana)
  const mezzanotte = new Date(`${new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Rome" })}T00:00:00`);
  const scarto = new Date(mezzanotte.toLocaleString("en-US", { timeZone: "Europe/Rome" })).getTime() - mezzanotte.getTime();
  const inizioGiorno = new Date(mezzanotte.getTime() - scarto).toISOString();

  const { data } = await supabase
    .from("ingressi")
    .select("id, creato_il, utente_id, nome, esito, messaggi")
    .gte("creato_il", inizioGiorno)
    .order("creato_il", { ascending: false })
    .limit(100);
  const righe = (data ?? []) as unknown as RigaIngresso[];
  const entrati = new Set(righe.filter((r) => r.esito !== "negato" && r.utente_id).map((r) => r.utente_id)).size;

  return (
    <>
      <Titolo azione={<Link href="/admin/utenti" className={bottoneSecondario}>🔎 Cerca per nome</Link>}>Ingresso</Titolo>
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <LettoreIngresso />

        <Card>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-semibold">Oggi</h2>
            <span className="text-sm text-slate-600">
              {entrati} {entrati === 1 ? "persona entrata" : "persone entrate"}
            </span>
          </div>
          {righe.length === 0 ? (
            <p className="text-sm text-slate-500">Ancora nessun ingresso.</p>
          ) : (
            <ol className="divide-y divide-slate-100 text-sm">
              {righe.map((r) => (
                <li key={r.id} className="flex gap-3 py-2">
                  <span className="w-12 shrink-0 tabular-nums text-slate-500">{oraDi(r.creato_il)}</span>
                  <span className="min-w-0">
                    <span className="mr-1">{ESITI[r.esito]?.icona}</span>
                    {r.utente_id ? (
                      <Link href={`/admin/utenti/${r.utente_id}`} className="font-medium text-vasca underline">
                        {r.nome ?? "—"}
                      </Link>
                    ) : (
                      <span className="font-medium">{r.nome ?? "Codice sconosciuto"}</span>
                    )}
                    {r.esito !== "ok" && r.messaggi.length > 0 && <span className="block text-xs text-slate-500">{r.messaggi.join(" · ")}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </>
  );
}
