import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

// display "swap": il testo si vede subito col font di sistema, poi passa a Figtree
const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree", display: "swap" });

export const metadata: Metadata = {
  title: "Piscina Sassocorvaro · Prenotazioni",
  description: "Prenotazioni di corsi e corsie della piscina di Sassocorvaro",
  applicationName: "Piscina Sassocorvaro",
  // iPhone: aperta dalla schermata Home si comporta come un'app a tutto schermo
  appleWebApp: { capable: true, title: "Piscina", statusBarStyle: "black-translucent" },
  // Evita che iOS trasformi in link numeri o date a caso (i telefoni li rendiamo noi cliccabili)
  formatDetection: { telephone: false, date: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // "cover": usa tutto lo schermo degli iPhone con la tacca (gli spazi li gestiamo nel CSS)
  viewportFit: "cover",
  themeColor: "#0b2e45",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={figtree.variable}>
      <body className="min-h-screen min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
