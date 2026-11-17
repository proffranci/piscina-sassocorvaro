import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BottoneStampa } from "@/components/Stampa";
import { bottone, bottoneSecondario, parametro, type SearchParams } from "@/components/ui";
import { getSessione, isStaff } from "@/lib/sessione";
import { data as formattaData, euro, euroInLettere, nomeMetodo } from "@/lib/formato";
import { SELECT_PAGAMENTO, numeroRicevuta, type Pagamento } from "@/lib/pagamenti";

export const metadata = { title: "Ricevuta · Piscina Sassocorvaro" };

// La ricevuta da stampare (o salvare in PDF). Fuori dalle aree admin/cliente
// per non avere menu e intestazioni in mezzo: il controllo di chi può vederla
// lo fa la Row Level Security (il cliente vede solo le sue, lo staff tutte).
export default async function RicevutaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const sessione = await getSessione();
  if (!sessione?.profilo) redirect("/login");
  const { supabase, profilo } = sessione;
  const { id } = await params;
  const sp = await searchParams;

  const [pagRes, impRes] = await Promise.all([
    supabase.from("pagamenti").select(SELECT_PAGAMENTO).eq("id", id).maybeSingle(),
    supabase.from("impostazioni").select("chiave, valore").in("chiave", ["ricevuta_intestazione", "ricevuta_piede"]),
  ]);
  const p = pagRes.data as unknown as Pagamento | null;
  if (!p) notFound();
  const imp = new Map(((impRes.data ?? []) as { chiave: string; valore: string }[]).map((r) => [r.chiave, r.valore]));

  const staff = isStaff(profilo);
  const tornaScritto = parametro(sp.torna) ?? "";
  const torna = staff && /^\/admin(\/[\w/-]*)?(\?[\w=&-]*)?$/.test(tornaScritto) ? tornaScritto : staff ? "/admin/pagamenti" : "/area/profilo";

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 print:max-w-none print:p-0">
      {/* Barra comandi: non si stampa */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={torna} className={bottoneSecondario}>
          ← Indietro
        </Link>
        <BottoneStampa className={bottone} />
      </div>
      {parametro(sp.nuova) === "1" && (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800 print:hidden">
          Pagamento registrato. Stampa la ricevuta o salvala in PDF per mandarla al cliente.
          {!p.verificato && !p.annullato && " L'abbonamento risulterà pagato quando l'admin avrà verificato l'incasso."}
        </p>
      )}

      <article className="relative overflow-hidden rounded-2xl border border-slate-300 bg-white p-8 text-abisso shadow-sm print:rounded-none print:border-0 print:shadow-none">
        {p.annullato && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <span className="-rotate-12 rounded-xl border-4 border-red-600 px-6 py-2 text-4xl font-black uppercase tracking-widest text-red-600/80">
              Annullata
            </span>
          </div>
        )}

        <header className="mb-8 flex items-start justify-between gap-6 border-b border-slate-200 pb-6">
          <p className="whitespace-pre-line text-sm leading-relaxed">{imp.get("ricevuta_intestazione") ?? "Piscina di Sassocorvaro"}</p>
          <div className="shrink-0 text-right">
            <p className="text-xs uppercase tracking-wide text-slate-500">Ricevuta</p>
            <p className="text-2xl font-bold tabular-nums">n. {numeroRicevuta(p)}</p>
            <p className="text-sm">del {formattaData(p.pagato_il)}</p>
          </div>
        </header>

        <dl className="space-y-4 text-[15px]">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Ricevuto da</dt>
            <dd className="text-lg font-semibold">{p.intestatario}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">La somma di</dt>
            <dd>
              <span className="text-2xl font-bold tabular-nums">{euro(p.importo)}</span>
              <span className="ml-2 text-sm italic text-slate-600">(euro {euroInLettere(p.importo)})</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-500">Per</dt>
            <dd>{p.descrizione}</dd>
          </div>
          <div className="flex flex-wrap gap-x-10 gap-y-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Modalità di pagamento</dt>
              <dd>{nomeMetodo(p.metodo)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Data</dt>
              <dd>{formattaData(p.pagato_il)}</dd>
            </div>
          </div>
          {p.note && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-500">Note</dt>
              <dd>{p.note}</dd>
            </div>
          )}
          {p.annullato && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-red-600">Annullata</dt>
              <dd className="text-red-700">{p.motivo_annullamento}</dd>
            </div>
          )}
        </dl>

        <footer className="mt-12 flex items-end justify-between gap-6">
          <p className="max-w-xs whitespace-pre-line text-xs text-slate-500">{imp.get("ricevuta_piede") ?? ""}</p>
          <div className="w-48 text-center">
            <div className="mb-1 h-10 border-b border-slate-400" />
            <p className="text-xs text-slate-500">Timbro e firma</p>
          </div>
        </footer>
      </article>
    </main>
  );
}
