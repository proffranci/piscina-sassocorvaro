import Link from "next/link";
import { redirect } from "next/navigation";
import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Card, Logo, bottone, campo, etichetta, parametro, type SearchParams } from "@/components/ui";
import { getSessione } from "@/lib/sessione";
import { cambiaPassword } from "./actions";

export default async function CambiaPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const sessione = await getSessione();
  if (!sessione || !sessione.profilo) redirect("/login");
  const sp = await searchParams;
  const obbligatorio = sessione.profilo.deve_cambiare_password;

  return (
    <main className="spazio-sopra mx-auto flex min-h-screen min-h-dvh max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-6">
        <Logo />
      </div>
      <Card>
        <h1 className="mb-1 text-xl font-bold">{obbligatorio ? "Scegli la tua password" : "Cambia password"}</h1>
        <p className="mb-5 text-sm text-slate-600">
          {obbligatorio
            ? "Stai usando una password temporanea data dalla reception: scegline una tua per continuare."
            : "Scegli una nuova password per il tuo account."}
        </p>
        <Avviso errore={parametro(sp.errore)} />
        <form action={cambiaPassword} className="space-y-4">
          {/* Nome utente nascosto: aiuta il gestore password del telefono a salvarla bene */}
          <input type="text" name="username" autoComplete="username" defaultValue={sessione.profilo.nome_utente ?? sessione.profilo.email ?? ""} className="hidden" readOnly />
          <div>
            <label className={etichetta} htmlFor="nuova">Nuova password</label>
            <input id="nuova" name="nuova" type="password" autoComplete="new-password" minLength={8} required className={campo} />
            <p className="mt-1 text-xs text-slate-500">Almeno 8 caratteri.</p>
          </div>
          <div>
            <label className={etichetta} htmlFor="conferma">Ripeti la nuova password</label>
            <input id="conferma" name="conferma" type="password" autoComplete="new-password" minLength={8} required className={campo} />
          </div>
          <BottoneInvio className={`${bottone} w-full`}>Salva la password</BottoneInvio>
        </form>
        {!obbligatorio && (
          <p className="mt-4 text-center text-sm">
            <Link href="/" className="text-vasca underline">Annulla</Link>
          </p>
        )}
      </Card>
    </main>
  );
}
