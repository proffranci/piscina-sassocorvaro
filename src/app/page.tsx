import { redirect } from "next/navigation";
import { getSessione, isStaff } from "@/lib/sessione";

// La home smista: chi non e entrato va al login,
// lo staff all'area admin, i clienti alla loro area.
export default async function Home() {
  const sessione = await getSessione();
  if (!sessione) redirect("/login");
  if (isStaff(sessione.profilo)) redirect("/admin");
  redirect("/area");
}
