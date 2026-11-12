import { BottoneWhatsApp, testiWhatsApp } from "@/components/WhatsApp";
import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { etichettaGiorno, oraDi } from "@/lib/formato";
import { inviaAvviso, ricordaConferme } from "./actions";
import { GeneraChiavi } from "./GeneraChiavi";
import { pushConfigurate } from "@/lib/push";

type Inviata = {
  id: string;
  titolo: string;
  testo: string;
  tipo: string;
  creata_il: string;
  letta_il: string | null;
  profili: { nome: string; cognome: string; telefono: string | null } | null;
};

type InSospeso = {
  id: string;
  lezioni: { inizio: string; scadenza_conferma: string; annullata: boolean; corsi: { nome: string } | null };
  profili: { nome: string; cognome: string; telefono: string | null; canale_notifica: string } | null;
};

// Modelli pronti: un tocco e il testo è già scritto
const MODELLI: Record<string, { titolo: string; testo: string; tipo: string; destinatari: string }> = {
  pagamento: {
    titolo: "Promemoria pagamento",
    testo: "Ti ricordiamo di saldare il tuo abbonamento in reception. Grazie!",
    tipo: "pagamento",
    destinatari: "da_pagare",
  },
  chiusura: {
    titolo: "Piscina chiusa",
    testo: "Ti informiamo che la piscina resterà chiusa il giorno … Le lezioni saranno recuperate.",
    tipo: "sistema",
    destinatari: "tutti",
  },
  rinnovo: {
    titolo: "Il tuo abbonamento sta per scadere",
    testo: "Passa in reception per rinnovarlo e non perdere il tuo posto fisso.",
    tipo: "scadenza",
    destinatari: "in_scadenza",
  },
};

export default async function AvvisiPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo } = await richiediStaff();
  const sp = await searchParams;
  const modello = MODELLI[parametro(sp.modello) ?? ""] ?? { titolo: "", testo: "", tipo: "promemoria", destinatari: "tutti" };

  const adesso = new Date();
  const fra48 = new Date(adesso.getTime() + 48 * 3_600_000);
  const [clientiRes, inviateRes, sospesoRes] = await Promise.all([
    supabase.from("profili").select("id, nome, cognome").eq("ruolo", "utente").eq("attivo", true).order("cognome"),
    supabase
      .from("notifiche")
      .select("id, titolo, testo, tipo, creata_il, letta_il, profili!notifiche_utente_id_fkey(nome, cognome, telefono)")
      .order("creata_il", { ascending: false })
      .limit(40),
    supabase
      .from("prenotazioni")
      .select(
        "id, lezioni!inner(inizio, scadenza_conferma, annullata, corsi(nome)), profili(nome, cognome, telefono, canale_notifica)",
      )
      .eq("stato", "riservata")
      .eq("lezioni.annullata", false)
      .gt("lezioni.scadenza_conferma", adesso.toISOString())
      .lte("lezioni.scadenza_conferma", fra48.toISOString()),
  ]);
  const inSospeso = ((sospesoRes.data ?? []) as unknown as InSospeso[]).sort(
    (a, b) => a.lezioni.inizio.localeCompare(b.lezioni.inizio) || (a.profili?.cognome ?? "").localeCompare(b.profili?.cognome ?? ""),
  );
  const suWhatsApp = inSospeso.filter((p) => p.profili?.canale_notifica === "whatsapp").length;
  const pushOk = pushConfigurate() && Boolean(process.env.PUSH_SEGRETO);
  const clienti = (clientiRes.data ?? []) as unknown as { id: string; nome: string; cognome: string }[];
  const inviate = (inviateRes.data ?? []) as unknown as Inviata[];

  return (
    <>
      <Titolo>Avvisi</Titolo>
      <p className="-mt-4 mb-6 max-w-2xl text-sm text-slate-600">
        Gli avvisi compaiono ai clienti nella sezione <strong>Avvisi</strong> dell&apos;app, con un pallino rosso finché non li leggono.
        Accanto a ogni avviso inviato trovi il pulsante <strong>WhatsApp</strong> per mandare lo stesso messaggio anche lì.
        Ogni mattina il sistema manda anche da solo il promemoria &quot;conferma entro le 17&quot; e gli avvisi di scadenza abbonamento.
      </p>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      {/* ---------- Conferme in sospeso ---------- */}
      <Card className={`mb-6 ${inSospeso.length > 0 ? "border-corsia" : ""}`}>
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Ricorda di confermare</h2>
            <p className="text-sm text-slate-600">
              {inSospeso.length === 0
                ? "Nessuno deve confermare nelle prossime 48 ore."
                : `${inSospeso.length} ${inSospeso.length === 1 ? "persona deve" : "persone devono"} ancora confermare${
                    suWhatsApp > 0 ? `, di cui ${suWhatsApp} preferisce WhatsApp` : ""
                  }.`}
            </p>
          </div>
          {inSospeso.length > 0 && (
            <form action={ricordaConferme}>
              <input type="hidden" name="prenotazione_id" value="tutte" />
              <BottoneInvio className={`${bottone} w-full sm:w-auto`}>🔔 Ricorda a tutti dall&apos;app</BottoneInvio>
            </form>
          )}
        </div>
        {inSospeso.length > 0 && (
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
            {inSospeso.map((p) => {
              const l = p.lezioni;
              const lezione = `${l.corsi?.nome ?? "lezione"} ${etichettaGiorno(l.inizio).toLowerCase()} alle ${oraDi(l.inizio)}`;
              const preferisceWa = p.profili?.canale_notifica === "whatsapp";
              return (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0">
                    <strong>{p.profili ? `${p.profili.cognome} ${p.profili.nome}` : "—"}</strong>{" "}
                    <span className="text-xs text-slate-500">· preferisce {preferisceWa ? "💬 WhatsApp" : "🔔 app"}</span>
                    <span className="block text-xs text-slate-500">
                      {lezione} · entro le {oraDi(l.scadenza_conferma)}
                    </span>
                  </span>
                  <span className="flex shrink-0 gap-2">
                    <BottoneWhatsApp
                      telefono={p.profili?.telefono}
                      etichetta={preferisceWa ? "WhatsApp" : ""}
                      testo={testiWhatsApp.conferma(p.profili?.nome ?? "", lezione, oraDi(l.scadenza_conferma))}
                    />
                    <form action={ricordaConferme}>
                      <input type="hidden" name="prenotazione_id" value={p.id} />
                      <BottoneInvio className={bottoneSecondario}>{preferisceWa ? "🔔" : "🔔 App"}</BottoneInvio>
                    </form>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <Card>
          <div className="mb-4 flex flex-wrap gap-2 text-sm">
            <span className="text-slate-500">Modelli pronti:</span>
            <a href="/admin/avvisi?modello=pagamento" className="text-vasca underline">💶 Pagamento</a>
            <a href="/admin/avvisi?modello=rinnovo" className="text-vasca underline">🪪 Rinnovo</a>
            <a href="/admin/avvisi?modello=chiusura" className="text-vasca underline">🚧 Chiusura</a>
          </div>

          {/* key: quando cambi modello il modulo si ricompila con i nuovi testi */}
          <form key={parametro(sp.modello) ?? "vuoto"} action={inviaAvviso} className="space-y-4">
            <fieldset>
              <legend className={etichetta}>A chi</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {[
                  ["tutti", "Tutti i clienti"],
                  ["abbonati", "Chi ha un abbonamento attivo"],
                  ["da_pagare", "Chi deve ancora pagare"],
                  ["in_scadenza", "Abbonamento in scadenza (14 giorni)"],
                  ["uno", "Un cliente…"],
                ].map(([valore, testo]) => (
                  <label key={valore} className="flex min-h-[44px] items-center gap-2 rounded-lg border border-slate-200 px-3 text-sm has-[:checked]:border-acqua has-[:checked]:bg-schiuma">
                    <input type="radio" name="destinatari" value={valore} defaultChecked={valore === modello.destinatari} />
                    {testo}
                  </label>
                ))}
              </div>
            </fieldset>
            <div>
              <label className={etichetta} htmlFor="utente_id">Cliente (solo se hai scelto &quot;Un cliente&quot;)</label>
              <select id="utente_id" name="utente_id" className={campo} defaultValue="">
                <option value="">—</option>
                {clienti.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.cognome} {c.nome}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={etichetta} htmlFor="titolo">Titolo</label>
              <input id="titolo" name="titolo" required maxLength={80} defaultValue={modello.titolo} className={campo} />
            </div>
            <div>
              <label className={etichetta} htmlFor="testo">Messaggio</label>
              <textarea id="testo" name="testo" rows={3} maxLength={500} defaultValue={modello.testo} className={campo} />
            </div>
            <div>
              <label className={etichetta} htmlFor="tipo">Tipo</label>
              <select id="tipo" name="tipo" className={campo} defaultValue={modello.tipo}>
                <option value="promemoria">Promemoria</option>
                <option value="pagamento">Pagamento</option>
                <option value="scadenza">Scadenza</option>
                <option value="sistema">Comunicazione della piscina</option>
              </select>
            </div>
            <BottoneInvio className={`${bottone} w-full sm:w-auto`}>Invia avviso</BottoneInvio>
          </form>
        </Card>

        <section>
          {profilo.ruolo === "admin" && (
            <Card className="mb-6">
              <h2 className="mb-1 font-semibold">Notifiche sul telefono</h2>
              {pushOk ? (
                <p className="text-sm text-emerald-700">
                  ✓ Configurate. Ogni avviso arriva anche come notifica a chi le ha attivate (Avvisi o Profilo nella sua app).
                </p>
              ) : (
                <div className="space-y-3 text-sm text-slate-700">
                  <p>Per attivarle servono 4 impostazioni su Vercel (Settings → Environment Variables):</p>
                  <ol className="list-decimal space-y-1 pl-5">
                    <li>
                      <strong>VAPID_PUBLIC_KEY</strong> e <strong>VAPID_PRIVATE_KEY</strong>: generale qui sotto;
                    </li>
                    <li>
                      <strong>VAPID_SUBJECT</strong>: <code>mailto:</code> seguito dalla tua email;
                    </li>
                    <li>
                      <strong>PUSH_SEGRETO</strong>: il codice mostrato dallo script SQL 0006.
                    </li>
                  </ol>
                  <p>Poi fai Redeploy.</p>
                  <GeneraChiavi />
                </div>
              )}
            </Card>
          )}
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">Inviati di recente</h2>
          {inviate.length === 0 ? (
            <p className="text-sm text-slate-500">Nessun avviso ancora.</p>
          ) : (
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white text-sm">
              {inviate.map((n) => (
                <li key={n.id} className="px-4 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-medium">{n.titolo}</span>
                    {n.letta_il ? <Badge tono="ok">letto</Badge> : <Badge>non letto</Badge>}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-500">
                      {n.profili ? `${n.profili.cognome} ${n.profili.nome}` : "—"} · {etichettaGiorno(n.creata_il)} {oraDi(n.creata_il)}
                    </p>
                    <BottoneWhatsApp
                      telefono={n.profili?.telefono}
                      testo={testiWhatsApp.avviso(n.profili?.nome ?? "", n.titolo, n.testo)}
                      etichetta=""
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
