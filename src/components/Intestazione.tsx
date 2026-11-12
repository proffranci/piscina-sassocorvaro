import Link from "next/link";
import { Logo } from "@/components/ui";
import { BottoneInvio } from "@/components/BottoneInvio";
import { NavAlta, NavBassa, type Voce } from "@/components/Navigazione";
import { Campanella } from "@/components/Campanella";

export function Intestazione({
  voci,
  nome,
  ruolo,
  novita,
}: {
  voci: Voce[];
  nome: string;
  ruolo: string;
  novita?: number; // solo per lo staff: la campanella con il numerino
}) {
  return (
    <>
      <header className="righe-corsia spazio-sopra sticky top-0 z-20 bg-abisso text-white md:static">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:py-4">
          <Link href="/" className="min-w-0">
            <Logo chiaro />
          </Link>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            {/* Sul telefono il nome occupa troppo spazio: lo mostriamo solo da tablet in su */}
            <span className="hidden text-white/80 sm:inline">
              {nome} <span className="rounded bg-white/10 px-1.5 py-0.5 text-xs uppercase">{ruolo}</span>
            </span>
            {novita !== undefined && <Campanella numeroIniziale={novita} />}
            <form action="/esci" method="post">
              <BottoneInvio className="min-h-[40px] rounded-lg border border-white/20 px-3 py-1.5 hover:bg-white/10">
                Esci
              </BottoneInvio>
            </form>
          </div>
        </div>
        {voci.length > 0 && <NavAlta voci={voci} />}
        <div className="h-1 bg-gradient-to-r from-acqua via-riflesso to-corsia" />
      </header>
      {voci.length > 0 && <NavBassa voci={voci} />}
    </>
  );
}
