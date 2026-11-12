-- =====================================================================
--  Gestionale Piscina Sassocorvaro - la regola delle 17:00
--  Da eseguire DOPO 0001_schema.sql, in Supabase > SQL Editor
--
--  pg_cron e un "orologio" dentro il database: ogni 5 minuti controlla
--  le prenotazioni ancora 'riservata' la cui scadenza e passata e le
--  mette a 'liberata', cosi il posto va agli ingressi singoli.
--  Gira anche se nessuno ha l'app aperta.
-- =====================================================================

create extension if not exists pg_cron with schema pg_catalog;

select cron.schedule(
  'libera-posti-non-confermati',
  '*/5 * * * *',
  $$
    update public.prenotazioni p
       set stato = 'liberata'
      from public.lezioni l
     where p.lezione_id = l.id
       and p.stato = 'riservata'
       and l.scadenza_conferma <= now();
  $$
);
