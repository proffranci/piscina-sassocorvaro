import type { Metadata, Viewport } from "next";
import { Figtree } from "next/font/google";
import "./globals.css";

const figtree = Figtree({ subsets: ["latin"], variable: "--font-figtree" });

export const metadata: Metadata = {
  title: "Piscina Sassocorvaro · Prenotazioni",
  description: "Prenotazioni di corsi e corsie della piscina di Sassocorvaro",
};

export const viewport: Viewport = {
  themeColor: "#0b2e45",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="it" className={figtree.variable}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
