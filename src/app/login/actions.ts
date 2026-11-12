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

  // Messaggio volutamente generico: non diciamo se l'email esiste o no
  if (error) redirect("/login?errore=credenziali");

  redirect("/");
}
