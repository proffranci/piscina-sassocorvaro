import Link from "next/link";
import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Badge, Card, bottone, bottoneSecondario, parametro, type SearchParams } from "@/components/ui";
import { richiediUtente } from "@/lib/sessione";
import { data as formattaData, etichettaGiorno, oraDi } from "@/lib/formato";
import { conferma, disdici, prenota } from "./actions";
import { SELECT_MIE, postiLiberi, type MiaPrenotazione } from "./dati";

export default async function LezioniCliente({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo } = await richiediUtente();
  const sp = await searchParams;
  const adesso = new Date();
  const oggiData = adesso.toISOString().slice(0, 10);
  const fra7 = new Date(adesso.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);

  // La Row Level Security fa sì che qui arrivino SOLO i dati di questa persona
  const [mieRes, avvisiRes, scadenzaRes] = await Promise.all([
    supabase
      .from("prenotazioni")
      .select(SELECT_MIE)
      .eq("utente_id", profilo.id)
      .neq("stato", "annullata")
      .gte("lezioni.inizio", adesso.toISOString()),
    supabase.from("notifiche").select("*", { count: "exact", head: true }).eq("utente_id", profilo.id).is("letta_il", null),
    supabase.from("abbonamenti").select("tipo, data_fine").gte("data_fine", oggiData).lte("data_fine", fra7).order("data_fine").limit(1),
  ]);

  const mie = ((mieRes.data ?? []) as unknown as MiaPrenotazione[]).sort((a, b) =>
    a.lezioni.inizio.localeCompare(b.lezioni.inizio),
  );
  const liberiIn = await postiLiberi(supabase, mie.filter((m) => m.stato === "liberata").map((m) => m.lezioni));
  const daConfermare = mie.filter((m) => m.stato === "riservata" && new Date(m.lezioni.scadenza_conferma) > adesso);
  const nonLetti = avvisiRes.count ?? 0;
  const inScadenza = ((scadenzaRes.data ?? []) as { tipo: string; data_fine: string }[])[0];

  return (
    <>
      <h1 className="text-2xl font-bold">Ciao {profilo.nome || "!"} 👋</h1>
      <p className="mb-5 text-slate-600">
        {daConfermare.length > 0
          ? `Hai ${daConfermare.length === 1 ? "una lezione" : `${daConfermare.length} lezioni`} da confermare.`
          : "Ecco le tue prossime lezioni."}
      </p>

      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      {/* Promemoria in evidenza */}
      {(nonLetti > 0 || inScadenza) && (
        <div className="mb-6 space-y-2">
          {nonLetti > 0 && (
            <Link href="/area/avvisi" className="flex items-center justify-between rounded-xl bg-abisso px-4 py-3 text-sm text-white">
              <span>🔔 Hai {nonLetti === 1 ? "un avviso nuovo" : `${nonLetti} avvisi nuovi`}</span>
              <span aria-hidden="true">→</span>
            </Link>
          )}
          {inScadenza && (
            <Link href="/area/profilo" className="flex items-center justify-between rounded-xl border border-corsia bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <span>
                🪪 Il tuo abbonamento scade {inScadenza.data_fine === oggiData ? "oggi" : `il ${formattaData(inScadenza.data_fine)}`}
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          )}
        </div>
      )}

      {!profilo.attivo ? (
        <Card>
          <p className="text-sm">Il tuo account è disattivato. Per informazioni contatta la reception.</p>
        </Card>
      ) : (
        <>
        <h2 className="mb-3 text-lg font-semibold">Le tue prossime lezioni</h2>
        {mie.length === 0 ? (
          <Card className="mb-8">
            <p className="text-sm text-slate-600">Nessuna lezione prenotata.</p>
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
                        {m.da_confermare_staff ? (
                          <p className="mt-1 text-sm text-amber-800">⏳ Prenotato, in attesa di conferma della reception</p>
                        ) : (
                          <p className="mt-1 text-sm text-emerald-700">
                            ✓ {m.tipo === "abbonamento" ? "Presenza confermata" : "Prenotazione confermata"}
                          </p>
                        )}
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

          <Link href="/area/prenota" className={`${bottoneSecondario} w-full`}>
            + Prenota un ingresso singolo
          </Link>
        </>
      )}
    </>
  );
}
