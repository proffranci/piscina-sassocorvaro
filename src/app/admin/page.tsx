import { BottoneWhatsApp, testiWhatsApp } from "@/components/WhatsApp";
import Link from "next/link";
import type { ReactNode } from "react";
import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Badge, Card, Titolo, bottoneSecondario, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { data as formattaData, etichettaGiorno, giornoChiave, oraDi } from "@/lib/formato";
import { contaPosti, type StatoPrenotazione, type TipoPrenotazione } from "@/lib/posti";
import { avvisaScadenza, sollecitaPagamento } from "./avvisi/actions";

type LezioneOggi = {
  id: string;
  inizio: string;
  capienza: number;
  scadenza_conferma: string;
  annullata: boolean;
  corsi: { nome: string } | null;
  prenotazioni: { stato: StatoPrenotazione; tipo: TipoPrenotazione }[];
};

type Abb = {
  id: string;
  tipo: string;
  data_fine: string;
  pagato: boolean;
  profili: { nome: string; cognome: string; telefono: string | null } | null;
};

type Attivita = { id: number; creata_il: string; tipo: string; descrizione: string };

const ICONE: Record<string, string> = {
  conferma: "✅",
  prenotazione: "🎟️",
  disdetta: "↩️",
  non_confermato: "⏰",
  pagamento: "💶",
  abbonamento: "🪪",
  avviso: "🔔",
  ripreso: "🔁",
  preferenza: "👤",
};

function nome(a: Abb) {
  return a.profili ? `${a.profili.cognome} ${a.profili.nome}` : "—";
}

// Un punto della lista di controllo: verde se è tutto a posto
function Controllo({
  titolo,
  numero,
  vuoto,
  children,
}: {
  titolo: string;
  numero: number;
  vuoto: string;
  children: ReactNode;
}) {
  return (
    <Card className={numero > 0 ? "border-corsia" : ""}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-semibold">{titolo}</h3>
        {numero > 0 ? <Badge tono="attenzione">{numero}</Badge> : <Badge tono="ok">✓ a posto</Badge>}
      </div>
      {numero > 0 ? children : <p className="text-sm text-slate-500">{vuoto}</p>}
    </Card>
  );
}

export default async function OggiPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const sp = await searchParams;
  const adesso = new Date();
  const oggi = giornoChiave(adesso);
  const oggiData = adesso.toISOString().slice(0, 10);
  const fra7 = new Date(adesso.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const meno7 = new Date(adesso.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const inizioGiorno = new Date(adesso.getTime() - 36 * 3_600_000).toISOString();
  const fineGiorno = new Date(adesso.getTime() + 36 * 3_600_000).toISOString();

  // Tutte le richieste partono insieme: una sola attesa invece di cinque
  const [lezRes, daPagareRes, inScadRes, scadutiRes, cronoRes] = await Promise.all([
    supabase
      .from("lezioni")
      .select("id, inizio, capienza, scadenza_conferma, annullata, corsi(nome), prenotazioni(stato, tipo)")
      .gte("inizio", inizioGiorno)
      .lt("inizio", fineGiorno)
      .order("inizio"),
    supabase
      .from("abbonamenti")
      .select("id, tipo, data_fine, pagato, profili(nome, cognome, telefono)")
      .eq("pagato", false)
      .gte("data_fine", oggiData)
      .order("data_fine"),
    supabase
      .from("abbonamenti")
      .select("id, tipo, data_fine, pagato, profili(nome, cognome, telefono)")
      .gte("data_fine", oggiData)
      .lte("data_fine", fra7)
      .order("data_fine"),
    supabase
      .from("abbonamenti")
      .select("id, tipo, data_fine, pagato, profili(nome, cognome, telefono)")
      .lt("data_fine", oggiData)
      .gte("data_fine", meno7)
      .order("data_fine", { ascending: false }),
    supabase.from("attivita").select("id, creata_il, tipo, descrizione").order("creata_il", { ascending: false }).limit(60),
  ]);

  const lezioni = ((lezRes.data ?? []) as unknown as LezioneOggi[]).filter(
    (l) => giornoChiave(l.inizio) === oggi && !l.annullata,
  );
  const daPagare = (daPagareRes.data ?? []) as unknown as Abb[];
  const inScadenza = (inScadRes.data ?? []) as unknown as Abb[];
  const scaduti = (scadutiRes.data ?? []) as unknown as Abb[];
  const cronologia = (cronoRes.data ?? []) as unknown as Attivita[];

  const daConfermareOggi = lezioni.reduce((s, l) => s + contaPosti(l.capienza, l.prenotazioni).inAttesa, 0);

  // Cronologia raggruppata per giorno (Oggi, Ieri, ...)
  const perGiorno = new Map<string, Attivita[]>();
  for (const a of cronologia) {
    const k = giornoChiave(a.creata_il);
    perGiorno.set(k, [...(perGiorno.get(k) ?? []), a]);
  }

  const dataOggi = adesso.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Europe/Rome",
  });

  return (
    <>
      <Titolo azione={<Link href="/admin/avvisi" className={bottoneSecondario}>🔔 Manda un avviso</Link>}>
        Oggi <span className="text-base font-normal capitalize text-slate-500">· {dataOggi}</span>
      </Titolo>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Da controllare</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {/* 1. Lezioni di oggi */}
        <Controllo titolo="Lezioni di oggi: conferme mancanti" numero={daConfermareOggi} vuoto={lezioni.length === 0 ? "Nessuna lezione oggi." : "Tutti hanno risposto."}>
          <ul className="space-y-2 text-sm">
            {lezioni.map((l) => {
              const c = contaPosti(l.capienza, l.prenotazioni);
              return (
                <li key={l.id}>
                  <Link href={`/admin/lezioni/${l.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-schiuma px-3 py-2 hover:bg-riflesso/20">
                    <span>
                      <strong>{l.corsi?.nome} {oraDi(l.inizio)}</strong> · entro le {oraDi(l.scadenza_conferma)}
                    </span>
                    <span className="whitespace-nowrap text-amber-800">{c.inAttesa} da confermare →</span>
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/admin/avvisi" className={`${bottoneSecondario} mt-3 w-full`}>
            🔔 Ricorda di confermare (app o WhatsApp)
          </Link>
        </Controllo>

        {/* 2. Pagamenti */}
        <Controllo titolo="Abbonamenti da incassare" numero={daPagare.length} vuoto="Tutti gli abbonamenti attivi sono pagati.">
          <ul className="divide-y divide-slate-100 text-sm">
            {daPagare.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <strong>{nome(a)}</strong>
                  <span className="block text-xs text-slate-500">{a.tipo}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <BottoneWhatsApp telefono={a.profili?.telefono} testo={testiWhatsApp.pagamento(a.profili?.nome ?? "", a.tipo)} etichetta="" />
                  <form action={sollecitaPagamento}>
                    <input type="hidden" name="abbonamento_id" value={a.id} />
                    <input type="hidden" name="torna" value="/admin" />
                    <BottoneInvio className={bottoneSecondario}>Sollecita</BottoneInvio>
                  </form>
                </span>
              </li>
            ))}
          </ul>
          {daPagare.length > 1 && (
            <form action={sollecitaPagamento} className="mt-3">
              <input type="hidden" name="abbonamento_id" value="tutti" />
              <input type="hidden" name="torna" value="/admin" />
              <BottoneInvio className={`${bottoneSecondario} w-full`}>Sollecita tutti ({daPagare.length})</BottoneInvio>
            </form>
          )}
        </Controllo>

        {/* 3. In scadenza */}
        <Controllo titolo="Abbonamenti in scadenza (7 giorni)" numero={inScadenza.length} vuoto="Nessun abbonamento in scadenza.">
          <ul className="divide-y divide-slate-100 text-sm">
            {inScadenza.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <strong>{nome(a)}</strong>
                  <span className="block text-xs text-slate-500">
                    scade {a.data_fine === oggiData ? "oggi" : `il ${formattaData(a.data_fine)}`}
                  </span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <BottoneWhatsApp
                    telefono={a.profili?.telefono}
                    testo={testiWhatsApp.scadenza(a.profili?.nome ?? "", a.tipo, formattaData(a.data_fine))}
                    etichetta=""
                  />
                  <form action={avvisaScadenza}>
                    <input type="hidden" name="abbonamento_id" value={a.id} />
                    <input type="hidden" name="torna" value="/admin" />
                    <BottoneInvio className={bottoneSecondario}>Avvisa</BottoneInvio>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        </Controllo>

        {/* 4. Scaduti da poco */}
        <Controllo titolo="Scaduti da poco: da rinnovare?" numero={scaduti.length} vuoto="Nessun abbonamento scaduto di recente.">
          <ul className="divide-y divide-slate-100 text-sm">
            {scaduti.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 py-2">
                <span>
                  <strong>{nome(a)}</strong>
                  <span className="block text-xs text-slate-500">scaduto il {formattaData(a.data_fine)}</span>
                </span>
                <span className="flex shrink-0 gap-2">
                  <BottoneWhatsApp telefono={a.profili?.telefono} testo={testiWhatsApp.scaduto(a.profili?.nome ?? "", a.tipo)} etichetta="" />
                  {a.profili?.telefono && (
                    <a href={`tel:${a.profili.telefono.replace(/\s/g, "")}`} className={bottoneSecondario}>
                      📞 Chiama
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Controllo>
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">Cronologia</h2>
      {cronologia.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-500">Ancora nessuna attività registrata.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {[...perGiorno.entries()].map(([k, voci]) => (
            <section key={k}>
              <h3 className="mb-2 text-sm font-semibold">{etichettaGiorno(voci[0].creata_il)}</h3>
              <ol className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                {voci.map((a) => (
                  <li key={a.id} className="flex gap-3 px-4 py-2.5 text-sm">
                    <span className="w-11 shrink-0 tabular-nums text-slate-500">{oraDi(a.creata_il)}</span>
                    <span aria-hidden="true">{ICONE[a.tipo] ?? "•"}</span>
                    <span className="min-w-0">{a.descrizione}</span>
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
