import "server-only";
import { cache } from "react";
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
  canale_notifica: "app" | "whatsapp" | "email";
  consenso_whatsapp: boolean;
  attivo: boolean;
  creato_il: string;
};

// Chi e l'utente loggato? Restituisce null se nessuno e entrato.
// cache(): nella stessa pagina il layout e la pagina chiedono la sessione
// entrambi, ma al database andiamo una volta sola.
// getClaims() verifica il "pass" di accesso direttamente qui, senza chiedere
// ogni volta a Supabase: una chiamata di rete in meno a ogni pagina.
export const getSessione = cache(async () => {
  const supabase = await creaClientServer();
  const { data: datiAccesso } = await supabase.auth.getClaims();
  const idUtente = datiAccesso?.claims?.sub as string | undefined;
  if (!idUtente) return null;

  const { data } = await supabase.from("profili").select("*").eq("id", idUtente).single();
  const profilo = (data ?? null) as unknown as Profilo | null;

  return { supabase, idUtente, profilo };
});

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
