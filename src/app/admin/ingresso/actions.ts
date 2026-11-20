"use server";

import { revalidatePath } from "next/cache";
import { richiediStaff } from "@/lib/sessione";
import { messaggioDb } from "@/lib/errori";
import { leggiImporto } from "@/lib/formato";
import type { Controllo, Registrato, SceltaIngresso } from "@/lib/ingresso";
import { redirect } from "next/navigation";
import { testo } from "@/lib/formato";

// 1) Lettura del QR / della tessera: solo controllo, non registra niente
export async function controllaCodice(codice: string): Promise<Controllo | { errore: string }> {
  const { supabase } = await richiediStaff();
  const pulito = String(codice ?? "").trim().slice(0, 120);
  if (pulito.length < 4) return { errore: "Codice troppo corto: riprova." };
  const { data, error } = await supabase.rpc("controlla_codice", { p_codice: pulito });
  if (error) return { errore: messaggioDb(error, "Lettura non riuscita, riprova.") };
  return data as Controllo;
}

// 2) La reception ha scelto cosa entra a fare: ora si registra
export async function confermaIngresso(s: SceltaIngresso): Promise<Registrato | { errore: string }> {
  const { supabase } = await richiediStaff();
  const importo = s.importo ? leggiImporto(s.importo) : null;
  if (s.importo && importo === null) return { errore: "Importo non valido." };
  const { data, error } = await supabase.rpc("registra_ingresso", {
    p_codice: String(s.codice).slice(0, 120),
    p_motivo: s.motivo,
    p_lezione: s.lezione || null,
    p_importo: importo,
    p_metodo: s.metodo || null,
    p_nota: s.nota?.slice(0, 200) || null,
    p_forza: !!s.forza,
    p_carnet: s.carnet || null,
    p_corsia: s.corsia ?? null,
  });
  if (error) return { errore: messaggioDb(error, "Ingresso non registrato, riprova.") };
  revalidatePath("/admin/ingresso");
  return data as Registrato;
}

// Collega o scollega la tessera / il braccialetto (numero letto dal lettore)
export async function assegnaTessera(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "utente_id");
  const pagina = `/admin/utenti/${id}`;
  const codice = testo(formData, "tessera");
  const { error } = await supabase.rpc("assegna_tessera", { p_utente: id, p_codice: codice });
  if (error) redirect(`${pagina}?errore=${encodeURIComponent(messaggioDb(error, "Tessera non salvata."))}`);
  redirect(`${pagina}?ok=${encodeURIComponent(codice ? "Tessera collegata." : "Tessera scollegata.")}`);
}

// Nuovo QR: quello vecchio smette subito di funzionare
export async function rigeneraQrUtente(formData: FormData) {
  const { supabase } = await richiediStaff();
  const id = testo(formData, "utente_id");
  const pagina = `/admin/utenti/${id}`;
  const { error } = await supabase.rpc("rigenera_codice_ingresso", { p_utente: id });
  if (error) redirect(`${pagina}?errore=${encodeURIComponent(messaggioDb(error, "Operazione non riuscita."))}`);
  redirect(`${pagina}?ok=${encodeURIComponent("Nuovo QR creato: quello vecchio non funziona più.")}`);
}
