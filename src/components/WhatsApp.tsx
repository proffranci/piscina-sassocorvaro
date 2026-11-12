// Il "classico" WhatsApp: apre la chat con il cliente e il messaggio già scritto.
// Non serve nessun account speciale né costa nulla: lo staff preme solo Invia.
// Funziona da telefono (apre l'app) e da computer (apre WhatsApp Web/Desktop).

export const SITO = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://piscina-sassocorvaro.vercel.app").replace(/\/+$/, "");

// "333 123 4567" -> "393331234567" (wa.me vuole il prefisso internazionale, senza + né spazi)
export function numeroWhatsApp(telefono: string | null | undefined) {
  if (!telefono) return null;
  let n = telefono.replace(/[^\d+]/g, "");
  if (n.startsWith("+")) n = n.slice(1);
  else if (n.startsWith("00")) n = n.slice(2);
  else if (!(n.startsWith("39") && n.length >= 11)) n = "39" + n; // numero italiano senza prefisso
  return /^\d{8,15}$/.test(n) ? n : null;
}

export function linkWhatsApp(telefono: string | null | undefined, testo?: string) {
  const numero = numeroWhatsApp(telefono);
  if (!numero) return null;
  return `https://wa.me/${numero}${testo ? `?text=${encodeURIComponent(testo)}` : ""}`;
}

export function BottoneWhatsApp({
  telefono,
  testo,
  etichetta = "WhatsApp",
  pieno = false,
}: {
  telefono: string | null | undefined;
  testo?: string;
  etichetta?: string;
  pieno?: boolean;
}) {
  const link = linkWhatsApp(telefono, testo);
  if (!link) return null;
  return (
    <a
      href={link}
      target="_blank"
      rel="noopener noreferrer"
      title="Apri WhatsApp con il messaggio già scritto"
      aria-label={etichetta || "Scrivi su WhatsApp"}
      className={`inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg bg-[#25D366] px-3 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-[#1ebe5a] sm:min-h-0 ${
        pieno ? "w-full" : ""
      }`}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12 2a10 10 0 00-8.6 15.1L2 22l5-1.3A10 10 0 1012 2zm0 18.2a8.2 8.2 0 01-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1112 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 01-2-1.2 7.4 7.4 0 01-1.4-1.7c-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 00-.7.3 3 3 0 00-.9 2.2 5.2 5.2 0 001.1 2.7 11.8 11.8 0 004.5 4c.6.3 1.1.4 1.5.5a3.6 3.6 0 001.7.1 2.7 2.7 0 001.8-1.3 2.2 2.2 0 00.2-1.3c-.1-.1-.3-.2-.5-.3z" />
      </svg>
      {etichetta}
    </a>
  );
}

// I testi pronti, uguali in tutta l'app
export const testiWhatsApp = {
  pagamento: (nome: string, tipo: string) =>
    `Ciao ${nome}! Ti scriviamo dalla Piscina di Sassocorvaro: ti ricordiamo di saldare l'abbonamento "${tipo}" in reception. Grazie! 🏊`,
  scadenza: (nome: string, tipo: string, data: string) =>
    `Ciao ${nome}! Il tuo abbonamento "${tipo}" alla Piscina di Sassocorvaro scade il ${data}. Passa in reception per rinnovarlo e non perdere il tuo posto fisso 🙂`,
  scaduto: (nome: string, tipo: string) =>
    `Ciao ${nome}! Il tuo abbonamento "${tipo}" alla Piscina di Sassocorvaro è scaduto. Vuoi rinnovarlo? Ti aspettiamo in reception!`,
  conferma: (nome: string, lezione: string, entro: string) =>
    `Ciao ${nome}! Ricordati di confermare la tua presenza a ${lezione} entro le ${entro}, altrimenti il posto viene liberato. Puoi farlo dall'app: ${SITO}`,
  lezione: (nome: string, lezione: string) => `Ciao ${nome}! Ti scriviamo dalla Piscina di Sassocorvaro per la lezione di ${lezione}.`,
  avviso: (nome: string, titolo: string, testo: string) =>
    `Ciao ${nome}! ${titolo}${testo ? `\n\n${testo}` : ""}\n\nPiscina di Sassocorvaro`,
};
