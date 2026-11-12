import { Intestazione } from "@/components/Intestazione";
import type { Voce } from "@/components/Navigazione";
import { isStaff, richiediUtente } from "@/lib/sessione";

export default async function AreaLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profilo } = await richiediUtente();

  // Quanti avvisi non letti: il numero nel pallino rosso del menu
  const { count } = await supabase
    .from("notifiche")
    .select("*", { count: "exact", head: true })
    .eq("utente_id", profilo.id)
    .is("letta_il", null);

  const voci: Voce[] = [
    { href: "/area", testo: "Lezioni", icona: "calendario" },
    { href: "/area/prenota", testo: "Prenota", icona: "piu" },
    { href: "/area/avvisi", testo: "Avvisi", icona: "campana", numero: count ?? 0 },
    { href: "/area/profilo", testo: "Profilo", icona: "utente" },
  ];
  if (isStaff(profilo)) voci.push({ href: "/admin", testo: "Gestione", icona: "casa" });

  return (
    <>
      <Intestazione voci={voci} nome={`${profilo.nome} ${profilo.cognome}`.trim()} ruolo={profilo.ruolo} />
      {/* pb-28 sul telefono: spazio per la barra in basso */}
      <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 md:py-8">{children}</main>
    </>
  );
}
