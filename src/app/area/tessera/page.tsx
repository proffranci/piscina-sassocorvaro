import QRCode from "qrcode";
import { BottoneInvio } from "@/components/BottoneInvio";
import { Avviso, Badge, Card, bottoneSecondario, parametro, type SearchParams } from "@/components/ui";
import { richiediUtente } from "@/lib/sessione";
import { data as formattaData, etichettaGiorno, oraDi, oggiItalia } from "@/lib/formato";
import { testoQr } from "@/lib/ingresso";
import { SELECT_PAGAMENTI_ABB, statoPagamento, type PagamentoBreve } from "@/lib/pagamenti";
import { rigeneraMioQr } from "../actions";

export const metadata = { title: "La mia tessera · Piscina Sassocorvaro" };

// La tessera digitale: il QR da mostrare in reception all'ingresso
export default async function TesseraPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo } = await richiediUtente();
  const sp = await searchParams;
  const oggi = oggiItalia();

  const [abbRes, ingRes] = await Promise.all([
    supabase.from("abbonamenti").select(`id, tipo, data_inizio, data_fine, pagato, prezzo, ${SELECT_PAGAMENTI_ABB}`).lte("data_inizio", oggi).gte("data_fine", oggi).order("data_fine"),
    supabase.from("ingressi").select("id, creato_il, esito").eq("utente_id", profilo.id).neq("esito", "negato").order("creato_il", { ascending: false }).limit(5),
  ]);
  const abbonamenti = (abbRes.data ?? []) as unknown as ({
    id: string;
    tipo: string;
    data_inizio: string;
    data_fine: string;
    pagato: boolean;
    prezzo: number | string | null;
    pagamenti: PagamentoBreve[];
  })[];
  const ingressi = (ingRes.data ?? []) as { id: number; creato_il: string; esito: string }[];

  // Il QR disegnato sul server: niente da scaricare sul telefono
  const svg = profilo.codice_ingresso
    ? await QRCode.toString(testoQr(profilo.codice_ingresso), {
        type: "svg",
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#0b2e45", light: "#ffffff" },
      })
    : null;

  return (
    <>
      <h1 className="mb-1 text-2xl font-bold">La tua tessera</h1>
      <p className="mb-5 text-sm text-slate-600">Mostra questo QR in reception quando entri: ti registriamo in un attimo.</p>
      <Avviso errore={parametro(sp.errore)} ok={parametro(sp.ok)} />

      <Card className="mb-6 text-center">
        <p className="text-lg font-semibold">
          {profilo.nome} {profilo.cognome}
        </p>
        {svg ? (
          <div
            className="mx-auto my-4 aspect-square w-full max-w-[300px] [&>svg]:h-full [&>svg]:w-full"
            role="img"
            aria-label="Il tuo QR di ingresso"
            dangerouslySetInnerHTML={{ __html: svg }}
          />
        ) : (
          <p className="my-6 text-sm text-slate-500">QR non ancora disponibile: chiedi in reception.</p>
        )}
        <p className="text-xs text-slate-500">💡 Alza la luminosità dello schermo se il lettore fa fatica.</p>
        {abbonamenti.length > 0 ? (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {abbonamenti.map((a) => (
              <Badge key={a.id} tono={a.pagato ? "ok" : "attenzione"}>
                {a.tipo} · fino al {formattaData(a.data_fine)}
                {a.pagato ? "" : statoPagamento(a).stato === "in_verifica" ? " · pagamento in verifica" : " · da pagare"}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-600">Nessun abbonamento attivo oggi.</p>
        )}
        {profilo.tessera_rfid && (
          <p className="mt-3 text-xs text-slate-500">Puoi entrare anche con la tessera/braccialetto che ti ha dato la reception.</p>
        )}
      </Card>

      {ingressi.length > 0 && (
        <Card className="mb-6">
          <h2 className="mb-2 font-semibold">I tuoi ultimi ingressi</h2>
          <ul className="space-y-1 text-sm">
            {ingressi.map((i) => (
              <li key={i.id}>
                🚪 {etichettaGiorno(i.creato_il)} alle {oraDi(i.creato_il)}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="mb-1 font-semibold">Hai perso il telefono o hai condiviso il QR?</h2>
        <p className="mb-3 text-sm text-slate-600">Creane uno nuovo: quello vecchio smette subito di funzionare.</p>
        <form action={rigeneraMioQr}>
          <BottoneInvio className={bottoneSecondario}>🔄 Crea un nuovo QR</BottoneInvio>
        </form>
      </Card>
    </>
  );
}
