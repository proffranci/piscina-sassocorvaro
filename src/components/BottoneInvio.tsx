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
  name,
  value,
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  title?: string;
  // Due pulsanti nello stesso modulo (es. Approva / Rifiuta): ognuno manda il suo valore
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name={name} value={value} className={className} disabled={disabled || pending} aria-busy={pending} title={title}>
      {pending ? "Invio…" : children}
    </button>
  );
}
