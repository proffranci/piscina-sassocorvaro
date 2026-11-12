"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { contaNovita } from "@/app/admin/novita/actions";

// La campanella in alto con il numerino rosso.
// Si aggiorna da sola ogni 30 secondi e quando torni sull'app (es. sblocchi il telefono).
export function Campanella({ numeroIniziale }: { numeroIniziale: number }) {
  const [numero, setNumero] = useState(numeroIniziale);

  useEffect(() => setNumero(numeroIniziale), [numeroIniziale]);

  useEffect(() => {
    let attivo = true;
    const aggiorna = () => {
      if (document.visibilityState !== "visible") return;
      contaNovita()
        .then((n) => attivo && setNumero(n))
        .catch(() => {});
    };
    const timer = setInterval(aggiorna, 30_000);
    document.addEventListener("visibilitychange", aggiorna);
    return () => {
      attivo = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", aggiorna);
    };
  }, []);

  // Anche il titolo della scheda del browser mostra il numero: "(3) Piscina…"
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\)\s*/, "");
    document.title = numero > 0 ? `(${numero > 99 ? "99+" : numero}) ${base}` : base;
  }, [numero]);

  return (
    <Link
      href="/admin/novita"
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/20 hover:bg-white/10"
      aria-label={numero > 0 ? `Novità: ${numero} da vedere` : "Novità"}
    >
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 16V11a6 6 0 1112 0v5l1.5 2h-15L6 16z" />
        <path d="M10 20.5a2.2 2.2 0 004 0" />
      </svg>
      {numero > 0 && (
        <span className="absolute -right-1.5 -top-1.5 min-w-[20px] rounded-full bg-red-600 px-1 text-center text-[11px] font-bold leading-5 text-white ring-2 ring-abisso">
          {numero > 99 ? "99+" : numero}
        </span>
      )}
    </Link>
  );
}
