"use client";

// Apre la finestra di stampa del browser (da lì si può anche salvare in PDF)
export function BottoneStampa({ className = "" }: { className?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={className}>
      🖨️ Stampa / PDF
    </button>
  );
}
