"use client";

import { useEffect } from "react";

// Esegue un'azione (es. "segna come letto") una volta, appena la pagina è visibile
export function SegnaAlCaricamento({ azione, attivo }: { azione: () => Promise<unknown>; attivo: boolean }) {
  useEffect(() => {
    if (attivo) void azione();
  }, [attivo, azione]);
  return null;
}
