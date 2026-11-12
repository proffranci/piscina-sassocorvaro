"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

// Un pulsante che, mentre il modulo viene inviato, si disattiva e scrive "Invio…".
// Sul telefono con poca rete evita che qualcuno prema due volte
// (es. due prenotazioni). Senza JavaScript funziona come un pulsante normale.
export function BottoneInvio({
  children,
  className = "",
  disabled = false,
  title,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={disabled || pending} aria-busy={pending} title={title}>
      {pending ? "Invio…" : children}
    </button>
  );
}
