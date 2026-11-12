import Link from "next/link";
import { Logo } from "@/components/ui";

type Voce = { href: string; testo: string };

export function Intestazione({ voci, nome, ruolo }: { voci: Voce[]; nome: string; ruolo: string }) {
  return (
    <header className="righe-corsia bg-abisso text-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
        <Link href="/">
          <Logo chiaro />
        </Link>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-white/80">
            {nome} <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs uppercase">{ruolo}</span>
          </span>
          <form action="/esci" method="post">
            <button className="rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10">Esci</button>
          </form>
        </div>
      </div>
      {voci.length > 0 && (
        <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2 text-sm">
          {voci.map((v) => (
            <Link key={v.href} href={v.href} className="whitespace-nowrap rounded-lg px-3 py-2 text-white/80 hover:bg-white/10 hover:text-white">
              {v.testo}
            </Link>
          ))}
        </nav>
      )}
      <div className="h-1 bg-gradient-to-r from-acqua via-riflesso to-corsia" />
    </header>
  );
}
