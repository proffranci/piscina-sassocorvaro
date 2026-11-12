// =====================================================================
//  Service worker della Piscina Sassocorvaro
//  Un piccolo programma che il telefono tiene "sveglio" anche ad app chiusa:
//  riceve le notifiche push e le mostra.
// =====================================================================

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Arriva una notifica dal server
self.addEventListener("push", (event) => {
  let dati = {};
  try {
    dati = event.data ? event.data.json() : {};
  } catch (e) {
    dati = { titolo: event.data ? event.data.text() : "" };
  }

  const titolo = dati.titolo || "Piscina Sassocorvaro";
  event.waitUntil(
    self.registration.showNotification(titolo, {
      body: dati.testo || "",
      icon: "/icona-192.png",
      badge: "/icona-192.png",
      tag: dati.tag || undefined,
      // stessa "etichetta" = una notifica sola aggiornata, ma che suona di nuovo
      renotify: Boolean(dati.tag),
      data: { url: dati.url || "/area/avvisi" },
    }),
  );
});

// Il cliente tocca la notifica: apriamo l'app nella pagina giusta
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const percorso = (event.notification.data && event.notification.data.url) || "/area/avvisi";
  // Solo pagine della nostra app (mai indirizzi esterni)
  const interno = percorso.startsWith("/") && !percorso.startsWith("//");
  const url = new URL(interno ? percorso : "/area/avvisi", self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((finestre) => {
      for (const finestra of finestre) {
        if (finestra.url.startsWith(self.location.origin) && "focus" in finestra) {
          finestra.navigate(url);
          return finestra.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
