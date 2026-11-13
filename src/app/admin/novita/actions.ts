"use server";

import { revalidatePath } from "next/cache";
import { getSessione, isStaff } from "@/lib/sessione";

// Il numerino della campanella (chiamata ogni 30 secondi dalla pagina)
export async function contaNovita() {
  const sessione = await getSessione();
  if (!sessione || !isStaff(sessione.profilo)) return 0;
  const { data } = await sessione.supabase.rpc("conta_novita");
  return Number(data ?? 0);
}

// Aperta la pagina Novità: azzera il numerino di questa persona
export async function segnaNovitaLette() {
  const sessione = await getSessione();
  if (!sessione || !isStaff(sessione.profilo)) return;
  await sessione.supabase.rpc("segna_novita_lette");
  revalidatePath("/admin", "layout");
}
