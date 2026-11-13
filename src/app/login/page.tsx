import { accedi } from "./actions";
import { Avviso, Logo, bottone, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { BottoneInvio } from "@/components/BottoneInvio";

const MESSAGGI: Record<string, string> = {
  credenziali: "Nome utente o password non corretti.",
  campi: "Inserisci email e password.",
  non_confermata: "L'account non è ancora confermato. Contatta la reception.",
  configurazione: "Il servizio non è configurato correttamente. Riprova più tardi.",
  troppi_tentativi: "Troppi tentativi. Attendi qualche minuto e riprova.",
};

export default async function LoginPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const errore = MESSAGGI[parametro(params.errore) ?? ""];

  return (
    <main className="spazio-sopra grid min-h-screen min-h-dvh lg:grid-cols-2">
      <section className="righe-corsia relative hidden flex-col justify-between bg-abisso p-10 text-white lg:flex">
        <Logo chiaro />
        <div>
          <p className="text-4xl font-bold leading-tight">
            Il tuo posto in vasca,
            <br />
            <span className="text-riflesso">sempre a portata di mano.</span>
          </p>
          <p className="mt-4 max-w-md text-white/70">
            Conferma le lezioni di Hydrobike, prenota le corsie e tieni d&apos;occhio il tuo abbonamento.
          </p>
        </div>
        <div className="h-2 w-40 rounded-full bg-corsia" />
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          <h1 className="mb-1 text-2xl font-bold">Accedi</h1>
          <p className="mb-6 text-sm text-slate-600">Usa il nome utente (o l&apos;email) e la password ricevuti in piscina.</p>

          <Avviso errore={errore} />

          <form action={accedi} className="space-y-4">
            <div>
              <label htmlFor="email" className={etichetta}>Nome utente o email</label>
              <input id="email" name="email" type="text" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} placeholder="es. mario.rossi" required className={campo} />
            </div>
            <div>
              <label htmlFor="password" className={etichetta}>Password</label>
              <input id="password" name="password" type="password" autoComplete="current-password" required className={campo} />
            </div>
            <BottoneInvio className={`${bottone} w-full`}>Entra</BottoneInvio>
          </form>
        </div>
      </section>
    </main>
  );
}
