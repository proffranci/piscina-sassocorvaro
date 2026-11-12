import Link from "next/link";
import { Intestazione } from "@/components/Intestazione";
import { Avviso, Badge, Card, bottone, bottoneSecondario, parametro, type SearchParams } from "@/components/ui";
import { isStaff, richiediUtente } from "@/lib/sessione";
import { data as formattaData, etichettaGiorno, nomeGiorno, ora, oraDi } from "@/lib/formato";
import type { StatoPrenotazione, TipoPrenotazione } from "@/lib/posti";
import { conferma, disdici, prenota } from "./actions";
import { BottoneInvio } from "@/components/BottoneInvio";

type LezioneBase = {
  id: string;
  inizio: string;
  capienza: number;
  scadenza_conferma: string;
  annullata: boolean;
  corsi: { nome: string } | null;
};

type MiaPrenotazione = {
  id: string;
  stato: StatoPrenotazione;
  tipo: TipoPrenotazione;
  lezioni: LezioneBase;
};

type Abbonamento = {
  id: string;
  tipo: string;
  data_inizio: string;
  data_fine: string;
  pagato: boolean;
  abbonamenti_orari: {
    orari_corso: { giorno_settimana: number; ora_inizio: string; corsi: { nome: string } | null } | null;
  }[];
};

export default async function AreaPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo } = await richiediUtente();
  const sp = await searchParams;
  const adesso = new Date();
  const fra7giorni = new Date(adesso.getTime() + 7 * 86_400_000);
  const oggiData = adesso.toISOString().slice(0, 10);

  // La Row Level Security fa sì che qui arrivino SOLO i dati di questa persona
  const [mieRes, lezioniRes, abbRes] = await Promise.all([
    supabase
      .from("prenotazioni")
      .select("id, stato, tipo, lezioni!inner(id, inizio, capienza, scadenza_conferma, annullata, corsi(nome))")
      .eq("utente_id", profilo.id)
      .neq("stato", "annullata")
      .gte("lezioni.inizio", adesso.toISOString()),
    supabase
      .from("lezioni")
      .select("id, inizio, capienza, scadenza_conferma, annullata, corsi(nome)")
      .eq("annullata", false)
      .gt("inizio", adesso.toISOString())
      .lt("inizio", fra7giorni.toISOString())
      .order("inizio"),
    supabase
      .from("abbonamenti")
      .select("id, tipo, data_inizio, data_fine, pagato, abbonamenti_orari(orari_corso(giorno_settimana, ora_inizio, corsi(nome)))")
      .gte("data_fine", oggiData)
      .order("data_inizio"),
  ]);

  const mie = ((mieRes.data ?? []) as unknown as MiaPrenotazione[]).sort((a, b) =>
    a.lezioni.inizio.localeCompare(b.lezioni.inizio),
  );
  const lezioni = (lezioniRes.data ?? []) as unknown as LezioneBase[];
  const abbonamenti = (abbRes.data ?? []) as unknown as Abbonamento[];

  // Posti occupati (solo i numeri) delle lezioni che mostriamo
  const ids = [...new Set([...lezioni.map((l) => l.id), ...mie.map((m) => m.lezioni.id)])];
  const occupati = new Map<string, number>();
  if (ids.length > 0) {
    const { data } = await supabase.rpc("posti_occupati", { p_lezioni: ids });
    for (const r of (data ?? []) as { lezione_id: string; occupati: number }[]) occupati.set(r.lezione_id, r.occupati);
  }
  const liberiIn = (l: LezioneBase) => Math.max(0, l.capienza - (occupati.get(l.id) ?? 0));

  const giaMie = new Set(mie.map((m) => m.lezioni.id));
  const prenotabili = lezioni.filter((l) => !giaMie.has(l.id));
  const daConfermare = mie.filter((m) => m.stato === "riservata" && new Date(m.lezioni.scadenza_conferma) > adesso);

  return (
    <>
      <Intestazione voci={[]} nome={`${profilo.nome} ${profilo.cognome}`.trim()} ruolo={profilo.ruolo} />
      <main className="mx-auto max-w-3xl px-4 pb-12 pt-6 sm:py-8">
        <h1 className="text-2xl font-bold">Ciao {profilo.nome || "!"} 👋</h1>
        <p className="mb-6 text-slate-600">
          {daConfermare.length > 0
            ? `Hai ${daConfermare.length === 1 ? "una lezione" : `${daConfermare.length} lezioni`} da confermare.`
            : "Ecco le tue prossime lezioni."}
        </p>

        {isStaff(profilo) && (
          <p className="mb-6 text-sm">
            Sei dello staff: vai all&apos;<Link href="/admin" className="text-vasca underline">area di gestione</Link>.
          </p>
        )}

        <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

        {!profilo.attivo ? (
          <Card>
            <p className="text-sm">Il tuo account è disattivato. Per informazioni contatta la reception.</p>
          </Card>
        ) : (
          <>
            {/* ---------- Le mie lezioni ---------- */}
            <h2 className="mb-3 text-lg font-semibold">Le tue prossime lezioni</h2>
            {mie.length === 0 ? (
              <Card className="mb-8">
                <p className="text-sm text-slate-600">Nessuna lezione prenotata. Puoi prenotarne una qui sotto.</p>
              </Card>
            ) : (
              <div className="mb-10 space-y-3">
                {mie.map((m) => {
                  const l = m.lezioni;
                  const scaduta = new Date(l.scadenza_conferma) <= adesso;
                  const titolo = `${l.corsi?.nome ?? "Lezione"} · ${etichettaGiorno(l.inizio)} alle ${oraDi(l.inizio)}`;

                  if (l.annullata) {
                    return (
                      <Card key={m.id} className="opacity-70">
                        <p className="font-semibold">{titolo}</p>
                        <Badge>lezione annullata</Badge>
                      </Card>
                    );
                  }

                  if (m.stato === "riservata") {
                    return (
                      <Card key={m.id} className="border-corsia">
                        <p className="font-semibold">{titolo}</p>
                        {scaduta ? (
                          <p className="mt-1 text-sm text-slate-600">Tempo per confermare scaduto: il posto sta per essere liberato.</p>
                        ) : (
                          <>
                            <p className="mt-1 text-sm text-amber-800">
                              Conferma entro le <strong>{oraDi(l.scadenza_conferma)}</strong>
                              {etichettaGiorno(l.scadenza_conferma) === "Oggi" ? " di oggi" : ` di ${etichettaGiorno(l.scadenza_conferma).toLowerCase()}`}
                              , altrimenti il posto passa a chi fa l&apos;ingresso singolo.
                            </p>
                            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                              <form action={conferma}>
                                <input type="hidden" name="id" value={m.id} />
                                <BottoneInvio className={`${bottone} w-full sm:w-auto`}>✓ Confermo la presenza</BottoneInvio>
                              </form>
                              <form action={disdici}>
                                <input type="hidden" name="id" value={m.id} />
                                <BottoneInvio className={`${bottoneSecondario} w-full sm:w-auto`}>Non vengo</BottoneInvio>
                              </form>
                            </div>
                          </>
                        )}
                      </Card>
                    );
                  }

                  if (m.stato === "confermata") {
                    return (
                      <Card key={m.id}>
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">{titolo}</p>
                            <p className="mt-1 text-sm text-emerald-700">
                              ✓ {m.tipo === "abbonamento" ? "Presenza confermata" : "Ingresso prenotato"}
                            </p>
                          </div>
                          <form action={disdici}>
                            <input type="hidden" name="id" value={m.id} />
                            <BottoneInvio className={bottoneSecondario}>Disdici</BottoneInvio>
                          </form>
                        </div>
                      </Card>
                    );
                  }

                  // liberata
                  const liberi = liberiIn(l);
                  return (
                    <Card key={m.id} className="bg-slate-50">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold">{titolo}</p>
                          <p className="mt-1 text-sm text-slate-600">
                            Posto liberato. {liberi > 0 ? `Ci sono ancora ${liberi} posti liberi.` : "Ora la lezione è al completo."}
                          </p>
                        </div>
                        {liberi > 0 && (
                          <form action={prenota}>
                            <input type="hidden" name="lezione_id" value={l.id} />
                            <BottoneInvio className={bottoneSecondario}>Riprendi il posto</BottoneInvio>
                          </form>
                        )}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {/* ---------- Prenota un ingresso ---------- */}
            <h2 className="mb-1 text-lg font-semibold">Prenota un ingresso singolo</h2>
            <p className="mb-3 text-sm text-slate-600">Le lezioni dei prossimi 7 giorni con posti disponibili.</p>
            {prenotabili.length === 0 ? (
              <Card className="mb-10">
                <p className="text-sm text-slate-600">Nessuna altra lezione in programma nei prossimi giorni.</p>
              </Card>
            ) : (
              <ul className="mb-10 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                {prenotabili.map((l) => {
                  const liberi = liberiIn(l);
                  return (
                    <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-medium">
                          {l.corsi?.nome} · {etichettaGiorno(l.inizio)} alle {oraDi(l.inizio)}
                        </p>
                        <p className={`text-sm ${liberi > 0 ? "text-slate-600" : "text-red-700"}`}>
                          {liberi > 0 ? `${liberi} ${liberi === 1 ? "posto libero" : "posti liberi"}` : "Al completo"}
                        </p>
                      </div>
                      {liberi > 0 && (
                        <form action={prenota}>
                          <input type="hidden" name="lezione_id" value={l.id} />
                          <BottoneInvio className={bottone}>Prenota</BottoneInvio>
                        </form>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            {/* ---------- Abbonamento ---------- */}
            {abbonamenti.length > 0 && (
              <>
                <h2 className="mb-3 text-lg font-semibold">Il tuo abbonamento</h2>
                <div className="space-y-3">
                  {abbonamenti.map((a) => {
                    const orari = a.abbonamenti_orari
                      .map((x) => x.orari_corso)
                      .filter((o): o is NonNullable<typeof o> => !!o)
                      .sort((x, y) => x.giorno_settimana - y.giorno_settimana);
                    return (
                      <Card key={a.id}>
                        <div className="flex items-start justify-between gap-3">
                          <p className="font-semibold">{a.tipo}</p>
                          {!a.pagato && <Badge tono="attenzione">da saldare</Badge>}
                        </div>
                        <p className="text-sm text-slate-600">
                          Valido dal {formattaData(a.data_inizio)} al {formattaData(a.data_fine)}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {orari.map((o, i) => (
                            <span key={i} className="rounded-lg bg-schiuma px-3 py-1.5 text-sm">
                              {o.corsi?.nome} · <strong>{nomeGiorno(o.giorno_settimana)}</strong> alle {ora(o.ora_inizio)}
                            </span>
                          ))}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </>
            )}
          </>
        )}
      </main>
    </>
  );
}
