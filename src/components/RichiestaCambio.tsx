import { BottoneInvio } from "@/components/BottoneInvio";
import { gestisciRichiesta } from "@/app/admin/abbonamenti/actions";
import { etichettaGiorno, nomeGiorno, ora, oraDi } from "@/lib/formato";

type OrarioBreve = { giorno_settimana: number; ora_inizio: string } | null;

export type RichiestaStaff = {
  id: string;
  nota: string | null;
  creata_il: string;
  profili: { nome: string; cognome: string } | null;
  vecchio: OrarioBreve;
  nuovo: OrarioBreve;
};

// Il select per leggerle (due collegamenti alla stessa tabella orari: li distinguiamo per nome)
export const SELECT_RICHIESTE =
  "id, nota, creata_il, profili!richieste_cambio_utente_id_fkey(nome, cognome), vecchio:orari_corso!richieste_cambio_orario_vecchio_id_fkey(giorno_settimana, ora_inizio), nuovo:orari_corso!richieste_cambio_orario_nuovo_id_fkey(giorno_settimana, ora_inizio)";

const nome = (o: OrarioBreve) => (o ? `${nomeGiorno(o.giorno_settimana)} ${ora(o.ora_inizio)}` : "?");

// Una richiesta di cambio giorno, con Approva / Rifiuta
export function RichiestaCambio({ r, torna }: { r: RichiestaStaff; torna: string }) {
  return (
    <div className="rounded-lg bg-schiuma px-3 py-3 text-sm">
      <p>
        <strong>{r.profili ? `${r.profili.cognome} ${r.profili.nome}` : "—"}</strong>: {nome(r.vecchio)} → <strong>{nome(r.nuovo)}</strong>
      </p>
      {r.nota && <p className="mt-1 italic text-slate-600">&quot;{r.nota}&quot;</p>}
      <p className="mt-1 text-xs text-slate-500">
        Chiesta {etichettaGiorno(r.creata_il).toLowerCase()} alle {oraDi(r.creata_il)}
      </p>
      <form action={gestisciRichiesta} className="mt-3 space-y-2">
        <input type="hidden" name="richiesta_id" value={r.id} />
        <input type="hidden" name="torna" value={torna} />
        <input
          name="risposta"
          maxLength={200}
          placeholder="Messaggio per il cliente (facoltativo)"
          className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-3 text-base sm:min-h-0 sm:py-1.5 sm:text-sm"
        />
        <div className="flex gap-2">
          <BottoneInvio
            name="esito"
            value="approva"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-acqua px-3 text-sm font-semibold text-white hover:bg-vasca sm:min-h-0 sm:py-1.5"
          >
            ✓ Approva
          </BottoneInvio>
          <BottoneInvio
            name="esito"
            value="rifiuta"
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium hover:bg-slate-50 sm:min-h-0 sm:py-1.5"
          >
            Rifiuta
          </BottoneInvio>
        </div>
      </form>
    </div>
  );
}
