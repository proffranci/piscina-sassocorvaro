import Link from "next/link";
import { Avviso, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { creaUtente } from "../actions";
import { passwordTemporanea } from "@/lib/account";
import { BottoneInvio } from "@/components/BottoneInvio";

export default async function NuovoUtentePage({ searchParams }: { searchParams: SearchParams }) {
  const { profilo } = await richiediStaff();
  const params = await searchParams;
  const sonoAdmin = profilo.ruolo === "admin";

  return (
    <>
      <Titolo azione={<Link href="/admin/utenti" className={bottoneSecondario}>← Utenti</Link>}>Nuovo utente</Titolo>
      <Avviso errore={parametro(params.errore)} />

      <Card className="max-w-2xl">
        <form action={creaUtente} className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={etichetta} htmlFor="nome">Nome</label>
            <input id="nome" name="nome" required className={campo} />
          </div>
          <div>
            <label className={etichetta} htmlFor="cognome">Cognome</label>
            <input id="cognome" name="cognome" required className={campo} />
          </div>
          <div>
            <label className={etichetta} htmlFor="nome_utente">Nome utente (per accedere)</label>
            <input
              id="nome_utente"
              name="nome_utente"
              placeholder="vuoto = nome.cognome"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className={campo}
            />
            <p className="mt-1 text-xs text-slate-500">Unico per ogni persona, es. mario.rossi o mario.rossi2.</p>
          </div>
          <div>
            <label className={etichetta} htmlFor="email">Email (facoltativa)</label>
            <input id="email" name="email" type="email" placeholder="solo se ce l'ha" className={campo} />
          </div>
          <div>
            <label className={etichetta} htmlFor="telefono">Telefono (per WhatsApp)</label>
            <input id="telefono" name="telefono" type="tel" placeholder="+39 333 1234567" className={campo} />
          </div>
          <div className="sm:col-span-2">
            <label className={etichetta} htmlFor="password">Password provvisoria</label>
            <input id="password" name="password" type="text" minLength={8} required defaultValue={passwordTemporanea()} className={`${campo} font-mono`} autoComplete="off" />
            <p className="mt-1 text-xs text-slate-500">Già pronta (puoi cambiarla). Consegnala al cliente insieme al nome utente.</p>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" name="obbliga_cambio" defaultChecked />
              Al primo accesso deve sceglierne una sua
            </label>
          </div>
          <fieldset className="sm:col-span-2">
            <legend className={etichetta}>Come preferisce ricevere gli avvisi?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-[44px] items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-acqua has-[:checked]:bg-schiuma">
                <input type="radio" name="canale_notifica" value="app" defaultChecked className="mt-1" />
                <span>
                  <strong>🔔 App</strong>
                  <span className="block text-xs text-slate-500">Avvisi e notifiche sul telefono dall&apos;app della piscina</span>
                </span>
              </label>
              <label className="flex min-h-[44px] items-start gap-2 rounded-lg border border-slate-200 p-3 text-sm has-[:checked]:border-acqua has-[:checked]:bg-schiuma">
                <input type="radio" name="canale_notifica" value="whatsapp" className="mt-1" />
                <span>
                  <strong>💬 WhatsApp</strong>
                  <span className="block text-xs text-slate-500">Lo staff scrive su WhatsApp (servono telefono e consenso)</span>
                </span>
              </label>
            </div>
          </fieldset>
          <div>
            <label className={etichetta} htmlFor="ruolo">Ruolo</label>
            <select id="ruolo" name="ruolo" className={campo} defaultValue="utente">
              <option value="utente">Cliente</option>
              {sonoAdmin && <option value="staff">Staff</option>}
              {sonoAdmin && <option value="admin">Admin</option>}
            </select>
          </div>
          <label className="flex items-start gap-2 text-sm sm:col-span-2">
            <input type="checkbox" name="consenso_whatsapp" className="mt-1" />
            <span>Il cliente acconsente a ricevere promemoria su WhatsApp</span>
          </label>
          <div className="sm:col-span-2">
            <BottoneInvio className={bottone}>Crea utente</BottoneInvio>
          </div>
        </form>
      </Card>
    </>
  );
}
