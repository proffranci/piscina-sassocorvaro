import "server-only";
import { redirect } from "next/navigation";
import { creaClientServer } from "@/lib/supabase/server";

export type Ruolo = "utente" | "staff" | "admin";

export type Profilo = {
  id: string;
  email: string | null;
  nome: string;
  cognome: string;
  telefono: string | null;
  ruolo: Ruolo;
  canale_notifica: "email" | "whatsapp";
  consenso_whatsapp: boolean;
  attivo: boolean;
  creato_il: string;
};

// Chi e l'utente loggato? Restituisce null se nessuno e entrato.
export async function getSessione() {
  const supabase = await creaClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase.from("profili").select("*").eq("id", user.id).single();
  const profilo = (data ?? null) as unknown as Profilo | null;

  return { supabase, user, profilo };
}

export function isStaff(profilo: Profilo | null) {
  return !!profilo && profilo.attivo && (profilo.ruolo === "staff" || profilo.ruolo === "admin");
}

// Da chiamare in OGNI pagina e azione dell'area admin.
// Il controllo va ripetuto lato server: nascondere un pulsante non basta.
export async function richiediStaff() {
  const sessione = await getSessione();
  if (!sessione) redirect("/login");
  if (!sessione.profilo || !isStaff(sessione.profilo)) redirect("/area");
  return { ...sessione, profilo: sessione.profilo };
}

export async function richiediUtente() {
  const sessione = await getSessione();
  if (!sessione || !sessione.profilo) redirect("/login");
  return { ...sessione, profilo: sessione.profilo };
}
