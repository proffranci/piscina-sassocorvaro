import Link from "next/link";
import { AttivaNotifiche } from "@/components/AttivaNotifiche";
import { SegnaAlCaricamento } from "@/components/SegnaAlCaricamento";
import { Card, Titolo, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { etichettaGiorno, giornoChiave, oraDi } from "@/lib/formato";
import { segnaNovitaLette } from "./actions";

type Novita = {
  id: number;
  creata_il: string;
  tipo: string;
  descrizione: string;
  lezione_id: string | null;
};

// I filtri in alto: ogni filtro raggruppa uno o più tipi di operazione
const FILTRI: { chiave: string; etichetta: string; tipi: string[] | null }[] = [
  { chiave: "tutte", etichetta: "Tutte", tipi: null },
  { chiave: "richieste", etichetta: "📝 Richieste", tipi: ["richiesta"] },
  { chiave: "disdette", etichetta: "↩️ Disdette", tipi: ["disdetta"] },
  { chiave: "prenotazioni", etichetta: "🎟️ Prenotazioni", tipi: ["prenotazione", "ripreso"] },
  { chiave: "conferme", etichetta: "✅ Conferme", tipi: ["conferma"] },
  { chiave: "profilo", etichetta: "👤 Preferenze", tipi: ["preferenza"] },
];

const ICONE: Record<string, string> = {
  disdetta: "↩️",
  prenotazione: "🎟️",
  ripreso: "🔁",
  conferma: "✅",
  preferenza: "👤",
  richiesta: "📝",
};

export default async function NovitaPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo } = await richiediStaff();
  const sp = await searchParams;
  const filtro = FILTRI.find((f) => f.chiave === parametro(sp.filtro)) ?? FILTRI[0];

  let query = supabase
    .from("attivita")
    .select("id, creata_il, tipo, descrizione, lezione_id")
    .eq("da_cliente", true)
    .order("creata_il", { ascending: false })
    .limit(100);
  if (filtro.tipi) query = query.in("tipo", filtro.tipi);

  const [novitaRes, letturaRes] = await Promise.all([
    query,
    supabase.from("staff_letture").select("letto_fino").eq("utente_id", profilo.id).maybeSingle(),
  ]);
  const novita = (novitaRes.data ?? []) as unknown as Novita[];
  // Tutto quello che è successo dopo l'ultima lettura è "nuovo" (evidenziato)
  const lettoFino = (letturaRes.data as { letto_fino: string } | null)?.letto_fino ?? new Date(Date.now() - 7 * 86_400_000).toISOString();
  const confine = new Date(lettoFino).getTime();
  const eNuova = (n: Novita) => new Date(n.creata_il).getTime() > confine;
  const nuove = novita.filter(eNuova).length;

  const perGiorno = new Map<string, Novita[]>();
  for (const n of novita) {
    const k = giornoChiave(n.creata_il);
    perGiorno.set(k, [...(perGiorno.get(k) ?? []), n]);
  }

  return (
    <>
      {/* Aprendo la pagina il numerino della campanella si azzera */}
      <SegnaAlCaricamento azione={segnaNovitaLette} attivo={nuove > 0} />

      <Titolo>Novità</Titolo>
      <p className="-mt-4 mb-5 max-w-2xl text-sm text-slate-600">
        Quello che fanno i clienti dall&apos;app: richieste di cambio giorno, disdette, posti ripresi, prenotazioni, conferme, cambi di preferenza.
        {nuove > 0 && <strong className="text-abisso"> {nuove === 1 ? "1 nuova" : `${nuove} nuove`} dall&apos;ultima visita.</strong>}
      </p>

      <AttivaNotifiche chiavePubblica={process.env.VAPID_PUBLIC_KEY?.trim() || null} />

      <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Filtri">
        {FILTRI.map((f) => (
          <Link
            key={f.chiave}
            href={f.chiave === "tutte" ? "/admin/novita" : `/admin/novita?filtro=${f.chiave}`}
            className={`inline-flex min-h-[40px] shrink-0 items-center rounded-full border px-3 text-sm ${
              f.chiave === filtro.chiave ? "border-acqua bg-acqua text-white" : "border-slate-300 bg-white text-abisso hover:bg-schiuma"
            }`}
          >
            {f.etichetta}
          </Link>
        ))}
      </nav>

      {novita.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">Ancora niente qui. Appena un cliente fa qualcosa dall&apos;app, lo vedi comparire.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...perGiorno.entries()].map(([k, voci]) => (
            <section key={k}>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-500">{etichettaGiorno(voci[0].creata_il)}</h2>
              <ol className="divide-y divide-slate-100 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {voci.map((n) => {
                  const nuova = eNuova(n);
                  const contenuto = (
                    <div className={`flex gap-3 px-4 py-3 text-sm ${nuova ? "bg-schiuma" : ""}`}>
                      <span className="w-11 shrink-0 tabular-nums text-slate-500">{oraDi(n.creata_il)}</span>
                      <span aria-hidden="true">{ICONE[n.tipo] ?? "•"}</span>
                      <span className="min-w-0 flex-1">{n.descrizione}</span>
                      {nuova && <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-red-600" aria-label="nuova" />}
                    </div>
                  );
                  return (
                    <li key={n.id}>
                      {n.lezione_id ? (
                        <Link href={`/admin/lezioni/${n.lezione_id}`} className="block hover:bg-schiuma/60">
                          {contenuto}
                        </Link>
                      ) : (
                        contenuto
                      )}
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
