import { campo, etichetta } from "@/components/ui";

// I campi per scegliere la scadenza di conferma degli abbonati.
// Funzionano senza JavaScript: si compila solo il campo che serve per il modo scelto.
export function CampiScadenza({
  modo,
  oraFissa,
  orePrima,
  conEreditata = false,
  id,
}: {
  modo: string | null;
  oraFissa: string | null;
  orePrima: number | null;
  conEreditata?: boolean; // per l'orario singolo: "come il corso"
  id: string;
}) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-3">
      <legend className={`${etichetta} sm:col-span-3`}>Gli abbonati confermano…</legend>
      <div className="sm:col-span-3">
        <select name="scadenza_modo" defaultValue={modo ?? ""} className={campo} aria-label="Tipo di scadenza" id={`modo-${id}`}>
          {conEreditata && <option value="">Come il corso</option>}
          <option value="stesso_giorno">Il giorno stesso, entro un&apos;ora fissa</option>
          <option value="giorno_prima">Il giorno prima, entro un&apos;ora fissa</option>
          <option value="ore_prima">Un certo numero di ore prima dell&apos;inizio</option>
        </select>
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-600" htmlFor={`ora-${id}`}>Ora fissa</label>
        <input id={`ora-${id}`} name="scadenza_ora" type="time" defaultValue={oraFissa?.slice(0, 5) ?? "17:00"} className={campo} />
      </div>
      <div>
        <label className="mb-1 block text-xs text-slate-600" htmlFor={`ore-${id}`}>Oppure ore prima</label>
        <input id={`ore-${id}`} name="scadenza_ore_prima" type="number" min={0} max={72} defaultValue={orePrima ?? 2} className={campo} />
      </div>
      <p className="text-xs text-slate-500 sm:col-span-3 sm:self-end">
        Se la scadenza cade dopo l&apos;inizio, vale l&apos;inizio della lezione. Le lezioni già in calendario si aggiornano da sole.
      </p>
    </fieldset>
  );
}
