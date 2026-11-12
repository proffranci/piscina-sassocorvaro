import "server-only";
import webpush from "web-push";
import { creaClientAdmin } from "@/lib/supabase/admin";

export type Messaggio = { titolo: string; testo: string; url?: string; tag?: string };

// Le notifiche push funzionano solo se su Vercel ci sono le chiavi VAPID
export function pushConfigurate() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

let configurato = false;
function configura() {
  if (configurato) return;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!.trim(),
    process.env.VAPID_PUBLIC_KEY!.trim(),
    process.env.VAPID_PRIVATE_KEY!.trim(),
  );
  configurato = true;
}

type Iscrizione = { id: string; endpoint: string; p256dh: string; auth: string };

// Manda una notifica a tutti i dispositivi iscritti di queste persone.
// Restituisce quante notifiche sono partite.
export async function inviaPush(utenti: string[], messaggio: Messaggio) {
  if (!pushConfigurate() || utenti.length === 0) return 0;
  configura();

  // Chiave segreta: le iscrizioni degli altri non sono leggibili dall'app normale
  const admin = creaClientAdmin();
  const { data } = await admin.from("push_iscrizioni").select("id, endpoint, p256dh, auth").in("utente_id", utenti);
  const iscrizioni = (data ?? []) as Iscrizione[];

  const contenuto = JSON.stringify(messaggio);
  const scadute: string[] = [];
  let inviate = 0;

  await Promise.all(
    iscrizioni.map(async (i) => {
      try {
        await webpush.sendNotification({ endpoint: i.endpoint, keys: { p256dh: i.p256dh, auth: i.auth } }, contenuto, {
          TTL: 6 * 3600, // se il telefono è spento, la notifica aspetta fino a 6 ore
          urgency: "high",
        });
        inviate++;
      } catch (e) {
        const stato = (e as { statusCode?: number }).statusCode;
        // 404/410: il telefono ha disattivato le notifiche o reinstallato il browser
        if (stato === 404 || stato === 410) scadute.push(i.id);
        else console.error("[push] invio fallito:", stato, (e as Error).message);
      }
    }),
  );

  if (scadute.length > 0) await admin.from("push_iscrizioni").delete().in("id", scadute);
  return inviate;
}
