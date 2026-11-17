import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { BottoneStampa } from "@/components/Stampa";
import { Logo, bottone, bottoneSecondario } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { testoQr } from "@/lib/ingresso";

// La tessera da stampare per chi non ha lo smartphone:
// formato carta di credito (85 × 54 mm), da ritagliare e plastificare
export default async function TesseraStampabile({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await richiediStaff();
  const { id } = await params;
  const { data } = await supabase.from("profili").select("id, nome, cognome, codice_ingresso").eq("id", id).maybeSingle();
  const u = data as { id: string; nome: string; cognome: string; codice_ingresso: string | null } | null;
  if (!u) notFound();

  const svg = u.codice_ingresso
    ? await QRCode.toString(testoQr(u.codice_ingresso), { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0b2e45", light: "#ffffff" } })
    : null;

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/admin/utenti/${u.id}`} className={bottoneSecondario}>
          ← Scheda cliente
        </Link>
        <BottoneStampa className={bottone} />
      </div>
      <p className="mb-4 text-sm text-slate-600 print:hidden">
        Stampa al 100% (senza &quot;adatta alla pagina&quot;), ritaglia e, se puoi, plastifica. Se crei un nuovo QR, questa tessera smette
        di funzionare.
      </p>

      <div
        className="flex overflow-hidden rounded-xl border border-slate-300 bg-white text-abisso shadow-sm print:shadow-none"
        style={{ width: "85.6mm", height: "54mm" }}
      >
        <div className="flex flex-1 flex-col justify-between p-[4mm]">
          <div className="scale-90 origin-top-left">
            <Logo />
          </div>
          <div>
            <p className="text-[8pt] uppercase tracking-wide text-slate-500">Tessera di ingresso</p>
            <p className="text-[12pt] font-bold leading-tight">
              {u.nome} {u.cognome}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-center bg-white p-[3mm]">
          {svg ? (
            <div className="[&>svg]:h-full [&>svg]:w-full" style={{ width: "40mm", height: "40mm" }} dangerouslySetInnerHTML={{ __html: svg }} />
          ) : (
            <p className="text-xs">QR mancante</p>
          )}
        </div>
      </div>
    </>
  );
}
