"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { bottone, bottoneSecondario, campo } from "@/components/ui";
import { ESITI, type EsitoIngresso } from "@/lib/ingresso";
import { registraIngresso } from "./actions";

type Modo = "fotocamera" | "lettore" | "nfc";

// Tipi minimi per le API del browser che TypeScript non conosce ancora
type Rilevatore = { detect: (sorgente: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
type CostruttoreRilevatore = new (opzioni: { formats: string[] }) => Rilevatore;
type LettoreNfc = {
  scan: (opzioni?: { signal?: AbortSignal }) => Promise<void>;
  onreading: ((evento: { serialNumber: string }) => void) | null;
  onreadingerror: (() => void) | null;
};
type CostruttoreNfc = new () => LettoreNfc;
type FinestraMagica = Window & { BarcodeDetector?: CostruttoreRilevatore; NDEFReader?: CostruttoreNfc };

// Un "bip" senza file audio: acuto se va bene, grave se c'è un problema
function bip(buono: boolean) {
  try {
    const W = window as Window & { webkitAudioContext?: typeof AudioContext };
    const Ctx = window.AudioContext ?? W.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const suona = (frequenza: number, da: number, durata: number) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = frequenza;
      g.gain.value = 0.15;
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + da);
      o.stop(ctx.currentTime + da + durata);
    };
    if (buono) suona(1320, 0, 0.15);
    else {
      suona(330, 0, 0.18);
      suona(330, 0.25, 0.18);
    }
    setTimeout(() => ctx.close(), 800);
  } catch {
    // niente audio: pazienza
  }
  navigator.vibrate?.(buono ? 80 : [120, 80, 120]);
}

export function LettoreIngresso() {
  const router = useRouter();
  const [modo, setModo] = useState<Modo>("fotocamera");
  const [risultato, setRisultato] = useState<(EsitoIngresso & { codice: string }) | null>(null);
  const [errore, setErrore] = useState<string | null>(null);
  const [inCorso, setInCorso] = useState(false);
  const [statoCamera, setStatoCamera] = useState<"spenta" | "accesa" | "negata" | "assente">("spenta");
  const [statoNfc, setStatoNfc] = useState<"spento" | "attivo" | "non_supportato" | "errore">("spento");
  const [nfcPossibile, setNfcPossibile] = useState(false);

  const video = useRef<HTMLVideoElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const flusso = useRef<MediaStream | null>(null);
  const campoLettore = useRef<HTMLInputElement>(null);
  const occupato = useRef(false);
  const ultimo = useRef<{ codice: string; quando: number }>({ codice: "", quando: 0 });
  const nfcStop = useRef<AbortController | null>(null);

  useEffect(() => {
    setNfcPossibile(typeof window !== "undefined" && "NDEFReader" in window);
  }, []);

  // ---------- Invio del codice al database ----------
  const invia = useCallback(
    async (codice: string, forza = false) => {
      const pulito = codice.trim();
      if (!pulito || occupato.current) return;
      // Lo stesso QR davanti alla fotocamera per qualche secondo: una lettura sola
      if (!forza && pulito === ultimo.current.codice && Date.now() - ultimo.current.quando < 6000) return;
      ultimo.current = { codice: pulito, quando: Date.now() };
      occupato.current = true;
      setInCorso(true);
      setErrore(null);
      try {
        const r = await registraIngresso(pulito, forza);
        if ("errore" in r) {
          setErrore(r.errore);
          setRisultato(null);
          bip(false);
        } else {
          setRisultato({ ...r, codice: pulito });
          bip(r.esito === "ok" || r.esito === "forzato");
          router.refresh(); // aggiorna l'elenco "Entrati oggi"
        }
      } catch {
        setErrore("Connessione assente: riprova.");
        bip(false);
      } finally {
        occupato.current = false;
        setInCorso(false);
        if (campoLettore.current) {
          campoLettore.current.value = "";
          campoLettore.current.focus();
        }
      }
    },
    [router],
  );

  // ---------- Fotocamera ----------
  const spegniCamera = useCallback(() => {
    flusso.current?.getTracks().forEach((t) => t.stop());
    flusso.current = null;
    setStatoCamera((s) => (s === "accesa" ? "spenta" : s));
  }, []);

  const accendiCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatoCamera("assente");
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      flusso.current = s;
      if (video.current) {
        video.current.srcObject = s;
        await video.current.play();
      }
      setStatoCamera("accesa");
    } catch (e) {
      setStatoCamera(e instanceof DOMException && e.name === "NotAllowedError" ? "negata" : "assente");
    }
  }, []);

  useEffect(() => {
    if (modo !== "fotocamera" || statoCamera !== "accesa") return;
    let fermo = false;
    let timer: ReturnType<typeof setTimeout>;
    const W = window as FinestraMagica;
    let rilevatore: Rilevatore | null = null;
    try {
      rilevatore = W.BarcodeDetector ? new W.BarcodeDetector({ formats: ["qr_code"] }) : null;
    } catch {
      rilevatore = null;
    }
    // Dove il browser non sa leggere i QR da solo (es. iPhone) usiamo jsQR
    let jsQR: ((dati: Uint8ClampedArray, l: number, a: number) => { data: string } | null) | null = null;
    if (!rilevatore) import("jsqr").then((m) => (jsQR = m.default)).catch(() => setErrore("Lettore QR non disponibile su questo browser."));

    const giro = async () => {
      if (fermo) return;
      const v = video.current;
      if (v && v.readyState >= 2 && !occupato.current) {
        try {
          let letto: string | null = null;
          if (rilevatore) {
            const codici = await rilevatore.detect(v);
            letto = codici[0]?.rawValue ?? null;
          } else if (jsQR && tela.current) {
            const c = tela.current;
            // Immagine piccola: più veloce sui telefoni vecchi
            const scala = Math.min(1, 480 / (v.videoWidth || 480));
            c.width = Math.round((v.videoWidth || 480) * scala);
            c.height = Math.round((v.videoHeight || 360) * scala);
            const ctx = c.getContext("2d", { willReadFrequently: true });
            if (ctx) {
              ctx.drawImage(v, 0, 0, c.width, c.height);
              const img = ctx.getImageData(0, 0, c.width, c.height);
              letto = jsQR(img.data, c.width, c.height)?.data ?? null;
            }
          }
          if (letto) await invia(letto);
        } catch {
          // un fotogramma storto: si riprova al prossimo giro
        }
      }
      timer = setTimeout(giro, 250);
    };
    giro();
    return () => {
      fermo = true;
      clearTimeout(timer);
    };
  }, [modo, statoCamera, invia]);

  // Spegni la fotocamera quando cambi modo o esci dalla pagina
  useEffect(() => {
    if (modo !== "fotocamera") spegniCamera();
    if (modo !== "nfc") {
      nfcStop.current?.abort();
      nfcStop.current = null;
      setStatoNfc((s) => (s === "attivo" ? "spento" : s));
    }
    if (modo === "lettore") setTimeout(() => campoLettore.current?.focus(), 50);
  }, [modo, spegniCamera]);
  useEffect(() => () => {
    flusso.current?.getTracks().forEach((t) => t.stop());
    nfcStop.current?.abort();
  }, []);

  // ---------- NFC (solo Chrome su Android) ----------
  const attivaNfc = async () => {
    const W = window as FinestraMagica;
    if (!W.NDEFReader) {
      setStatoNfc("non_supportato");
      return;
    }
    try {
      const lettore = new W.NDEFReader();
      const stop = new AbortController();
      nfcStop.current = stop;
      lettore.onreading = (e) => {
        if (e.serialNumber) invia(e.serialNumber);
      };
      lettore.onreadingerror = () => setErrore("Tessera non leggibile: riprova avvicinandola di più.");
      await lettore.scan({ signal: stop.signal });
      setStatoNfc("attivo");
    } catch {
      setStatoNfc("errore");
    }
  };

  const stile = risultato ? ESITI[risultato.esito] : null;

  return (
    <div className="space-y-4">
      {/* Scelta del modo */}
      <div className="grid grid-cols-3 gap-2" role="tablist">
        {(
          [
            ["fotocamera", "📷 Fotocamera"],
            ["lettore", "⌨️ Lettore USB"],
            ["nfc", "📶 NFC"],
          ] as [Modo, string][]
        ).map(([m, t]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={`min-h-[44px] rounded-xl border px-2 text-sm font-medium ${modo === m ? "border-abisso bg-abisso text-white" : "border-slate-300 bg-white"}`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Fotocamera */}
      {modo === "fotocamera" && (
        <div className="overflow-hidden rounded-2xl bg-abisso">
          <div className="relative aspect-[4/3] w-full">
            <video ref={video} playsInline muted className={`h-full w-full object-cover ${statoCamera === "accesa" ? "" : "hidden"}`} />
            <canvas ref={tela} className="hidden" />
            {statoCamera === "accesa" ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="h-3/5 w-auto aspect-square rounded-2xl border-4 border-white/80 shadow-[0_0_0_9999px_rgba(11,46,69,0.35)]" />
              </div>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-white">
                {statoCamera === "negata" && <p className="text-sm">Permesso negato: consenti la fotocamera nelle impostazioni del browser.</p>}
                {statoCamera === "assente" && <p className="text-sm">Fotocamera non disponibile su questo dispositivo: usa un lettore USB.</p>}
                <button type="button" onClick={accendiCamera} className={bottone}>
                  Accendi la fotocamera
                </button>
              </div>
            )}
          </div>
          {statoCamera === "accesa" && (
            <div className="flex items-center justify-between px-4 py-2 text-xs text-white/80">
              <span>Inquadra il QR del cliente</span>
              <button type="button" onClick={spegniCamera} className="underline">
                Spegni
              </button>
            </div>
          )}
        </div>
      )}

      {/* Lettore USB / Bluetooth (QR o RFID): scrive il codice come una tastiera e preme Invio */}
      {modo === "lettore" && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            invia(campoLettore.current?.value ?? "");
          }}
          className="rounded-2xl border border-slate-200 bg-white p-4"
        >
          <label className="mb-1 block text-sm font-medium" htmlFor="codice-letto">
            Passa il QR o la tessera sul lettore
          </label>
          <div className="flex gap-2">
            <input
              ref={campoLettore}
              id="codice-letto"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Il codice compare qui…"
              className={`${campo} font-mono`}
            />
            <button type="submit" className={bottoneSecondario} disabled={inCorso}>
              Invio
            </button>
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Funziona con qualsiasi lettore che &quot;scrive&quot; il codice (lettori QR da banco, lettori RFID USB). Il campo deve restare
            selezionato.
          </p>
        </form>
      )}

      {/* NFC */}
      {modo === "nfc" && (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm">
          {!nfcPossibile || statoNfc === "non_supportato" ? (
            <p>
              Questo browser non legge l&apos;NFC. Funziona con <strong>Chrome su un telefono Android</strong> con NFC acceso. Su iPhone e
              computer usa la fotocamera o un lettore USB.
            </p>
          ) : statoNfc === "attivo" ? (
            <p className="font-medium text-emerald-700">📶 In ascolto: avvicina la tessera o il braccialetto al retro del telefono.</p>
          ) : (
            <>
              <p className="mb-3">Avvicina tessere e braccialetti NFC al telefono per registrare l&apos;ingresso.</p>
              {statoNfc === "errore" && <p className="mb-3 text-red-700">NFC non attivato: controlla che sia acceso nelle impostazioni del telefono.</p>}
              <button type="button" onClick={attivaNfc} className={bottone}>
                Attiva NFC
              </button>
            </>
          )}
        </div>
      )}

      {/* Risultato */}
      {inCorso && <p className="text-center text-sm text-slate-500">Controllo in corso…</p>}
      {errore && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{errore}</p>}
      {risultato && stile && (
        <div className={`rounded-2xl p-5 text-white shadow-lg ${stile.colore}`} role="status" aria-live="assertive">
          <p className="text-sm font-semibold uppercase tracking-wide opacity-90">
            {stile.icona} {stile.titolo}
          </p>
          <p className="mt-1 text-3xl font-bold">{risultato.nome ?? "Sconosciuto"}</p>
          {risultato.lezione && <p className="mt-1 text-lg">{risultato.lezione}</p>}
          {risultato.messaggi.length > 0 && (
            <ul className="mt-3 space-y-1 text-base">
              {risultato.messaggi.map((m) => (
                <li key={m}>• {m}</li>
              ))}
            </ul>
          )}
          {risultato.abbonamenti.length > 0 && (
            <p className="mt-3 text-sm opacity-90">
              {risultato.abbonamenti.map((a) => `${a.tipo} ${a.pagato ? "✓ pagato" : "✗ da pagare"}`).join(" · ")}
            </p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {risultato.esito === "negato" && risultato.utente_id && (
              <button
                type="button"
                onClick={() => invia(risultato.codice, true)}
                className="min-h-[44px] rounded-lg bg-white px-4 text-sm font-semibold text-red-700"
              >
                Fallo entrare comunque
              </button>
            )}
            {risultato.utente_id && (
              <Link href={`/admin/utenti/${risultato.utente_id}`} className="inline-flex min-h-[44px] items-center rounded-lg border border-white/50 px-4 text-sm">
                Scheda cliente
              </Link>
            )}
            <button type="button" onClick={() => setRisultato(null)} className="min-h-[44px] rounded-lg border border-white/50 px-4 text-sm">
              Prossimo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
