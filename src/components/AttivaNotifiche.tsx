"use client";

import { useEffect, useState } from "react";
import { notificaDiProva, rimuoviIscrizione, salvaIscrizione } from "@/app/area/actions";

type Stato =
  | "verifica" // stiamo controllando cosa supporta il telefono
  | "non_supportate" // browser troppo vecchio o senza notifiche
  | "iphone_da_installare" // iPhone: funzionano solo con l'app sulla schermata Home
  | "bloccate" // l'utente ha detto "Non consentire"
  | "da_attivare"
  | "attive";

// La chiave pubblica arriva come testo "base64url": il browser la vuole in byte
function chiaveInByte(base64: string) {
  const riempita = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const grezza = atob(riempita);
  const byte = new Uint8Array(grezza.length);
  for (let i = 0; i < grezza.length; i++) byte[i] = grezza.charCodeAt(i);
  return byte;
}

function inByte64(buffer: ArrayBuffer | null) {
  if (!buffer) return "";
  let s = "";
  new Uint8Array(buffer).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function nomeDispositivo() {
  const ua = navigator.userAgent;
  const sistema = /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Dispositivo";
  const browser = /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox/.test(ua) ? "Firefox" : /Edg/.test(ua) ? "Edge" : /Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "browser";
  return `${sistema} · ${browser}`;
}

export function AttivaNotifiche({ chiavePubblica }: { chiavePubblica: string | null }) {
  const [stato, setStato] = useState<Stato>("verifica");
  const [messaggio, setMessaggio] = useState<string | null>(null);
  const [occupato, setOccupato] = useState(false);

  useEffect(() => {
    (async () => {
      const iphone = /iPhone|iPad|iPod/.test(navigator.userAgent);
      const installata =
        window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
      const supportate = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

      if (!supportate) return setStato(iphone && !installata ? "iphone_da_installare" : "non_supportate");
      if (Notification.permission === "denied") return setStato("bloccate");

      const reg = await navigator.serviceWorker.register("/sw.js");
      const iscrizione = await reg.pushManager.getSubscription();
      setStato(iscrizione && Notification.permission === "granted" ? "attive" : "da_attivare");
    })().catch(() => setStato("non_supportate"));
  }, []);

  async function attiva() {
    if (!chiavePubblica) return;
    setOccupato(true);
    setMessaggio(null);
    try {
      const permesso = await Notification.requestPermission();
      if (permesso !== "granted") {
        setStato(permesso === "denied" ? "bloccate" : "da_attivare");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const iscrizione =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chiaveInByte(chiavePubblica) }));

      const esito = await salvaIscrizione({
        endpoint: iscrizione.endpoint,
        p256dh: inByte64(iscrizione.getKey("p256dh")),
        auth: inByte64(iscrizione.getKey("auth")),
        dispositivo: nomeDispositivo(),
      });
      if (!esito.ok) {
        setMessaggio(esito.errore);
        return;
      }
      setStato("attive");
      await notificaDiProva();
      setMessaggio("Fatto! Dovresti ricevere subito una notifica di prova.");
    } catch {
      setMessaggio("Non sono riuscito ad attivare le notifiche su questo dispositivo.");
    } finally {
      setOccupato(false);
    }
  }

  async function disattiva() {
    setOccupato(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/sw.js");
      const iscrizione = await reg?.pushManager.getSubscription();
      if (iscrizione) {
        await rimuoviIscrizione(iscrizione.endpoint);
        await iscrizione.unsubscribe();
      }
      setStato("da_attivare");
      setMessaggio("Notifiche disattivate su questo dispositivo.");
    } finally {
      setOccupato(false);
    }
  }

  async function prova() {
    setOccupato(true);
    const { inviate } = await notificaDiProva();
    setMessaggio(inviate > 0 ? "Notifica di prova inviata." : "Nessun dispositivo raggiunto: prova a disattivare e riattivare.");
    setOccupato(false);
  }

  if (stato === "verifica") return null;

  const pulsante =
    "inline-flex min-h-[44px] items-center justify-center rounded-lg px-4 py-2 text-base font-semibold transition-colors disabled:opacity-50 sm:min-h-0 sm:text-sm";

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="font-semibold">🔔 Notifiche sul telefono</p>

      {!chiavePubblica && <p className="mt-1 text-sm text-slate-600">Le notifiche non sono ancora state attivate dalla piscina.</p>}

      {chiavePubblica && stato === "non_supportate" && (
        <p className="mt-1 text-sm text-slate-600">
          Questo browser non supporta le notifiche. Prova con Chrome o con l&apos;app installata sulla schermata Home.
        </p>
      )}

      {chiavePubblica && stato === "iphone_da_installare" && (
        <div className="mt-1 text-sm text-slate-700">
          <p>Su iPhone le notifiche funzionano con l&apos;app aggiunta alla schermata Home:</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              tocca <strong>Condividi</strong> (il quadrato con la freccia in su) in basso in Safari;
            </li>
            <li>
              scegli <strong>Aggiungi alla schermata Home</strong>;
            </li>
            <li>apri l&apos;app dall&apos;icona con le onde e torna qui.</li>
          </ol>
        </div>
      )}

      {chiavePubblica && stato === "bloccate" && (
        <p className="mt-1 text-sm text-slate-700">
          Hai bloccato le notifiche per questo sito. Per riattivarle apri le impostazioni del browser (o dell&apos;app) →
          Notifiche → consenti <strong>Piscina Sassocorvaro</strong>.
        </p>
      )}

      {chiavePubblica && stato === "da_attivare" && (
        <>
          <p className="mt-1 text-sm text-slate-600">
            Ricevi sul telefono i promemoria per confermare le lezioni, le scadenze e le comunicazioni della piscina.
          </p>
          <button onClick={attiva} disabled={occupato} className={`${pulsante} mt-3 w-full bg-acqua text-white hover:bg-vasca sm:w-auto`}>
            {occupato ? "Attivazione…" : "Attiva le notifiche"}
          </button>
        </>
      )}

      {chiavePubblica && stato === "attive" && (
        <>
          <p className="mt-1 text-sm text-emerald-700">✓ Attive su questo dispositivo.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={prova} disabled={occupato} className={`${pulsante} border border-slate-300 bg-white text-abisso hover:bg-schiuma`}>
              Mandami una prova
            </button>
            <button onClick={disattiva} disabled={occupato} className={`${pulsante} border border-slate-300 bg-white text-abisso hover:bg-schiuma`}>
              Disattiva
            </button>
          </div>
        </>
      )}

      {messaggio && <p className="mt-3 text-sm text-slate-700">{messaggio}</p>}
    </div>
  );
}
