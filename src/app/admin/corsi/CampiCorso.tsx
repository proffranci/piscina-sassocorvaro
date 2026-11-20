import { CampiScadenza } from "@/components/CampiScadenza";
import { campo, etichetta } from "@/components/ui";

export type ImpostazioniCorso = {
  nome: string;
  descrizione: string | null;
  capienza: number;
  giorni_abbonamento: number;
  durata_predefinita: number;
  scadenza_modo: string;
  scadenza_ora: string;
  scadenza_ore_prima: number;
  scadenza_giorni_prima: number;
  disdetta_ore_prima: number;
  ingressi_clienti: boolean;
  ingressi_da: string;
  prenotabile_giorni: number;
  prezzo_ingresso: number | null;
  prezzo_abbonamento: number | null;
  usa_corsie: boolean;
  corsie_max: number;
  persone_per_corsia: number;
  abbonabile: boolean;
};

export const SELECT_IMPOSTAZIONI =
  "nome, descrizione, capienza, giorni_abbonamento, durata_predefinita, scadenza_modo, scadenza_ora, scadenza_ore_prima, scadenza_giorni_prima, disdetta_ore_prima, ingressi_clienti, ingressi_da, prenotabile_giorni, prezzo_ingresso, prezzo_abbonamento, usa_corsie, corsie_max, persone_per_corsia, abbonabile";

export const CORSO_NUOVO: ImpostazioniCorso = {
  nome: "",
  descrizione: null,
  capienza: 20,
  giorni_abbonamento: 2,
  durata_predefinita: 45,
  scadenza_modo: "stesso_giorno",
  scadenza_ora: "17:00",
  scadenza_ore_prima: 2,
  scadenza_giorni_prima: 1,
  disdetta_ore_prima: 2,
  ingressi_clienti: true,
  ingressi_da: "subito",
  prenotabile_giorni: 7,
  prezzo_ingresso: null,
  prezzo_abbonamento: null,
  usa_corsie: false,
  corsie_max: 5,
  persone_per_corsia: 7,
  abbonabile: true,
};

const prezzo = (v: number | null) => (v === null || v === undefined ? "" : String(v).replace(".", ","));

// Tutte le impostazioni di un corso, divise per argomento.
// Le usano sia "Nuovo corso" sia "Impostazioni del corso".
export function CampiCorso({ id, c }: { id: string; c: ImpostazioniCorso }) {
  const sezione = "rounded-xl border border-slate-200 p-4 sm:col-span-2";
  const titolo = "mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500";
  return (
    <>
      {/* ---------- Il corso ---------- */}
      <div className={`${sezione} grid gap-4 sm:grid-cols-2`}>
        <p className={`${titolo} sm:col-span-2`}>Il corso</p>
        <div>
          <label className={etichetta} htmlFor={`nome-${id}`}>Nome</label>
          <input id={`nome-${id}`} name="nome" required maxLength={60} defaultValue={c.nome} placeholder="Es. Acquagym" className={campo} />
        </div>
        <div>
          <label className={etichetta} htmlFor={`desc-${id}`}>Descrizione (facoltativa)</label>
          <input id={`desc-${id}`} name="descrizione" maxLength={200} defaultValue={c.descrizione ?? ""} placeholder="Es. 5 corsie, turni da un'ora" className={campo} />
        </div>
        <div>
          <label className={etichetta} htmlFor={`cap-${id}`}>Posti per lezione</label>
          <input id={`cap-${id}`} name="capienza" type="number" min={1} max={500} required defaultValue={c.capienza} className={campo} />
          <p className="mt-1 text-xs text-slate-500">Per i corsi a corsie i posti si calcolano dalle corsie (vedi sotto).</p>
        </div>
        <div>
          <label className={etichetta} htmlFor={`dur-${id}`}>Durata di una lezione (minuti)</label>
          <input id={`dur-${id}`} name="durata_predefinita" type="number" min={15} max={240} step={5} defaultValue={c.durata_predefinita} className={campo} />
          <p className="mt-1 text-xs text-slate-500">Proposta quando aggiungi gli orari.</p>
        </div>
      </div>

      {/* ---------- Corsie ---------- */}
      <div className={`${sezione} grid gap-4 sm:grid-cols-3`}>
        <p className={`${titolo} sm:col-span-3`}>Corsie (es. nuoto libero)</p>
        <label className="flex items-start gap-2 text-sm sm:col-span-3">
          <input type="checkbox" name="usa_corsie" defaultChecked={c.usa_corsie} className="mt-1" />
          Il corso si fa a corsie: posti = corsie aperte × persone per corsia
        </label>
        <div>
          <label className={etichetta} htmlFor={`cm-${id}`}>Corsie della vasca</label>
          <input id={`cm-${id}`} name="corsie_max" type="number" min={1} max={10} defaultValue={c.corsie_max} className={campo} />
        </div>
        <div>
          <label className={etichetta} htmlFor={`ppc-${id}`}>Persone per corsia</label>
          <input id={`ppc-${id}`} name="persone_per_corsia" type="number" min={1} max={10} defaultValue={c.persone_per_corsia} className={campo} />
        </div>
        <p className="self-end text-xs text-slate-500">
          Quante corsie sono aperte si decide in ogni orario della settimana e, se serve, nella singola lezione.
        </p>
      </div>

      {/* ---------- Abbonati ---------- */}
      <div className={`${sezione} grid gap-4 sm:grid-cols-2`}>
        <p className={`${titolo} sm:col-span-2`}>Abbonati</p>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="abbonabile" defaultChecked={c.abbonabile} className="mt-1" />
          Si fanno abbonamenti a giorni fissi (togli la spunta per il nuoto libero: solo ingressi singoli o carnet)
        </label>
        <div>
          <label className={etichetta} htmlFor={`gg-abb-${id}`}>Giorni fissi nell&apos;abbonamento</label>
          <input id={`gg-abb-${id}`} name="giorni_abbonamento" type="number" min={1} max={7} defaultValue={c.giorni_abbonamento} className={campo} />
        </div>
        <div>
          <label className={etichetta} htmlFor={`disd-${id}`}>Possono dire &quot;non vengo&quot; fino a… (ore prima)</label>
          <input id={`disd-${id}`} name="disdetta_ore_prima" type="number" min={0} max={72} defaultValue={c.disdetta_ore_prima} className={campo} />
          <p className="mt-1 text-xs text-slate-500">0 = fino all&apos;inizio della lezione.</p>
        </div>
        <div className="sm:col-span-2">
          <CampiScadenza id={id} modo={c.scadenza_modo} oraFissa={c.scadenza_ora} orePrima={c.scadenza_ore_prima} giorniPrima={c.scadenza_giorni_prima} />
        </div>
      </div>

      {/* ---------- Ingressi singoli ---------- */}
      <div className={`${sezione} grid gap-4 sm:grid-cols-2`}>
        <p className={`${titolo} sm:col-span-2`}>Ingressi singoli</p>
        <label className="flex items-start gap-2 text-sm sm:col-span-2">
          <input type="checkbox" name="ingressi_clienti" defaultChecked={c.ingressi_clienti} className="mt-1" />
          I clienti possono prenotarli dall&apos;app (la reception può sempre aggiungerli)
        </label>
        <div>
          <label className={etichetta} htmlFor={`da-${id}`}>Posti prenotabili</label>
          <select id={`da-${id}`} name="ingressi_da" defaultValue={c.ingressi_da} className={campo}>
            <option value="subito">Subito, sui posti liberi</option>
            <option value="dopo_scadenza">Solo dopo l&apos;orario limite degli abbonati</option>
          </select>
        </div>
        <div>
          <label className={etichetta} htmlFor={`pren-${id}`}>Prenotabili con quanti giorni di anticipo</label>
          <input id={`pren-${id}`} name="prenotabile_giorni" type="number" min={1} max={60} defaultValue={c.prenotabile_giorni} className={campo} />
        </div>
      </div>

      {/* ---------- Prezzi ---------- */}
      <div className={`${sezione} grid gap-4 sm:grid-cols-2`}>
        <p className={`${titolo} sm:col-span-2`}>Prezzi (facoltativi)</p>
        <div>
          <label className={etichetta} htmlFor={`pi-${id}`}>Ingresso singolo (€)</label>
          <input id={`pi-${id}`} name="prezzo_ingresso" inputMode="decimal" defaultValue={prezzo(c.prezzo_ingresso)} placeholder="Es. 8,00" className={campo} />
        </div>
        <div>
          <label className={etichetta} htmlFor={`pa-${id}`}>Abbonamento (€)</label>
          <input id={`pa-${id}`} name="prezzo_abbonamento" inputMode="decimal" defaultValue={prezzo(c.prezzo_abbonamento)} placeholder="Es. 120,00" className={campo} />
        </div>
        <p className="text-xs text-slate-500 sm:col-span-2">Vengono proposti quando crei un abbonamento o registri un pagamento.</p>
      </div>
    </>
  );
}

const GIORNI_BREVI = ["", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

// Giorni + fascia oraria: uno o tanti orari in un colpo
export function CampiTurni({ id, durata, obbligatori = true }: { id: string; durata: number; obbligatori?: boolean }) {
  return (
    <div className="space-y-4">
      <fieldset>
        <legend className={etichetta}>Giorni</legend>
        <div className="flex flex-wrap gap-2">
          {GIORNI_BREVI.slice(1).map((nome, i) => (
            <label
              key={nome}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-sm has-[:checked]:border-acqua has-[:checked]:bg-acqua has-[:checked]:text-white"
            >
              <input type="checkbox" name="giorni" value={i + 1} className="sr-only" />
              {nome}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <label className={etichetta} htmlFor={`dalle-${id}`}>Dalle</label>
          <input id={`dalle-${id}`} name="dalle" type="time" required={obbligatori} className={campo} />
        </div>
        <div>
          <label className={etichetta} htmlFor={`alle-${id}`}>Alle (facoltativo)</label>
          <input id={`alle-${id}`} name="alle" type="time" className={campo} />
        </div>
        <div>
          <label className={etichetta} htmlFor={`durata-${id}`}>Durata (min)</label>
          <input id={`durata-${id}`} name="durata_minuti" type="number" min={15} max={240} step={5} defaultValue={durata} className={campo} />
        </div>
        <div>
          <label className={etichetta} htmlFor={`ogni-${id}`}>Ogni (min)</label>
          <input id={`ogni-${id}`} name="ogni" type="number" min={15} max={720} step={5} placeholder="= durata" className={campo} />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Solo &quot;Dalle&quot;: un orario. Con &quot;Alle&quot;: tutti i turni della fascia (es. dalle 8:00 alle 21:00, durata 60 → 8, 9, …
        20). Gli orari che esistono già vengono saltati.
      </p>
    </div>
  );
}
