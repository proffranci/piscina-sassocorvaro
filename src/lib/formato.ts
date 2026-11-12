export const GIORNI = [
  "",
  "Lunedì",
  "Martedì",
  "Mercoledì",
  "Giovedì",
  "Venerdì",
  "Sabato",
  "Domenica",
];

export function nomeGiorno(n: number) {
  return GIORNI[n] ?? "?";
}

// "19:00:00" -> "19:00"
export function ora(valore: string) {
  return valore.slice(0, 5);
}

// "2026-11-12" -> "12/11/2026"
export function data(valore: string) {
  const [a, m, g] = valore.slice(0, 10).split("-");
  return `${g}/${m}/${a}`;
}

export function testo(formData: FormData, campo: string) {
  return String(formData.get(campo) ?? "").trim();
}
