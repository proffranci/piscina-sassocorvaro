import type { ReactNode } from "react";

// Stili riutilizzabili: cosi tutte le pagine hanno lo stesso aspetto.
export const campo =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-acqua focus:ring-2 focus:ring-riflesso/60";

export const etichetta = "mb-1 block text-sm font-medium text-abisso";

export const bottone =
  "inline-flex items-center justify-center rounded-lg bg-acqua px-4 py-2 text-sm font-semibold text-white hover:bg-vasca transition-colors";

export const bottoneSecondario =
  "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-abisso hover:bg-schiuma transition-colors";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function Titolo({ children, azione }: { children: ReactNode; azione?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-2xl font-bold tracking-tight text-abisso">{children}</h1>
      {azione}
    </div>
  );
}

export function Badge({ children, tono = "neutro" }: { children: ReactNode; tono?: "ok" | "attenzione" | "neutro" }) {
  const colori = {
    ok: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    attenzione: "bg-amber-50 text-amber-800 ring-amber-200",
    neutro: "bg-slate-100 text-slate-700 ring-slate-200",
  }[tono];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${colori}`}>
      {children}
    </span>
  );
}

// Mostra il messaggio passato nell'indirizzo (?errore=... oppure ?ok=...)
export function Avviso({ errore, ok }: { errore?: string; ok?: string }) {
  if (errore) {
    return (
      <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {errore}
      </p>
    );
  }
  if (ok) {
    return (
      <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
        {ok}
      </p>
    );
  }
  return null;
}

export function Logo({ chiaro = false }: { chiaro?: boolean }) {
  return (
    <span className={`flex items-center gap-2 font-bold ${chiaro ? "text-white" : "text-abisso"}`}>
      <svg width="28" height="28" viewBox="0 0 32 32" aria-hidden="true">
        <circle cx="16" cy="16" r="15" fill="currentColor" opacity="0.12" />
        <path
          d="M5 18c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2 2.5-2 2.5-2"
          fill="none"
          stroke="#0e9bb0"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <path
          d="M5 23c2.5 0 2.5-2 5-2s2.5 2 5 2 2.5-2 5-2 2.5 2 5 2 2.5-2 2.5-2"
          fill="none"
          stroke="#7fd6e3"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle cx="19" cy="10" r="2.6" fill="#f2b84b" />
      </svg>
      <span className="leading-tight">
        Piscina <span className="font-normal opacity-80">Sassocorvaro</span>
      </span>
    </span>
  );
}

// Legge un parametro dall'indirizzo in modo sicuro
export function parametro(valore: string | string[] | undefined) {
  return Array.isArray(valore) ? valore[0] : valore;
}

export type SearchParams = Promise<{ [chiave: string]: string | string[] | undefined }>;
