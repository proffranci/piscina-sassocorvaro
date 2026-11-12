import { BottoneWhatsApp } from "@/components/WhatsApp";
import Link from "next/link";
import { Avviso, Badge, Card, Titolo, bottone, bottoneSecondario, campo, parametro, type SearchParams } from "@/components/ui";
import { richiediStaff, type Profilo } from "@/lib/sessione";
import { cambiaAttivo } from "./actions";
import { BottoneInvio } from "@/components/BottoneInvio";

export default async function UtentiPage({ searchParams }: { searchParams: SearchParams }) {
  const { supabase, profilo: io } = await richiediStaff();
  const params = await searchParams;
  const cerca = (parametro(params.cerca) ?? "").trim();

  let query = supabase.from("profili").select("*").order("cognome").order("nome");
  if (cerca) {
    // Tolgo i caratteri speciali per non rompere il filtro
    const pulito = cerca.replace(/[%,()]/g, " ");
    query = query.or(`nome.ilike.%${pulito}%,cognome.ilike.%${pulito}%,email.ilike.%${pulito}%`);
  }
  const { data } = await query;
  const utenti = (data ?? []) as unknown as Profilo[];

  return (
    <>
      <Titolo azione={<Link href="/admin/utenti/nuovo" className={bottone}>+ Nuovo utente</Link>}>Utenti</Titolo>

      <Avviso errore={parametro(params.errore)} ok={parametro(params.ok)} />

      <form className="mb-4 flex gap-2">
        <input name="cerca" defaultValue={cerca} placeholder="Cerca per nome, cognome o email" className={campo} />
        <BottoneInvio className={bottoneSecondario}>Cerca</BottoneInvio>
      </form>

      {/* Sul telefono: una scheda per persona, con telefono ed email toccabili */}
      <ul className="space-y-3 md:hidden">
        {utenti.length === 0 && <li className="py-8 text-center text-sm text-slate-500">Nessun utente trovato.</li>}
        {utenti.map((u) => (
          <li key={u.id}>
            <Card className="p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold">
                  {u.cognome} {u.nome}
                </p>
                <div className="flex shrink-0 gap-1">
                  {u.ruolo !== "utente" && <Badge tono="attenzione">{u.ruolo}</Badge>}
                  {!u.attivo && <Badge>disattivato</Badge>}
                </div>
              </div>
              <div className="mt-2 space-y-1 text-sm">
                {u.telefono && (
                  <a href={`tel:${u.telefono.replace(/\s/g, "")}`} className="block text-vasca underline">
                    📞 {u.telefono}
                  </a>
                )}
                {u.email && (
                  <a href={`mailto:${u.email}`} className="block break-all text-vasca underline">
                    ✉️ {u.email}
                  </a>
                )}
                <p className="text-slate-500">Avvisi via {u.canale_notifica === "whatsapp" ? "WhatsApp" : "email"}</p>
              </div>
              {u.telefono && (
                <div className="mt-3">
                  <BottoneWhatsApp telefono={u.telefono} etichetta="Scrivi su WhatsApp" pieno />
                </div>
              )}
              {u.id !== io.id && (
                <form action={cambiaAttivo} className="mt-3">
                  <input type="hidden" name="id" value={u.id} />
                  <input type="hidden" name="attivo" value={u.attivo ? "no" : "si"} />
                  <BottoneInvio className={`${bottoneSecondario} w-full`}>{u.attivo ? "Disattiva" : "Riattiva"}</BottoneInvio>
                </form>
              )}
            </Card>
          </li>
        ))}
      </ul>

      {/* Dal tablet in su: la tabella */}
      <Card className="hidden overflow-x-auto p-0 md:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-schiuma text-slate-600">
            <tr>
              <th className="px-4 py-3 font-medium">Nome</th>
              <th className="px-4 py-3 font-medium">Contatti</th>
              <th className="px-4 py-3 font-medium">Avvisi</th>
              <th className="px-4 py-3 font-medium">Ruolo</th>
              <th className="px-4 py-3 font-medium">Stato</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {utenti.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-500">Nessun utente trovato.</td>
              </tr>
            )}
            {utenti.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-3 font-medium">{u.cognome} {u.nome}</td>
                <td className="px-4 py-3 text-slate-600">
                  <div>{u.email}</div>
                  {u.telefono && <div>{u.telefono}</div>}
                </td>
                <td className="px-4 py-3">{u.canale_notifica === "whatsapp" ? "WhatsApp" : "Email"}</td>
                <td className="px-4 py-3">
                  <Badge tono={u.ruolo === "utente" ? "neutro" : "attenzione"}>{u.ruolo}</Badge>
                </td>
                <td className="px-4 py-3">
                  <Badge tono={u.attivo ? "ok" : "neutro"}>{u.attivo ? "attivo" : "disattivato"}</Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  {u.id !== io.id && (
                    <form action={cambiaAttivo}>
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="attivo" value={u.attivo ? "no" : "si"} />
                      <BottoneInvio className={bottoneSecondario}>{u.attivo ? "Disattiva" : "Riattiva"}</BottoneInvio>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}
