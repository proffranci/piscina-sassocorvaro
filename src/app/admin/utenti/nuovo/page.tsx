import Link from "next/link";
import { Avviso, Card, Titolo, bottone, bottoneSecondario, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { creaUtente } from "../actions";

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
            <label className={etichetta} htmlFor="email">Email</label>
            <input id="email" name="email" type="email" required className={campo} />
          </div>
          <div>
            <label className={etichetta} htmlFor="telefono">Telefono (per WhatsApp)</label>
            <input id="telefono" name="telefono" type="tel" placeholder="+39 333 1234567" className={campo} />
          </div>
          <div className="sm:col-span-2">
            <label className={etichetta} htmlFor="password">Password provvisoria</label>
            <input id="password" name="password" type="text" minLength={8} required className={campo} autoComplete="off" />
            <p className="mt-1 text-xs text-slate-500">Almeno 8 caratteri. Consegnala al cliente: potrà cambiarla in seguito.</p>
          </div>
          <div>
            <label className={etichetta} htmlFor="canale_notifica">Avvisi via</label>
            <select id="canale_notifica" name="canale_notifica" className={campo} defaultValue="email">
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>
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
            <button className={bottone}>Crea utente</button>
          </div>
        </form>
      </Card>
    </>
  );
}
