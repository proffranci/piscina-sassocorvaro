import type { Conteggio } from "@/lib/posti";

const PARTI = [
  { chiave: "confermati", etichetta: "Confermati", colore: "bg-vasca" },
  { chiave: "inAttesa", etichetta: "Da confermare", colore: "bg-corsia" },
  { chiave: "ingressi", etichetta: "Ingressi singoli", colore: "bg-acqua" },
] as const;

// La barra dei posti di una lezione: ogni colore è un gruppo di persone,
// la parte grigia sono i posti ancora liberi.
export function BarraPosti({ conteggio, legenda = false }: { conteggio: Conteggio; legenda?: boolean }) {
  const { capienza, liberi } = conteggio;
  return (
    <div>
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-slate-200"
        role="img"
        aria-label={`${capienza - liberi} posti occupati su ${capienza}`}
      >
        {PARTI.map((p) =>
          conteggio[p.chiave] > 0 ? (
            <div
              key={p.chiave}
              className={`${p.colore} h-full border-r border-white/60 last:border-0`}
              style={{ width: `${(conteggio[p.chiave] / Math.max(capienza, 1)) * 100}%` }}
            />
          ) : null,
        )}
      </div>
      {legenda && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          {PARTI.map((p) => (
            <span key={p.chiave} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-full ${p.colore}`} />
              {p.etichetta} <strong className="text-abisso">{conteggio[p.chiave]}</strong>
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-200" />
            Liberi <strong className="text-abisso">{liberi}</strong>
          </span>
        </div>
      )}
    </div>
  );
}
