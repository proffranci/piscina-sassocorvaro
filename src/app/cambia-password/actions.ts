"use server";

import { redirect } from "next/navigation";
import { getSessione } from "@/lib/sessione";

function errore(messaggio: string): never {
  redirect(`/cambia-password?errore=${encodeURIComponent(messaggio)}`);
}

export async function cambiaPassword(formData: FormData) {
  const sessione = await getSessione();
  if (!sessione) redirect("/login");

  const nuova = String(formData.get("nuova") ?? "");
  const conferma = String(formData.get("conferma") ?? "");
  if (nuova.length < 8) errore("La password deve avere almeno 8 caratteri.");
  if (nuova !== conferma) errore("Le due password non coincidono.");

  const { error } = await sessione.supabase.auth.updateUser({ password: nuova });
  if (error) {
    errore(
      error.code === "same_password"
        ? "Scegli una password diversa da quella temporanea."
        : error.code === "weak_password"
          ? "Password troppo semplice: aggiungi numeri o lettere maiuscole."
          : "Non sono riuscito a cambiare la password, riprova.",
    );
  }
  await sessione.supabase.rpc("password_cambiata");
  redirect("/?ok=password");
}
