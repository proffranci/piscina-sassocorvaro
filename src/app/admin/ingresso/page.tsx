import Link from "next/link";
import { Card, Titolo, bottoneSecondario, campo, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { etichettaGiorno, oggiItalia, oraDi } from "@/lib/formato";
import { ESITI, MOTIVI, type RigaIngresso } from "@/lib/ingresso";
import { LettoreIngresso } from "./LettoreIngresso";

export const metadata = { title: "Ingresso · Piscina Sassocorvaro" };

const GIORNO = /^\d{4}-\d{2}-\d{2}$/;

// Mezzanotte italiana di un giorno ("2026-11-17") come istante preciso
function mezzanotte(giorno: string) {
  const utc = new Date(`${giorno}T00:00:00Z`);
  const ora = Number(utc.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Europe/Rome" }));
  return new Date(utc.getTime() - ora * 3_600_000); // ora = 1 d'inverno, 2 d'estate
}
const spostaGiorno = (giorno: string, n: number) => new Date(Date.parse(`${giorno}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export default async function IngressoPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const sp = await searchParams;
  const oggi = oggiItalia();
  const scelto = parametro(sp.giorno) ?? "";
  const giorno = GIORNO.test(scelto) && scelto <= oggi ? scelto : oggi;
  const cerca = (parametro(sp.cerca) ?? "").trim().replace(/[%,()]/g, " ").slice(0, 40);

  let q = supabase
    .from("ingressi")
    .select("id, creato_il, utente_id, nome, esito, messaggi, motivo, pagamento_id")
    .gte("creato_il", mezzanotte(giorno).toISOString())
    .lt("creato_il", mezzanotte(spostaGiorno(giorno, 1)).toISOString())
    .order("creato_il", { ascending: false })
    .limit(300);
  if (cerca) q = q.ilike("nome", `%${cerca}%`);

  // Arrivati dalla scheda utente: apriamo subito la finestra per quella persona
  const idUtente = parametro(sp.utente);
  const [ingRes, utRes] = await Promise.all([
    q,
    idUtente ? supabase.from("profili").select("codice_ingresso").eq("id", idUtente).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const righe = (ingRes.data ?? []) as unknown as RigaIngresso[];
  const codiceIniziale = (utRes.data as { codice_ingresso: string } | null)?.codice_ingresso ?? null;
  const entrati = new Set(righe.filter((r) => r.esito !== "negato" && r.utente_id).map((r) => r.utente_id)).size;
  const perMotivo = (m: string) => righe.filter((r) => r.motivo === m).length;

  return (
    <>
      <Titolo azione={<Link href="/admin/utenti" className={bottoneSecondario}>🔎 Cerca per nome</Link>}>Ingresso</Titolo>
      <div className="grid gap-6 lg:grid-cols-[1fr_400px]">
        <LettoreIngresso codiceIniziale={codiceIniziale} />

        <Card>
          {/* Giorno */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <Link href={`/admin/ingresso?giorno=${spostaGiorno(giorno, -1)}`} className={bottoneSecondario} aria-label="Giorno prima">←</Link>
            <form className="flex-1 text-center">
              <input
                type="date"
                name="giorno"
                defaultValue={giorno}
                max={oggi}
                aria-label="Giorno"
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
              <button type="submit" className="ml-1 text-xs text-vasca underline">vai</button>
              <p className="text-sm font-semibold">{etichettaGiorno(`${giorno}T12:00:00Z`)}</p>
            </form>
            {giorno < oggi ? (
              <Link href={`/admin/ingresso?giorno=${spostaGiorno(giorno, 1)}`} className={bottoneSecondario} aria-label="Giorno dopo">→</Link>
            ) : (
              <span className="w-10" />
            )}
          </div>

          <p className="mb-3 text-sm text-slate-600">
            <strong>{entrati}</strong> {entrati === 1 ? "persona entrata" : "persone entrate"} · {perMotivo("lezione")} lezioni ·{" "}
            {perMotivo("singolo")} ingressi singoli · {perMotivo("altro")} altro
          </p>

          <form className="mb-3 flex gap-2">
            <input type="hidden" name="giorno" value={giorno} />
            <input name="cerca" defaultValue={cerca} placeholder="Cerca un nome" className={campo} />
            <button type="submit" className={bottoneSecondario}>Cerca</button>
          </form>

          {righe.length === 0 ? (
            <p className="text-sm text-slate-500">Nessun ingresso.</p>
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
                    {r.motivo && <span className="ml-1 text-xs text-slate-500">· {MOTIVI[r.motivo] ?? r.motivo}</span>}
                    {r.pagamento_id && (
                      <Link href={`/ricevuta/${r.pagamento_id}?torna=${encodeURIComponent("/admin/ingresso")}`} className="ml-1 text-xs">
                        🧾
                      </Link>
                    )}
                    {r.messaggi.length > 0 && <span className="block text-xs text-slate-500">{r.messaggi.join(" · ")}</span>}
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
