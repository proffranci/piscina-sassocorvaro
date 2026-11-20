import { BottoneWhatsApp, testiWhatsApp } from "@/components/WhatsApp";
import Link from "next/link";
import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff } from "@/lib/sessione";
import { data as formattaData, euro, nomeGiorno, ora } from "@/lib/formato";
import { BadgePagamento } from "@/components/BadgePagamento";
import { SELECT_PAGAMENTI_ABB, statoPagamento, type PagamentoBreve } from "@/lib/pagamenti";
import { sollecitaPagamento } from "../avvisi/actions";
import { BottoneInvio } from "@/components/BottoneInvio";

type Riga = {
  id: string;
  tipo: string;
  data_inizio: string;
  data_fine: string;
  pagato: boolean;
  prezzo: number | string | null;
  pagare_entro: string | null;
  pagamenti: PagamentoBreve[];
  note: string | null;
  profili: { nome: string; cognome: string; email: string | null; telefono: string | null } | null;
  ingressi_totali: number | null;
  ingressi: { count: number }[];
  abbonamenti_orari: {
    orari_corso: { giorno_settimana: number; ora_inizio: string; corsi: { nome: string } | null } | null;
  }[];
};

export default async function AbbonamentiPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase } = await richiediStaff();
  const params = await searchParams;
  const mostraScaduti = parametro(params.scaduti) === "1";
  const oggi = new Date().toISOString().slice(0, 10);

  let query = supabase
    .from("abbonamenti")
    .select(
      `id, tipo, data_inizio, data_fine, pagato, prezzo, pagare_entro, ingressi_totali, ingressi(count), note, ${SELECT_PAGAMENTI_ABB}, profili(nome, cognome, email, telefono), abbonamenti_orari(orari_corso(giorno_settimana, ora_inizio, corsi(nome)))`,
    )
    .order("data_fine", { ascending: true });
  if (!mostraScaduti) query = query.gte("data_fine", oggi);

  const { data } = await query;
  const abbonamenti = (data ?? []) as unknown as Riga[];

  return (
    <>
      <Titolo
        azione={
          <div className="flex gap-2">
            <Link href="/admin/pagamenti" className={bottoneSecondario}>💶 Pagamenti e ricevute</Link>
            <Link href="/admin/abbonamenti/nuovo?tipo=carnet" className={bottoneSecondario}>🎟️ Nuovo carnet</Link>
            <Link href="/admin/abbonamenti/nuovo" className={bottone}>+ Nuovo abbonamento</Link>
          </div>
        }
      >
        Abbonamenti
      </Titolo>
      <Avviso errore={parametro(params.errore)} ok={parametro(params.ok)} />

      <div className="mb-4 text-sm">
        {mostraScaduti ? (
          <Link href="/admin/abbonamenti" className="text-vasca underline">Mostra solo quelli attivi</Link>
        ) : (
          <Link href="/admin/abbonamenti?scaduti=1" className="text-vasca underline">Mostra anche gli scaduti</Link>
        )}
      </div>

      {abbonamenti.length === 0 && (
        <Card>
          <p className="text-sm text-slate-500">Nessun abbonamento. Crea il primo con il pulsante in alto.</p>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {abbonamenti.map((a) => {
          const scaduto = a.data_fine < oggi;
          const { stato, residuo, urgente } = statoPagamento(a);
          const daIncassare = !scaduto && (stato === "da_pagare" || stato === "acconto");
          const orari = a.abbonamenti_orari
            .map((x) => x.orari_corso)
            .filter((o): o is NonNullable<typeof o> => !!o)
            .sort((x, y) => x.giorno_settimana - y.giorno_settimana);
          return (
            <Card key={a.id}>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <Link href={`/admin/abbonamenti/${a.id}`} className="font-semibold text-vasca underline">
                    {a.profili ? `${a.profili.cognome} ${a.profili.nome}` : "Utente eliminato"}
                  </Link>
                  <p className="text-sm text-slate-600">
                    {a.tipo}
                    {a.ingressi_totali !== null && (
                      <strong className="ml-1">· 🎟️ restano {a.ingressi_totali - (a.ingressi?.[0]?.count ?? 0)}/{a.ingressi_totali}</strong>
                    )}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {scaduto && <Badge>scaduto</Badge>}
                  <BadgePagamento stato={stato} urgente={urgente} pagareEntro={a.pagare_entro} />
                </div>
              </div>

              <p className="mt-3 text-sm">
                Dal <strong>{formattaData(a.data_inizio)}</strong> al <strong>{formattaData(a.data_fine)}</strong>
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                {orari.map((o, i) => (
                  <span key={i} className="rounded-lg bg-schiuma px-2.5 py-1 text-sm">
                    {o.corsi?.nome} · {nomeGiorno(o.giorno_settimana)} {ora(o.ora_inizio)}
                  </span>
                ))}
              </div>

              {a.note && <p className="mt-3 text-sm italic text-slate-600">{a.note}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                {daIncassare && (
                  <Link href={`/admin/abbonamenti/${a.id}#pagamento`} className={bottone}>
                    💶 Registra pagamento{residuo ? ` (${euro(residuo)})` : ""}
                  </Link>
                )}
                {daIncassare && (
                  <form action={sollecitaPagamento}>
                    <input type="hidden" name="abbonamento_id" value={a.id} />
                    <input type="hidden" name="torna" value="/admin/abbonamenti" />
                    <BottoneInvio className={bottoneSecondario}>🔔 Sollecita</BottoneInvio>
                  </form>
                )}
                {daIncassare && (
                  <BottoneWhatsApp telefono={a.profili?.telefono} testo={testiWhatsApp.pagamento(a.profili?.nome ?? "", a.tipo)} />
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </>
  );
}
