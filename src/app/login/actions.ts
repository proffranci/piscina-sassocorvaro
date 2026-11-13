"use server";

import { redirect } from "next/navigation";
import { creaClientServer } from "@/lib/supabase/server";
import { testo } from "@/lib/formato";
import { emailDiServizio, emailPerAccesso } from "@/lib/account";
import { creaClientAdmin } from "@/lib/supabase/admin";

export async function accedi(formData: FormData) {
  const scritto = testo(formData, "email");
  const password = String(formData.get("password") ?? "");
  if (!scritto || !password) redirect("/login?errore=campi");

  const supabase = await creaClientServer();
  // Nome utente ("mario.rossi") oppure email vera
  let { error } = await supabase.auth.signInWithPassword({ email: emailPerAccesso(scritto), password });

  // Ha scritto l'email di contatto ma il suo account usa il nome utente?
  // Cerchiamo il nome utente (lato server, senza rivelare nulla a chi prova)
  if (error && scritto.includes("@") && error.code === "invalid_credentials") {
    const { data } = await creaClientAdmin()
      .from("profili")
      .select("nome_utente")
      .ilike("email", scritto.trim())
      .not("nome_utente", "is", null)
      .limit(1)
      .maybeSingle();
    const nomeUtente = (data as { nome_utente: string } | null)?.nome_utente;
    if (nomeUtente) {
      ({ error } = await supabase.auth.signInWithPassword({ email: emailDiServizio(nomeUtente), password }));
    }
  }

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
