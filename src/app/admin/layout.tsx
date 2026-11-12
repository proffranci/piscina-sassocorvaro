import { Intestazione } from "@/components/Intestazione";
import { richiediStaff } from "@/lib/sessione";

const VOCI = [
  { href: "/admin", testo: "Panoramica" },
  { href: "/admin/utenti", testo: "Utenti" },
  { href: "/admin/abbonamenti", testo: "Abbonamenti" },
  { href: "/admin/corsi", testo: "Corsi e orari" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profilo } = await richiediStaff();

  return (
    <>
      <Intestazione voci={VOCI} nome={`${profilo.nome} ${profilo.cognome}`.trim() || "Staff"} ruolo={profilo.ruolo} />
      <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
    </>
  );
}
