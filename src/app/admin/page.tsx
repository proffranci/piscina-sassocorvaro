import Link from "next/link";
import { BarraPosti } from "@/components/BarraPosti";
import { Avviso, Badge, Card, Titolo, bottoneSecondario, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { etichettaGiorno, giornoChiave, oraDi } from "@/lib/formato";
import { contaPosti, type StatoPrenotazione, type TipoPrenotazione } from "@/lib/posti";
import { generaCalendario } from "./lezioni/actions";
import { BottoneInvio } from "@/components/BottoneInvio";

type Lezione = {
  id: string;
  inizio: string;
  fine: string;
  capienza: number;
  scadenza_conferma: string;
  annullata: boolean;
  corsi: { nome: string } | null;
  prenotazioni: { stato: StatoPrenotazione; tipo: TipoPrenotazione }[];
};

export default async function AdminHome({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const params = await searchParams;
  const adesso = new Date();
  const fra7giorni = new Date(adesso.getTime() + 7 * 86_400_000);
  const oggi = giornoChiave(adesso);
  const oggiData = adesso.toISOString().slice(0, 10);

  const [lezioniRes, daPagare] = await Promise.all([
    supabase
      .from("lezioni")
      .select("id, inizio, fine, capienza, scadenza_conferma, annullata, corsi(nome), prenotazioni(stato, tipo)")
      .gte("fine", adesso.toISOString())
      .lt("inizio", fra7giorni.toISOString())
      .order("inizio"),
    supabase.from("abbonamenti").select("*", { count: "exact", head: true }).gte("data_fine", oggiData).eq("pagato", false),
  ]);
  const lezioni = (lezioniRes.data ?? []) as unknown as Lezione[];

  // Numeri di oggi
  const diOggi = lezioni.filter((l) => giornoChiave(l.inizio) === oggi && !l.annullata);
  const contiOggi = diOggi.map((l) => contaPosti(l.capienza, l.prenotazioni));
  const daConfermareOggi = contiOggi.reduce((s, c) => s + c.inAttesa, 0);
  const presentiOggi = contiOggi.reduce((s, c) => s + c.confermati + c.ingressi, 0);

  // Raggruppo le lezioni per giorno
  const perGiorno = new Map<string, Lezione[]>();
  for (const l of lezioni) {
    const k = giornoChiave(l.inizio);
    perGiorno.set(k, [...(perGiorno.get(k) ?? []), l]);
  }

  const riquadri = [
    { titolo: "Lezioni oggi", valore: diOggi.length, href: "#oggi" },
    { titolo: "Presenze confermate oggi", valore: presentiOggi, href: "#oggi" },
    { titolo: "Da confermare oggi (entro le 17)", valore: daConfermareOggi, href: "#oggi", evidenzia: daConfermareOggi > 0 },
    { titolo: "Abbonamenti da incassare", valore: daPagare.count ?? 0, href: "/admin/abbonamenti" },
  ];

  return (
    <>
      <Titolo
        azione={
          <form action={generaCalendario}>
            <BottoneInvio className={bottoneSecondario} title="Crea subito le lezioni mancanti delle prossime 4 settimane">
              ↻ Aggiorna calendario
            </BottoneInvio>
          </form>
        }
      >
        Panoramica
      </Titolo>
      <Avviso errore={parametro(params.errore)} ok={parametro(params.ok)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {riquadri.map((r) => (
          <Link key={r.titolo} href={r.href}>
            <Card className={`h-full p-4 transition hover:border-acqua ${r.evidenzia ? "border-corsia bg-amber-50/40" : ""}`}>
              <p className="text-xs text-slate-600">{r.titolo}</p>
              <p className="mt-1 text-3xl font-bold text-vasca">{r.valore}</p>
            </Card>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Lezioni dei prossimi 7 giorni</h2>

      {lezioni.length === 0 && (
        <Card>
          <p className="text-sm text-slate-600">
            Nessuna lezione in calendario. Controlla di avere degli orari attivi in{" "}
            <Link href="/admin/corsi" className="text-vasca underline">Corsi e orari</Link>, poi premi{" "}
            <strong>Aggiorna calendario</strong>.
          </p>
        </Card>
      )}

      <div className="space-y-8">
        {[...perGiorno.entries()].map(([chiave, delGiorno]) => (
          <section key={chiave} id={chiave === oggi ? "oggi" : undefined}>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              {etichettaGiorno(delGiorno[0].inizio)}
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {delGiorno.map((l) => {
                const c = contaPosti(l.capienza, l.prenotazioni);
                const scaduta = new Date(l.scadenza_conferma) <= adesso;
                return (
                  <Link key={l.id} href={`/admin/lezioni/${l.id}`}>
                    <Card className="transition hover:border-acqua">
                      <div className="mb-3 flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {l.corsi?.nome} · {oraDi(l.inizio)}
                          </p>
                          <p className="text-xs text-slate-500">
                            {scaduta ? "Conferme chiuse" : `Conferme entro le ${oraDi(l.scadenza_conferma)}`}
                          </p>
                        </div>
                        {l.annullata ? (
                          <Badge>annullata</Badge>
                        ) : c.inAttesa > 0 ? (
                          <Badge tono="attenzione">{c.inAttesa} da confermare</Badge>
                        ) : (
                          <Badge tono="ok">{c.liberi} liberi</Badge>
                        )}
                      </div>
                      <BarraPosti conteggio={c} legenda />
                      <p className="mt-3 text-right text-sm font-medium text-vasca">
                        Partecipanti e prenotazioni →
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
