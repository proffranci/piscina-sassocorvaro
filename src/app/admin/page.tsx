import Link from "next/link";
import { Card, Titolo } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";

export default async function AdminHome() {
  const { supabase } = await richiediStaff();
  const oggi = new Date().toISOString().slice(0, 10);

  // "head: true" chiede solo il conteggio, senza scaricare le righe
  const [utenti, abbonamenti, daPagare, corsi] = await Promise.all([
    supabase.from("profili").select("*", { count: "exact", head: true }).eq("ruolo", "utente"),
    supabase.from("abbonamenti").select("*", { count: "exact", head: true }).gte("data_fine", oggi),
    supabase.from("abbonamenti").select("*", { count: "exact", head: true }).gte("data_fine", oggi).eq("pagato", false),
    supabase.from("corsi").select("nome, capienza").eq("attivo", true),
  ]);

  const riquadri = [
    { titolo: "Clienti registrati", valore: utenti.count ?? 0, href: "/admin/utenti" },
    { titolo: "Abbonamenti attivi", valore: abbonamenti.count ?? 0, href: "/admin/abbonamenti" },
    { titolo: "Abbonamenti da incassare", valore: daPagare.count ?? 0, href: "/admin/abbonamenti" },
  ];

  return (
    <>
      <Titolo>Panoramica</Titolo>
      <div className="grid gap-4 sm:grid-cols-3">
        {riquadri.map((r) => (
          <Link key={r.titolo} href={r.href}>
            <Card className="transition hover:border-acqua">
              <p className="text-sm text-slate-600">{r.titolo}</p>
              <p className="mt-1 text-3xl font-bold text-vasca">{r.valore}</p>
            </Card>
          </Link>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-lg font-semibold">Corsi attivi</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {(corsi.data ?? []).map((c) => (
          <Card key={c.nome}>
            <p className="font-semibold">{c.nome}</p>
            <p className="text-sm text-slate-600">{c.capienza} posti per lezione</p>
          </Card>
        ))}
        <Card>
          <p className="font-semibold">Corsie</p>
          <p className="text-sm text-slate-600">5 corsie · prenotazioni in arrivo nella fase 3</p>
        </Card>
      </div>
    </>
  );
}
