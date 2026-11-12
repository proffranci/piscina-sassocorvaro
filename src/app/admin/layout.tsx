import { Intestazione } from "@/components/Intestazione";
import type { Voce } from "@/components/Navigazione";
import { richiediStaff } from "@/lib/sessione";

const VOCI: Voce[] = [
  { href: "/admin", testo: "Oggi", icona: "casa" },
  { href: "/admin/lezioni", testo: "Lezioni", icona: "calendario" },
  { href: "/admin/utenti", testo: "Utenti", icona: "persone" },
  { href: "/admin/abbonamenti", testo: "Abbonamenti", icona: "tessera" },
  { href: "/admin/avvisi", testo: "Avvisi", icona: "campana" },
  // Sul telefono gli orari si aprono dalla pagina Lezioni
  { href: "/admin/corsi", testo: "Orari", icona: "calendario", soloComputer: true },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profilo } = await richiediStaff();

  return (
    <>
      <Intestazione voci={VOCI} nome={`${profilo.nome} ${profilo.cognome}`.trim() || "Staff"} ruolo={profilo.ruolo} />
      {/* pb-28 sul telefono: lascia spazio alla barra di navigazione in basso */}
      <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 md:py-8">{children}</main>
    </>
  );
}
