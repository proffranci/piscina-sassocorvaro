"use server";

import { redirect } from "next/navigation";
import { creaClientServer } from "@/lib/supabase/server";
import { testo } from "@/lib/formato";

export async function accedi(formData: FormData) {
  const email = testo(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) redirect("/login?errore=campi");

  const supabase = await creaClientServer();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // Il dettaglio va nei log di Vercel (non all'utente), cosi possiamo capire cosa succede
    console.error("[login] accesso fallito:", { codice: error.code, stato: error.status, messaggio: error.message });

    if (error.code === "email_not_confirmed") redirect("/login?errore=non_confermata");
    // Chiave o indirizzo di Supabase sbagliati: e un problema nostro, non dell'utente
    if (error.status === 401 || error.status === 404 || /api key/i.test(error.message)) redirect("/login?errore=configurazione");
    if (error.status === 429) redirect("/login?errore=troppi_tentativi");

    // Per le credenziali sbagliate il messaggio resta generico:
    // non diciamo se l'email esiste o no
    redirect("/login?errore=credenziali");
  }

  redirect("/");
}
