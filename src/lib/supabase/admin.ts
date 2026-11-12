import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

// Client con la chiave SEGRETA: scavalca la Row Level Security.
// Lo usiamo solo per creare gli account dei clienti, e SEMPRE dopo aver
// controllato che chi lo chiede sia staff o admin.
// "server-only" fa fallire la build se qualcuno lo importa in una pagina del browser.
export function creaClientAdmin() {
  return createClient(
    supabaseUrl(),
    (process.env.SUPABASE_SECRET_KEY ?? "").trim(),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
