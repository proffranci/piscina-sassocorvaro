import Link from "next/link";
import { BarraPosti } from "@/components/BarraPosti";
import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Badge, Card, Titolo, bottoneSecondario, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { etichettaGiorno, giornoChiave, oraDi, quando } from "@/lib/formato";
import { contaPosti, type StatoPrenotazione, type TipoPrenotazione } from "@/lib/posti";
import { generaCalendario } from "./actions";

type Lezione = {
  id: string;
  inizio: string;
  capienza: number;
  scadenza_conferma: string;
  annullata: boolean;
  corso_id: string;
  corsi: { nome: string } | null;
  prenotazioni: { stato: StatoPrenotazione; tipo: TipoPrenotazione; da_confermare_staff: boolean }[];
};

const GIORNO = /^\d{4}-\d{2}-\d{2}$/;

// I prossimi 14 giorni (in ora italiana) per la striscia in alto
function prossimiGiorni(n: number) {
  const oggi = Date.now();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(oggi + i * 86_400_000);
    return {
      chiave: giornoChiave(d),
      breve: i === 0 ? "Oggi" : i === 1 ? "Domani" : d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", timeZone: "Europe/Rome" }),
    };
  });
}

export default async function LezioniPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const sp = await searchParams;
  const giorni = prossimiGiorni(14);
  const giorno = GIORNO.test(parametro(sp.giorno) ?? "") ? parametro(sp.giorno)! : giorni[0].chiave;
  const corsoScelto = parametro(sp.corso) ?? "";

  // Prendo un po' di margine attorno al giorno e poi filtro in ora italiana
  const centro = new Date(`${giorno}T12:00:00Z`).getTime();
  const [lezRes, corsiRes] = await Promise.all([
    supabase
      .from("lezioni")
      .select("id, inizio, capienza, scadenza_conferma, annullata, corso_id, corsi(nome), prenotazioni(stato, tipo, da_confermare_staff)")
      .gte("inizio", new Date(centro - 20 * 3_600_000).toISOString())
      .lt("inizio", new Date(centro + 20 * 3_600_000).toISOString())
      .order("inizio"),
    supabase.from("corsi").select("id, nome").eq("attivo", true).order("nome"),
  ]);
  const corsi = (corsiRes.data ?? []) as { id: string; nome: string }[];
  const tutte = ((lezRes.data ?? []) as unknown as Lezione[]).filter((l) => giornoChiave(l.inizio) === giorno);
  const lezioni = corsoScelto ? tutte.filter((l) => l.corso_id === corsoScelto) : tutte;
  const adesso = new Date();

  const link = (g: string, c: string) => `/admin/lezioni?giorno=${g}${c ? `&corso=${c}` : ""}`;

  // Raggruppo per corso
  const perCorso = new Map<string, Lezione[]>();
  for (const l of lezioni) {
    const k = l.corsi?.nome ?? "Altro";
    perCorso.set(k, [...(perCorso.get(k) ?? []), l]);
  }

  return (
    <>
      <Titolo
        azione={
          <form action={generaCalendario} className="flex gap-2">
            <Link href="/admin/corsi" className={bottoneSecondario}>
              Corsi e orari
            </Link>
            <BottoneInvio className={bottoneSecondario} title="Crea subito le lezioni mancanti delle prossime 4 settimane">
              ↻ Aggiorna calendario
            </BottoneInvio>
          </form>
        }
      >
        Lezioni
      </Titolo>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      {/* Giorni */}
      <nav className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Giorno">
        {giorni.map((g) => (
          <Link
            key={g.chiave}
            href={link(g.chiave, corsoScelto)}
            className={`inline-flex min-h-[44px] shrink-0 items-center rounded-xl border px-3 text-sm capitalize ${
              g.chiave === giorno ? "border-abisso bg-abisso text-white" : "border-slate-300 bg-white hover:bg-schiuma"
            }`}
          >
            {g.breve}
          </Link>
        ))}
      </nav>

      {/* Corsi */}
      <nav className="-mx-4 mb-6 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Corso">
        {[{ id: "", nome: "Tutti i corsi" }, ...corsi].map((c) => (
          <Link
            key={c.id || "tutti"}
            href={link(giorno, c.id)}
            className={`inline-flex min-h-[40px] shrink-0 items-center rounded-full border px-3 text-sm ${
              c.id === corsoScelto ? "border-acqua bg-acqua text-white" : "border-slate-300 bg-white hover:bg-schiuma"
            }`}
          >
            {c.nome}
          </Link>
        ))}
      </nav>

      <h2 className="mb-4 text-lg font-semibold">{etichettaGiorno(`${giorno}T12:00:00Z`)}</h2>

      {lezioni.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600">
            Nessuna lezione in questo giorno. Controlla gli orari in{" "}
            <Link href="/admin/corsi" className="text-vasca underline">Corsi e orari</Link>.
          </p>
        </Card>
      )}

      <div className="space-y-8">
        {[...perCorso.entries()].map(([nome, delCorso]) => (
          <section key={nome}>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {nome} <span className="text-abisso">({delCorso.length})</span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {delCorso.map((l) => {
                const c = contaPosti(l.capienza, l.prenotazioni);
                const daConfermareIngressi = l.prenotazioni.filter((p) => p.da_confermare_staff && p.stato === "confermata").length;
                const finita = new Date(l.inizio) <= adesso;
                const scaduta = new Date(l.scadenza_conferma) <= adesso;
                return (
                  <Link key={l.id} href={`/admin/lezioni/${l.id}`}>
                    <Card className={`p-4 transition hover:border-acqua ${l.annullata ? "opacity-60" : ""} ${finita ? "bg-slate-50" : ""}`}>
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <div>
                          <p className="text-lg font-semibold tabular-nums">{oraDi(l.inizio)}</p>
                          <p className="text-xs text-slate-500">
                            {l.annullata ? "Annullata" : finita ? "Iniziata" : scaduta ? "Conferme chiuse" : `Conferme entro ${quando(l.scadenza_conferma)}`}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-1">
                          {l.annullata ? (
                            <Badge>annullata</Badge>
                          ) : c.inAttesa > 0 ? (
                            <Badge tono="attenzione">{c.inAttesa} da confermare</Badge>
                          ) : (
                            <Badge tono="ok">{c.liberi} liberi</Badge>
                          )}
                          {daConfermareIngressi > 0 && <Badge tono="attenzione">{daConfermareIngressi} ingressi da conf.</Badge>}
                        </div>
                      </div>
                      <BarraPosti conteggio={c} />
                      <p className="mt-2 text-xs text-slate-500">
                        {l.capienza - c.liberi}/{l.capienza} posti · Partecipanti →
                      </p>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
