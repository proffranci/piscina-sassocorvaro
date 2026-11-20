import Link from "next/link";
import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Card, parametro, type SearchParams } from "@/components/ui";
import { richiediUtente } from "@/lib/sessione";
import { etichettaGiorno, giornoChiave, oraDi, quando } from "@/lib/formato";
import { prenota } from "../actions";
import { postiLiberi, type LezioneBase } from "../dati";

type RegoleCorso = {
  nome: string;
  ingressi_clienti: boolean;
  ingressi_da: string;
  prenotabile_giorni: number;
  disdetta_ore_prima: number;
  descrizione: string | null;
};
type Lezione = Omit<LezioneBase, "corsi"> & { corso_id: string; corsie: number | null; corsi: RegoleCorso | null };

const GIORNO = /^\d{4}-\d{2}-\d{2}$/;

export default async function PrenotaPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo } = await richiediUtente();
  const sp = await searchParams;
  const adesso = new Date();
  // Il calendario arriva a 4 settimane: poi ogni corso ha il suo anticipo massimo
  const fra28giorni = new Date(adesso.getTime() + 29 * 86_400_000);

  const [lezioniRes, mieRes] = await Promise.all([
    supabase
      .from("lezioni")
      .select(
        "id, inizio, capienza, corsie, scadenza_conferma, annullata, corso_id, corsi!inner(nome, ingressi_clienti, ingressi_da, prenotabile_giorni, disdetta_ore_prima, descrizione, attivo)",
      )
      .eq("annullata", false)
      .eq("corsi.attivo", true)
      .eq("corsi.ingressi_clienti", true)
      .gt("inizio", adesso.toISOString())
      .lt("inizio", fra28giorni.toISOString())
      .order("inizio"),
    supabase.from("prenotazioni").select("lezione_id").eq("utente_id", profilo.id).in("stato", ["riservata", "confermata"]),
  ]);
  const lezioni = ((lezioniRes.data ?? []) as unknown as Lezione[]).filter(
    (l) => !!l.corsi && new Date(l.inizio).getTime() <= adesso.getTime() + l.corsi.prenotabile_giorni * 86_400_000,
  );
  // "Solo dopo l'orario limite": prima di allora i posti restano agli abbonati
  // (se l'orario limite coincide con l'inizio, cioè "nessuna conferma", la regola non vale)
  const siApre = (l: Lezione) =>
    l.corsi?.ingressi_da === "dopo_scadenza" && new Date(l.scadenza_conferma) > adesso && l.scadenza_conferma < l.inizio ? l.scadenza_conferma : null;
  const giaMie = new Set(((mieRes.data ?? []) as { lezione_id: string }[]).map((r) => r.lezione_id));

  // Corsi e giorni disponibili
  const corsi = [...new Map(lezioni.map((l) => [l.corso_id, l.corsi?.nome ?? "Corso"])).entries()].map(([id, nome]) => ({ id, nome }));
  const corso = corsi.find((c) => c.id === parametro(sp.corso)) ?? corsi[0];
  const delCorso = lezioni.filter((l) => l.corso_id === corso?.id);
  const giorni = [...new Set(delCorso.map((l) => giornoChiave(l.inizio)))];
  const giorno = GIORNO.test(parametro(sp.giorno) ?? "") && giorni.includes(parametro(sp.giorno)!) ? parametro(sp.giorno)! : giorni[0];
  const delGiorno = delCorso.filter((l) => giornoChiave(l.inizio) === giorno);
  const liberiIn = await postiLiberi(supabase, delGiorno);

  const link = (c: string, g?: string) => `/area/prenota?corso=${c}${g ? `&giorno=${g}` : ""}`;
  const breve = (chiave: string) => {
    const e = etichettaGiorno(`${chiave}T12:00:00Z`);
    return e === "Oggi" || e === "Domani" ? e : new Date(`${chiave}T12:00:00Z`).toLocaleDateString("it-IT", { weekday: "short", day: "numeric", timeZone: "Europe/Rome" });
  };

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">Prenota un ingresso</h1>
      <p className="mb-5 text-sm text-slate-600">Scegli corso, giorno e orario. La reception ti manderà la conferma.</p>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      {!profilo.attivo ? (
        <Card>
          <p className="text-sm">Il tuo account è disattivato. Per informazioni contatta la reception.</p>
        </Card>
      ) : corsi.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">Nessuna lezione prenotabile dall&apos;app nei prossimi giorni. Per informazioni chiedi in reception.</p>
        </Card>
      ) : (
        <>
          {/* Corso */}
          {corsi.length > 1 && (
            <div className="mb-3 grid grid-cols-2 gap-2">
              {corsi.map((c) => (
                <Link
                  key={c.id}
                  href={link(c.id)}
                  className={`flex min-h-[48px] items-center justify-center rounded-xl border px-3 text-center text-sm font-semibold ${
                    c.id === corso?.id ? "border-acqua bg-acqua text-white" : "border-slate-300 bg-white"
                  }`}
                >
                  {c.nome}
                </Link>
              ))}
            </div>
          )}

          {/* Regole del corso, in breve */}
          {delCorso[0]?.corsi && (
            <p className="mb-3 text-xs text-slate-500">
              {delCorso[0].corsi.descrizione ? `${delCorso[0].corsi.descrizione} · ` : ""}
              prenotabile fino a {delCorso[0].corsi.prenotabile_giorni} giorni prima ·{" "}
              {delCorso[0].corsi.disdetta_ore_prima > 0
                ? `si può disdire fino a ${delCorso[0].corsi.disdetta_ore_prima} ${delCorso[0].corsi.disdetta_ore_prima === 1 ? "ora" : "ore"} prima`
                : "si può disdire fino all'inizio"}
            </p>
          )}

          {/* Giorno */}
          <nav className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1" aria-label="Giorno">
            {giorni.map((g) => (
              <Link
                key={g}
                href={link(corso!.id, g)}
                className={`inline-flex min-h-[44px] shrink-0 items-center rounded-xl border px-3 text-sm capitalize ${
                  g === giorno ? "border-abisso bg-abisso text-white" : "border-slate-300 bg-white"
                }`}
              >
                {breve(g)}
              </Link>
            ))}
          </nav>

          {/* Orari del giorno */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {delGiorno.map((l) => {
              const liberi = liberiIn(l);
              const mia = giaMie.has(l.id);
              const apertura = siApre(l);
              return (
                <div
                  key={l.id}
                  className={`rounded-2xl border bg-white p-3 shadow-sm ${mia ? "border-emerald-300 bg-emerald-50" : liberi === 0 ? "border-slate-200 opacity-60" : "border-slate-200"}`}
                >
                  <p className="text-xl font-bold tabular-nums">{oraDi(l.inizio)}</p>
                  {l.corsie && <p className="text-xs text-slate-500">{l.corsie} {l.corsie === 1 ? "corsia aperta" : "corsie aperte"}</p>}
                  <p className={`mb-2 text-xs ${liberi > 0 ? "text-slate-600" : "text-red-700"}`}>
                    {mia ? "✓ Già prenotato" : liberi > 0 ? `${liberi} ${liberi === 1 ? "posto libero" : "posti liberi"}` : "Al completo"}
                  </p>
                  {!mia && liberi > 0 && apertura && (
                    <p className="rounded-lg bg-slate-100 px-2 py-2 text-center text-xs text-slate-600">Posti tenuti per gli abbonati: si prenota da {quando(apertura)}</p>
                  )}
                  {!mia && liberi > 0 && !apertura && (
                    <form action={prenota}>
                      <input type="hidden" name="lezione_id" value={l.id} />
                      <input type="hidden" name="torna" value="/area/prenota" />
                      <BottoneInvio className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-acqua px-3 text-sm font-semibold text-white hover:bg-vasca">
                        Prenota
                      </BottoneInvio>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
