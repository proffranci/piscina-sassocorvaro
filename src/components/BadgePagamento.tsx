import { Badge } from "@/components/ui";
import { data as formattaData } from "@/lib/formato";
import { ETICHETTE_STATO, type StatoPagamento } from "@/lib/pagamenti";

// Lo stato del pagamento. "Da pagare" diventa ⚠️ solo se manca una settimana
// alla data entro cui pagare (o è già passata); prima è solo un'informazione.
export function BadgePagamento({ stato, urgente = true, pagareEntro }: { stato: StatoPagamento; urgente?: boolean; pagareEntro?: string | null }) {
  const e = ETICHETTE_STATO[stato];
  const daPagare = stato === "da_pagare" || stato === "acconto";
  if (daPagare && !urgente) return <Badge>{e.testo}{pagareEntro ? ` entro il ${formattaData(pagareEntro)}` : ""}</Badge>;
  return (
    <Badge tono={e.tono}>
      {daPagare ? "⚠️ " : ""}
      {e.testo}
      {daPagare && pagareEntro ? ` entro il ${formattaData(pagareEntro)}` : ""}
    </Badge>
  );
}
