// Mostrato all'istante mentre la pagina vera si carica:
// toccando un pulsante del menu si vede subito che "sta succedendo qualcosa".
export function Scheletro() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Caricamento">
      <div className="mb-6 h-8 w-48 rounded-lg bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-2xl bg-slate-200" />
        ))}
      </div>
      <div className="mt-8 space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-24 rounded-2xl bg-slate-200" />
        ))}
      </div>
    </div>
  );
}
