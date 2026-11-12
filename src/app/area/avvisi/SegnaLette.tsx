"use client";

import { useEffect } from "react";
import { segnaLette } from "../actions";

// Appena il cliente apre gli avvisi, li segniamo come letti (una volta sola)
export function SegnaLette({ attivo }: { attivo: boolean }) {
  useEffect(() => {
    if (attivo) void segnaLette();
  }, [attivo]);
  return null;
}
