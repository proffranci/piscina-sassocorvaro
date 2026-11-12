export type StatoPrenotazione = "riservata" | "confermata" | "liberata" | "annullata";
export type TipoPrenotazione = "abbonamento" | "ingresso_singolo";

export type Conteggio = {
  confermati: number; // abbonati che hanno confermato
  inAttesa: number; // abbonati che devono ancora confermare
  ingressi: number; // ingressi singoli
  liberati: number; // posti di abbonati non confermati o disdetti
  liberi: number; // posti prenotabili adesso
  capienza: number;
};

// Conta i posti di una lezione a partire dalle sue prenotazioni
export function contaPosti(capienza: number, prenotazioni: { stato: StatoPrenotazione; tipo: TipoPrenotazione }[]): Conteggio {
  let confermati = 0;
  let inAttesa = 0;
  let ingressi = 0;
  let liberati = 0;
  for (const p of prenotazioni) {
    if (p.stato === "riservata") inAttesa++;
    else if (p.stato === "confermata" && p.tipo === "abbonamento") confermati++;
    else if (p.stato === "confermata") ingressi++;
    else if (p.stato === "liberata") liberati++;
  }
  const liberi = Math.max(0, capienza - confermati - inAttesa - ingressi);
  return { confermati, inAttesa, ingressi, liberati, liberi, capienza };
}
