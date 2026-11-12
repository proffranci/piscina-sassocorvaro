"use client";

import { useState } from "react";

function base64url(byte: Uint8Array) {
  let s = "";
  byte.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// Genera le chiavi VAPID direttamente nel TUO browser (Web Crypto):
// la chiave privata non passa da nessun server e non finisce in nessun file.
export function GeneraChiavi() {
  const [chiavi, setChiavi] = useState<{ pubblica: string; privata: string } | null>(null);

  async function genera() {
    const coppia = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
    const pubblica = new Uint8Array(await crypto.subtle.exportKey("raw", coppia.publicKey));
    const jwk = await crypto.subtle.exportKey("jwk", coppia.privateKey);
    setChiavi({ pubblica: base64url(pubblica), privata: jwk.d ?? "" });
  }

  if (!chiavi) {
    return (
      <button
        type="button"
        onClick={genera}
        className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-schiuma sm:min-h-0"
      >
        Genera chiavi
      </button>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <p className="text-amber-800">
        Copiale ora su Vercel: se ricarichi la pagina spariscono (ed è giusto così, la privata non va salvata altrove).
      </p>
      {[
        ["VAPID_PUBLIC_KEY", chiavi.pubblica],
        ["VAPID_PRIVATE_KEY", chiavi.privata],
      ].map(([nome, valore]) => (
        <div key={nome}>
          <p className="mb-1 font-mono text-xs font-semibold">{nome}</p>
          <div className="flex gap-2">
            <input readOnly value={valore} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-2 py-1.5 font-mono text-xs" />
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(valore)}
              className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 text-xs font-medium hover:bg-schiuma"
            >
              Copia
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
