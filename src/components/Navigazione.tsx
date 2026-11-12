"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type Voce = {
  href: string;
  testo: string;
  icona: "casa" | "persone" | "tessera" | "calendario" | "campana" | "utente" | "piu";
  numero?: number; // pallino rosso (es. avvisi non letti)
  soloComputer?: boolean; // sul telefono non sta nella barra in basso
};

// Icone disegnate a mano (SVG): nessuna libreria esterna, funzionano ovunque
function Icona({ nome }: { nome: Voce["icona"] }) {
  const comune = {
    width: 24,
    height: 24,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (nome) {
    case "casa":
      return (
        <svg {...comune}>
          <path d="M3 11l9-7 9 7" />
          <path d="M5 10v10h14V10" />
        </svg>
      );
    case "persone":
      return (
        <svg {...comune}>
          <circle cx="9" cy="8" r="3.2" />
          <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
          <path d="M16 4.5a3 3 0 010 6M18 14c2 .8 3 3 3 6" />
        </svg>
      );
    case "tessera":
      return (
        <svg {...comune}>
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M3 10h18M7 15h4" />
        </svg>
      );
    case "calendario":
      return (
        <svg {...comune}>
          <rect x="3" y="5" width="18" height="16" rx="2.5" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "campana":
      return (
        <svg {...comune}>
          <path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z" />
          <path d="M10 20.5a2.2 2.2 0 004 0" />
        </svg>
      );
    case "utente":
      return (
        <svg {...comune}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M4.5 20.5c0-4 3.4-7 7.5-7s7.5 3 7.5 7" />
        </svg>
      );
    case "piu":
      return (
        <svg {...comune}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8v8M8 12h8" />
        </svg>
      );
  }
}

// Le pagine "principali" (/admin, /area) sono attive solo esattamente lì,
// le altre anche nelle loro sottopagine (es. /admin/lezioni/123)
function attiva(percorso: string, href: string) {
  return href === "/admin" || href === "/area" ? percorso === href : percorso === href || percorso.startsWith(href + "/");
}

function Pallino({ numero }: { numero?: number }) {
  if (!numero) return null;
  return (
    <span className="absolute -right-2 -top-1 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
      {numero > 9 ? "9+" : numero}
    </span>
  );
}

// Sul computer: le voci sotto l'intestazione
export function NavAlta({ voci }: { voci: Voce[] }) {
  const percorso = usePathname() ?? "";
  return (
    <nav className="mx-auto hidden max-w-6xl gap-1 px-4 pb-2 text-sm md:flex">
      {voci.map((v) => (
        <Link
          key={v.href}
          href={v.href}
          className={`whitespace-nowrap rounded-lg px-3 py-2 hover:bg-white/10 hover:text-white ${
            attiva(percorso, v.href) ? "bg-white/15 text-white" : "text-white/75"
          }`}
        >
          <span className="relative">
            {v.testo}
            <Pallino numero={v.numero} />
          </span>
        </Link>
      ))}
    </nav>
  );
}

// Sul telefono: la barra fissa in basso, comoda da usare con il pollice
export function NavBassa({ voci: tutte }: { voci: Voce[] }) {
  const percorso = usePathname() ?? "";
  const voci = tutte.filter((v) => !v.soloComputer);
  return (
    <nav className="spazio-sotto fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-4px_16px_rgba(11,46,69,0.08)] backdrop-blur md:hidden">
      <ul className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${voci.length}, minmax(0, 1fr))` }}>
        {voci.map((v) => {
          const on = attiva(percorso, v.href);
          return (
            <li key={v.href}>
              <Link
                href={v.href}
                className={`flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  on ? "text-acqua" : "text-slate-500"
                }`}
                aria-current={on ? "page" : undefined}
              >
                <span className="relative">
                  <Icona nome={v.icona} />
                  <Pallino numero={v.numero} />
                </span>
                {v.testo}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
