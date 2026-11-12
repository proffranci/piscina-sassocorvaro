// Legge l'indirizzo di Supabase e lo "ripulisce": se per errore contiene
// /rest/v1 o una barra finale (com'e successo al primo avvio), lo correggiamo.
export function supabaseUrl() {
  return (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/(rest|auth)\/v1$/, "");
}

export function supabaseChiavePubblica() {
  return (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "").trim();
}
