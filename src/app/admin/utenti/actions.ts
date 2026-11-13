"use server";

import { redirect } from "next/navigation";
import { creaClientAdmin } from "@/lib/supabase/admin";
import { richiediStaff, type Ruolo } from "@/lib/sessione";
import { testo } from "@/lib/formato";
import { emailDiServizio, nomeUtenteValido, normalizzaNomeUtente, passwordTemporanea } from "@/lib/account";

function errore(percorso: string, messaggio: string): never {
  redirect(`${percorso}?errore=${encodeURIComponent(messaggio)}`);
}
function ok(percorso: string, messaggio: string): never {
  redirect(`${percorso}?ok=${encodeURIComponent(messaggio)}`);
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Chi può modificare chi: lo staff gestisce i clienti, l'admin tutti.
// Nessuno usa questi strumenti sul proprio account (per quello c'è il Profilo).
async function bersaglioGestibile(id: string, pagina: string) {
  const sessione = await richiediStaff();
  const admin = creaClientAdmin();
  const { data } = await admin.from("profili").select("id, nome, cognome, ruolo, nome_utente, email").eq("id", id).maybeSingle();
  const utente = data as { id: string; nome: string; cognome: string; ruolo: Ruolo; nome_utente: string | null; email: string | null } | null;
  if (!utente) errore("/admin/utenti", "Utente non trovato.");
  if (utente.id === sessione.profilo.id) errore(pagina, "Per il tuo account usa la pagina Profilo.");
  if (utente.ruolo !== "utente" && sessione.profilo.ruolo !== "admin") {
    errore(pagina, "Solo un amministratore può modificare account dello staff.");
  }
  return { sessione, admin, utente };
}

async function nomeUtenteLibero(admin: ReturnType<typeof creaClientAdmin>, nomeUtente: string, tranneId?: string) {
  let q = admin.from("profili").select("id").ilike("nome_utente", nomeUtente);
  if (tranneId) q = q.neq("id", tranneId);
  const { data } = await q.limit(1);
  return !data || data.length === 0;
}

export async function creaUtente(formData: FormData) {
  // 1) Prima di tutto: chi lo chiede è davvero staff?
  const { profilo: io } = await richiediStaff();
  const pagina = "/admin/utenti/nuovo";
  const admin = creaClientAdmin();

  const nome = testo(formData, "nome");
  const cognome = testo(formData, "cognome");
  const nomeUtente = normalizzaNomeUtente(testo(formData, "nome_utente") || `${nome}.${cognome}`);
  const email = testo(formData, "email").toLowerCase() || null; // facoltativa: solo per contatto
  const telefono = testo(formData, "telefono") || null;
  const password = String(formData.get("password") ?? "");
  const obbligaCambio = formData.get("obbliga_cambio") === "on";
  const canale = testo(formData, "canale_notifica") === "whatsapp" ? "whatsapp" : "app";
  const consensoWhatsapp = formData.get("consenso_whatsapp") === "on";
  const ruoloRichiesto = testo(formData, "ruolo") as Ruolo;

  // 2) Controlli sui dati (mai fidarsi di quello che arriva dal browser)
  if (!nome || !cognome) errore(pagina, "Nome e cognome sono obbligatori.");
  if (!nomeUtenteValido(nomeUtente)) errore(pagina, "Nome utente non valido: da 3 a 30 caratteri tra lettere, numeri, punto e trattino.");
  if (email && !EMAIL.test(email)) errore(pagina, "L'email non sembra valida (puoi anche lasciarla vuota).");
  if (password.length < 8) errore(pagina, "La password deve avere almeno 8 caratteri.");
  if (!["utente", "staff", "admin"].includes(ruoloRichiesto)) errore(pagina, "Ruolo non valido.");
  if (ruoloRichiesto !== "utente" && io.ruolo !== "admin") {
    errore(pagina, "Solo un amministratore può creare account staff o admin.");
  }
  if (canale === "whatsapp" && (!telefono || !consensoWhatsapp)) {
    errore(pagina, "Per gli avvisi su WhatsApp servono il telefono e il consenso del cliente.");
  }
  if (!(await nomeUtenteLibero(admin, nomeUtente))) errore(pagina, `Il nome utente "${nomeUtente}" è già usato: scegline un altro.`);

  // 3) Creazione dell'account con la chiave segreta (solo lato server).
  //    Si accede con il nome utente: l'email "di servizio" non riceve niente.
  const { data, error } = await admin.auth.admin.createUser({
    email: emailDiServizio(nomeUtente),
    password,
    email_confirm: true,
    user_metadata: { nome, cognome },
  });
  if (error || !data.user) {
    const msg = error?.message?.includes("already") ? `Il nome utente "${nomeUtente}" è già usato.` : "Impossibile creare l'account.";
    errore(pagina, msg);
  }

  // Il profilo l'ha creato il trigger del database: completiamo i dati
  const { error: erroreProfilo } = await admin
    .from("profili")
    .update({
      nome_utente: nomeUtente,
      email,
      telefono,
      canale_notifica: canale,
      consenso_whatsapp: consensoWhatsapp,
      ruolo: ruoloRichiesto,
      deve_cambiare_password: obbligaCambio,
    })
    .eq("id", data.user.id);
  if (erroreProfilo) errore("/admin/utenti", "Account creato, ma non sono riuscito a salvare tutti i dati del profilo.");

  ok(`/admin/utenti/${data.user.id}`, `Account creato. ${nome} accede con il nome utente "${nomeUtente}".`);
}

export async function cambiaAttivo(formData: FormData) {
  const id = testo(formData, "id");
  const torna = testo(formData, "torna") === "scheda" ? `/admin/utenti/${id}` : "/admin/utenti";
  const { admin } = await bersaglioGestibile(id, torna);
  const attivo = testo(formData, "attivo") === "si";

  const { error } = await admin.from("profili").update({ attivo }).eq("id", id);
  if (error) errore(torna, "Modifica non riuscita.");
  ok(torna, attivo ? "Utente riattivato." : "Utente disattivato: non potrà più prenotare né confermare.");
}

// Scheda utente: dati personali, preferenze e (per l'admin) ruolo
export async function aggiornaUtente(formData: FormData) {
  const id = testo(formData, "id");
  const pagina = `/admin/utenti/${id}`;
  const { sessione, admin } = await bersaglioGestibile(id, pagina);

  const nome = testo(formData, "nome");
  const cognome = testo(formData, "cognome");
  const email = testo(formData, "email").toLowerCase() || null;
  const telefono = testo(formData, "telefono") || null;
  const canale = testo(formData, "canale_notifica") === "whatsapp" ? "whatsapp" : "app";
  const consensoWhatsapp = formData.get("consenso_whatsapp") === "on";

  if (!nome || !cognome) errore(pagina, "Nome e cognome sono obbligatori.");
  if (email && !EMAIL.test(email)) errore(pagina, "L'email non sembra valida.");
  if (canale === "whatsapp" && (!telefono || !consensoWhatsapp)) errore(pagina, "Per WhatsApp servono il telefono e il consenso.");

  const modifiche: Record<string, unknown> = { nome, cognome, email, telefono, canale_notifica: canale, consenso_whatsapp: consensoWhatsapp };
  const ruolo = testo(formData, "ruolo");
  if (ruolo && sessione.profilo.ruolo === "admin" && ["utente", "staff", "admin"].includes(ruolo)) modifiche.ruolo = ruolo;

  const { error } = await admin.from("profili").update(modifiche).eq("id", id);
  if (error) errore(pagina, "Salvataggio non riuscito.");
  ok(pagina, "Dati salvati.");
}

// Cambia il nome utente (e quindi come la persona accede)
export async function cambiaNomeUtente(formData: FormData) {
  const id = testo(formData, "id");
  const pagina = `/admin/utenti/${id}`;
  const { admin } = await bersaglioGestibile(id, pagina);
  const nomeUtente = normalizzaNomeUtente(testo(formData, "nome_utente"));

  if (!nomeUtenteValido(nomeUtente)) errore(pagina, "Nome utente non valido: da 3 a 30 caratteri tra lettere, numeri, punto e trattino.");
  if (!(await nomeUtenteLibero(admin, nomeUtente, id))) errore(pagina, `Il nome utente "${nomeUtente}" è già usato.`);

  const { error } = await admin.auth.admin.updateUserById(id, { email: emailDiServizio(nomeUtente), email_confirm: true });
  if (error) errore(pagina, "Non sono riuscito a cambiare il nome utente.");
  await admin.from("profili").update({ nome_utente: nomeUtente }).eq("id", id);
  ok(pagina, `Da ora accede con il nome utente "${nomeUtente}".`);
}

// "Ha dimenticato la password": ne creiamo una temporanea da comunicargli.
// Al primo accesso dovrà sceglierne una sua.
// Restituisce la password (invece di metterla nell'indirizzo della pagina,
// dove resterebbe nella cronologia del browser).
export async function reimpostaPassword(id: string, scelta?: string) {
  const { admin } = await bersaglioGestibile(id, `/admin/utenti/${id}`);
  const password = scelta && scelta.length >= 8 ? scelta : passwordTemporanea();

  const { error } = await admin.auth.admin.updateUserById(id, { password });
  if (error) return { ok: false as const, errore: "Non sono riuscito a cambiare la password." };
  await admin.from("profili").update({ deve_cambiare_password: true }).eq("id", id);
  return { ok: true as const, password };
}
