-- =====================================================================
--  Gestionale Piscina Sassocorvaro - PREFERENZA APP/WHATSAPP e PROMEMORIA
--  Da eseguire DOPO 0001-0006, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Come preferisce essere avvisato ogni cliente: 'app' o 'whatsapp'
--    (la colonna passa da "elenco fisso" a testo con controllo,
--     così aggiungere un canale in futuro, es. email, è semplice)
-- ---------------------------------------------------------------------
alter table public.profili alter column canale_notifica drop default;
alter table public.profili alter column canale_notifica type text using canale_notifica::text;
update public.profili set canale_notifica = 'app' where canale_notifica = 'email';
alter table public.profili alter column canale_notifica set default 'app';
alter table public.profili drop constraint if exists profili_canale_check;
alter table public.profili add constraint profili_canale_check
  check (canale_notifica in ('app', 'whatsapp', 'email'));

-- Il cliente cambia da solo la sua preferenza (dal Profilo).
-- Passa da qui e non da un "update" diretto: così può toccare SOLO questi campi.
create or replace function public.imposta_preferenze(
  p_canale text, p_telefono text, p_consenso_whatsapp boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tel text := nullif(trim(p_telefono), '');
begin
  if auth.uid() is null then
    raise exception 'Devi prima accedere';
  end if;
  if p_canale not in ('app', 'whatsapp') then
    raise exception 'Scegli app o WhatsApp';
  end if;
  if v_tel is not null and v_tel !~ '^[+0-9 ().-]{6,20}$' then
    raise exception 'Numero di telefono non valido';
  end if;
  if p_canale = 'whatsapp' and (v_tel is null or not p_consenso_whatsapp) then
    raise exception 'Per WhatsApp servono il numero di telefono e il consenso';
  end if;

  update public.profili
     set canale_notifica = p_canale,
         telefono = coalesce(v_tel, telefono),
         consenso_whatsapp = coalesce(p_consenso_whatsapp, false)
   where id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------
-- 2) "Ricorda di confermare": lo staff manda il promemoria nell'app
--    a chi deve ancora confermare (tutti, oppure solo alcune prenotazioni).
--    Considera le lezioni la cui scadenza cade nelle prossime 48 ore.
-- ---------------------------------------------------------------------
create or replace function public.ricorda_conferme(p_prenotazioni uuid[] default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;

  insert into public.notifiche (utente_id, tipo, titolo, testo, link, creata_da, chiave)
  select p.utente_id, 'lezione',
         'Ricordati di confermare la tua presenza',
         c.nome || ' ' ||
           case when (l.inizio at time zone 'Europe/Rome')::date = (now() at time zone 'Europe/Rome')::date then 'oggi'
                else to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM') end
           || ' alle ' || to_char(l.inizio at time zone 'Europe/Rome', 'HH24:MI')
           || ': conferma entro le ' || to_char(l.scadenza_conferma at time zone 'Europe/Rome', 'HH24:MI')
           || ', altrimenti il posto viene liberato.',
         '/area', auth.uid(),
         -- Al massimo un promemoria all'ora per prenotazione (niente doppi clic)
         'ricorda:' || p.id || ':' || to_char(now(), 'YYYYMMDDHH24')
    from public.prenotazioni p
    join public.lezioni l on l.id = p.lezione_id
    join public.corsi c on c.id = l.corso_id
    join public.profili pr on pr.id = p.utente_id and pr.attivo
   where p.stato = 'riservata'
     and not l.annullata
     and l.scadenza_conferma > now()
     and l.scadenza_conferma <= now() + interval '48 hours'
     and (p_prenotazioni is null or p.id = any (p_prenotazioni))
  on conflict (chiave) do nothing;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into public.attivita (tipo, descrizione, autore_id)
    values ('avviso', 'Promemoria di conferma inviato nell''app a ' || v_n
            || case when v_n = 1 then ' persona' else ' persone' end, auth.uid());
  end if;
  return v_n;
end;
$$;

revoke execute on function public.imposta_preferenze(text, text, boolean) from public, anon;
revoke execute on function public.ricorda_conferme(uuid[])                from public, anon;
grant  execute on function public.imposta_preferenze(text, text, boolean) to authenticated;
grant  execute on function public.ricorda_conferme(uuid[])                to authenticated;
