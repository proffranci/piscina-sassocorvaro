"use server";

import { redirect } from "next/navigation";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { richiediStaff, type Ruolo } from "@/lib/sessione";
import { testo } from "@/lib/formato";

function errore(percorso: string, messaggio: string): never {
  redirect(`${percorso}?errore=${encodeURIComponent(messaggio)}`);
}

export async function creaUtente(formData: FormData) {
  // 1) Prima di tutto: chi lo chiede e davvero staff?
  const { profilo: io } = await richiediStaff();
  const pagina = "/admin/utenti/nuovo";

  const nome = testo(formData, "nome");
  const cognome = testo(formData, "cognome");
  const email = testo(formData, "email").toLowerCase();
  const telefono = testo(formData, "telefono") || null;
  const password = String(formData.get("password") ?? "");
  const canale = testo(formData, "canale_notifica") === "whatsapp" ? "whatsapp" : "app";
  const consensoWhatsapp = formData.get("consenso_whatsapp") === "on";
  const ruoloRichiesto = testo(formData, "ruolo") as Ruolo;

  // 2) Controlli sui dati (mai fidarsi di quello che arriva dal browser)
  if (!nome || !cognome || !email) errore(pagina, "Nome, cognome ed email sono obbligatori.");
  if (password.length < 8) errore(pagina, "La password deve avere almeno 8 caratteri.");
  if (!["utente", "staff", "admin"].includes(ruoloRichiesto)) errore(pagina, "Ruolo non valido.");
  if (ruoloRichiesto !== "utente" && io.ruolo !== "admin") {
    errore(pagina, "Solo un amministratore può creare account staff o admin.");
  }
  if (canale === "whatsapp" && (!telefono || !consensoWhatsapp)) {
    errore(pagina, "Per gli avvisi su WhatsApp servono il telefono e il consenso del cliente.");
  }

  // 3) Creazione dell'account con la chiave segreta (solo lato server)
  const admin = creaClientAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome, cognome },
  });
  if (error || !data.user) {
    const msg = error?.message?.includes("already") ? "Esiste già un account con questa email." : "Impossibile creare l'account.";
    errore(pagina, msg);
  }

  // Il profilo l'ha creato il trigger del database: completiamo i dati
  const { error: erroreProfilo } = await admin
    .from("profili")
    .update({ telefono, canale_notifica: canale, consenso_whatsapp: consensoWhatsapp, ruolo: ruoloRichiesto })
    .eq("id", data.user.id);
  if (erroreProfilo) errore("/admin/utenti", "Account creato, ma non sono riuscito a salvare tutti i dati del profilo.");

  redirect(`/admin/utenti?ok=${encodeURIComponent(`Account di ${nome} ${cognome} creato.`)}`);
}

export async function cambiaAttivo(formData: FormData) {
  const { supabase, profilo: io } = await richiediStaff();
  const id = testo(formData, "id");
  const attivo = testo(formData, "attivo") === "si";

  if (id === io.id) errore("/admin/utenti", "Non puoi disattivare il tuo account.");

  // Qui usiamo il client "normale": la Row Level Security controlla di nuovo i permessi
  const { error } = await supabase.from("profili").update({ attivo }).eq("id", id);
  if (error) errore("/admin/utenti", "Modifica non riuscita.");

  redirect(`/admin/utenti?ok=${encodeURIComponent(attivo ? "Utente riattivato." : "Utente disattivato.")}`);
}
