import { Badge } from "@/components/ui";
import { ETICHETTE_STATO, type StatoPagamento } from "@/lib/pagamenti";

export function BadgePagamento({ stato }: { stato: StatoPagamento }) {
  const e = ETICHETTE_STATO[stato];
  return <Badge tono={e.tono}>{e.testo}</Badge>;
}
