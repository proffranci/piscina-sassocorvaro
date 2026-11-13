"use client";

import { useState } from "react";
import { reimpostaPassword } from "../actions";
import { linkWhatsApp } from "@/components/WhatsApp";

// "Ha dimenticato la password": un tocco e nasce una password temporanea.
// La mostriamo solo qui, una volta: non finisce né nell'indirizzo né nei log.
export function ReimpostaPassword({
  id,
  nome,
  nomeUtente,
  telefono,
}: {
  id: string;
  nome: string;
  nomeUtente: string | null;
  telefono: string | null;
}) {
  const [password, setPassword] = useState<string | null>(null);
  const [scelta, setScelta] = useState("");
  const [errore, setErrore] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  async function esegui(personalizzata: boolean) {
    if (personalizzata && scelta.length < 8) {
      setErrore("La password deve avere almeno 8 caratteri.");
      return;
    }
    if (!confirm(`Reimpostare la password di ${nome}? Quella attuale smetterà di funzionare.`)) return;
    setOccupato(true);
    setErrore(null);
    const esito = await reimpostaPassword(id, personalizzata ? scelta : undefined);
    setOccupato(false);
    if (esito.ok) {
      setPassword(esito.password);
      setScelta("");
    } else setErrore(esito.errore);
  }

  const testo = password
    ? `Ciao ${nome}! Ecco i dati per entrare nell'app della Piscina di Sassocorvaro:\nNome utente: ${nomeUtente ?? "(la tua email)"}\nPassword temporanea: ${password}\nAl primo accesso ti chiederà di sceglierne una tua.`
    : "";
  const wa = password ? linkWhatsApp(telefono, testo) : null;

  const btn =
    "inline-flex min-h-[44px] items-center justify-center rounded-lg px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 sm:min-h-0";

  if (password) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-emerald-700">✓ Password reimpostata. Comunicala a {nome}: al primo accesso dovrà cambiarla.</p>
        <div className="flex items-center gap-2 rounded-lg bg-schiuma px-3 py-2">
          <code className="flex-1 select-all text-lg font-semibold tracking-wide">{password}</code>
          <button type="button" onClick={() => navigator.clipboard?.writeText(password)} className={`${btn} border border-slate-300 bg-white`}>
            Copia
          </button>
        </div>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={`${btn} w-full bg-[#25D366] font-semibold text-white`}>
            Manda su WhatsApp
          </a>
        )}
        <p className="text-xs text-slate-500">Quando chiudi questa pagina la password non sarà più visibile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button type="button" onClick={() => esegui(false)} disabled={occupato} className={`${btn} w-full bg-acqua font-semibold text-white hover:bg-vasca`}>
        {occupato ? "Un attimo…" : "🔑 Genera password temporanea"}
      </button>
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600">Oppure scegli tu la password</summary>
        <div className="mt-2 flex gap-2">
          <input
            value={scelta}
            onChange={(e: { target: { value: string } }) => setScelta(e.target.value)}
            minLength={8}
            autoComplete="off"
            placeholder="almeno 8 caratteri"
            className="min-h-[44px] min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-base sm:min-h-0 sm:text-sm"
          />
          <button type="button" onClick={() => esegui(true)} disabled={occupato} className={`${btn} border border-slate-300 bg-white`}>
            Imposta
          </button>
        </div>
      </details>
      {errore && <p className="text-sm text-red-700">{errore}</p>}
    </div>
  );
}
