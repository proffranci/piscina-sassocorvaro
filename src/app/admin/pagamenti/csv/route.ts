import { NextResponse, type NextRequest } from "next/server";
import { getSessione, isStaff } from "@/lib/sessione";
import { SELECT_PAGAMENTO, numeroRicevuta, type Pagamento } from "@/lib/pagamenti";
import { data as formattaData, nomeMetodo } from "@/lib/formato";

// I pagamenti di un mese in un file che si apre con Excel (separatore ";", virgola per i decimali)
export async function GET(request: NextRequest) {
  const sessione = await getSessione();
  if (!sessione?.profilo || !isStaff(sessione.profilo)) return new NextResponse("Non autorizzato", { status: 403 });

  const mese = request.nextUrl.searchParams.get("mese") ?? "";
  if (!/^\d{4}-\d{2}$/.test(mese)) return new NextResponse("Mese non valido", { status: 400 });
  const [a, m] = mese.split("-").map(Number);
  const dopo = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, "0")}-01`;

  const { data } = await sessione.supabase
    .from("pagamenti")
    .select(SELECT_PAGAMENTO)
    .gte("pagato_il", `${mese}-01`)
    .lt("pagato_il", dopo)
    .order("anno")
    .order("numero");
  const righe = (data ?? []) as unknown as Pagamento[];

  const cella = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const testo = [
    ["Ricevuta", "Data", "Intestatario", "Descrizione", "Importo", "Modalità", "Note", "Stato"].join(";"),
    ...righe.map((p) =>
      [
        numeroRicevuta(p),
        formattaData(p.pagato_il),
        cella(p.intestatario),
        cella(p.descrizione),
        Number(p.importo).toFixed(2).replace(".", ","),
        nomeMetodo(p.metodo),
        cella(p.note ?? ""),
        p.annullato ? cella(`annullata: ${p.motivo_annullamento ?? ""}`) : "valida",
      ].join(";"),
    ),
  ].join("\r\n");

  // ﻿: così Excel legge bene le lettere accentate
  return new NextResponse(`﻿${testo}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="pagamenti-${mese}.csv"`,
    },
  });
}
