import type { MetadataRoute } from "next";

// Il "manifest" dice al telefono come installare il sito come un'app:
// nome, icona, colori, e che si apre a tutto schermo senza la barra del browser.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Piscina Sassocorvaro",
    short_name: "Piscina",
    description: "Prenotazioni di corsi e corsie della piscina di Sassocorvaro",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef6f9",
    theme_color: "#0b2e45",
    lang: "it",
    icons: [
      { src: "/icona-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icona-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icona-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
