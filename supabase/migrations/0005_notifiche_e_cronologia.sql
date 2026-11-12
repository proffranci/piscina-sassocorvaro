-- =====================================================================
--  Gestionale Piscina Sassocorvaro - NOTIFICHE e CRONOLOGIA
--  Da eseguire DOPO 0001-0004, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Le notifiche che ogni cliente vede nella sezione "Avvisi"
-- ---------------------------------------------------------------------
create table if not exists public.notifiche (
  id         uuid primary key default gen_random_uuid(),
  utente_id  uuid not null references public.profili(id) on delete cascade,
  tipo       text not null default 'promemoria'
             check (tipo in ('promemoria', 'pagamento', 'scadenza', 'lezione', 'sistema')),
  titolo     text not null check (length(trim(titolo)) > 0),
  testo      text not null default '',
  link       text,
  letta_il   timestamptz,
  creata_il  timestamptz not null default now(),
  creata_da  uuid references public.profili(id) on delete set null,
  -- Per le notifiche automatiche: impedisce di mandare due volte la stessa
  chiave     text unique
);
create index if not exists notifiche_utente_idx on public.notifiche (utente_id, creata_il desc);

alter table public.notifiche enable row level security;

drop policy if exists "notifiche: lettura" on public.notifiche;
create policy "notifiche: lettura" on public.notifiche
  for select to authenticated using (utente_id = auth.uid() or public.is_staff());
drop policy if exists "notifiche: staff gestisce" on public.notifiche;
create policy "notifiche: staff gestisce" on public.notifiche
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- ---------------------------------------------------------------------
-- 2) La cronologia: tutto quello che succede, per lo staff
-- ---------------------------------------------------------------------
create table if not exists public.attivita (
  id          bigint generated always as identity primary key,
  creata_il   timestamptz not null default now(),
  tipo        text not null,      -- conferma, disdetta, prenotazione, liberato, pagamento, ...
  descrizione text not null,
  utente_id   uuid references public.profili(id) on delete set null, -- la persona interessata
  lezione_id  uuid references public.lezioni(id) on delete set null,
  autore_id   uuid references public.profili(id) on delete set null  -- chi l'ha fatto (vuoto = automatico)
);
create index if not exists attivita_data_idx on public.attivita (creata_il desc);

alter table public.attivita enable row level security;
drop policy if exists "attivita: solo staff" on public.attivita;
create policy "attivita: solo staff" on public.attivita
  for select to authenticated using (public.is_staff());
-- Nessuno scrive a mano nella cronologia: la riempiono i trigger qui sotto.

-- Nome leggibile di una persona (o dell'ospite)
create or replace function public.nome_persona(p_utente uuid, p_ospite text)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select nullif(trim(nome || ' ' || cognome), '') from public.profili where id = p_utente),
    nullif(trim(p_ospite), '') || ' (ospite)',
    'Qualcuno'
  );
$$;

-- "Hydrobike 14/11 19:00"
create or replace function public.nome_lezione(p_lezione uuid)
returns text language sql stable security definer set search_path = '' as $$
  select c.nome || ' ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM HH24:MI')
    from public.lezioni l join public.corsi c on c.id = l.corso_id
   where l.id = p_lezione;
$$;

-- Ogni cambio di una prenotazione finisce in cronologia
create or replace function public.registra_prenotazione()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_chi    text := public.nome_persona(new.utente_id, new.nome_ospite);
  v_dove   text := public.nome_lezione(new.lezione_id);
  v_autore uuid := auth.uid();
  v_staff  boolean := v_autore is not null and v_autore is distinct from new.utente_id;
  v_tipo   text;
  v_testo  text;
begin
  if tg_op = 'INSERT' then
    if new.stato = 'riservata' then
      return new; -- posti riservati in automatico agli abbonati: troppi, non li registriamo
    end if;
    v_tipo := 'prenotazione';
    v_testo := case when v_staff then 'Reception: ingresso aggiunto per ' || v_chi
                    else v_chi || ' ha prenotato un ingresso' end;
  elsif new.stato is distinct from old.stato then
    if new.stato = 'confermata' and old.stato = 'riservata' then
      v_tipo := 'conferma';
      v_testo := case when v_staff then 'Reception: presenza confermata per ' || v_chi
                      else v_chi || ' ha confermato la presenza' end;
    elsif new.stato = 'confermata' and old.stato = 'liberata' then
      v_tipo := 'prenotazione';
      v_testo := v_chi || ' ha ripreso il suo posto';
    elsif new.stato = 'liberata' then
      v_tipo := case when v_autore is null then 'non_confermato' else 'disdetta' end;
      v_testo := case when v_autore is null then 'Posto di ' || v_chi || ' liberato: non ha confermato entro la scadenza'
                      when v_staff then 'Reception: liberato il posto di ' || v_chi
                      else v_chi || ' ha detto che non viene' end;
    elsif new.stato = 'annullata' then
      v_tipo := 'disdetta';
      v_testo := case when v_staff then 'Reception: annullato l''ingresso di ' || v_chi
                      else v_chi || ' ha annullato il suo ingresso' end;
    else
      return new;
    end if;
  else
    return new;
  end if;

  insert into public.attivita (tipo, descrizione, utente_id, lezione_id, autore_id)
  values (v_tipo, v_testo || ' · ' || coalesce(v_dove, 'lezione'), new.utente_id, new.lezione_id, v_autore);
  return new;
end;
$$;

drop trigger if exists cronologia_prenotazioni on public.prenotazioni;
create trigger cronologia_prenotazioni
  after insert or update of stato on public.prenotazioni
  for each row execute function public.registra_prenotazione();

-- Abbonamenti nuovi e pagamenti
create or replace function public.registra_abbonamento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_chi text := public.nome_persona(new.utente_id, null);
begin
  if tg_op = 'INSERT' then
    insert into public.attivita (tipo, descrizione, utente_id, autore_id)
    values ('abbonamento', 'Nuovo abbonamento per ' || v_chi || ': ' || new.tipo
            || case when new.pagato then ' (pagato)' else ' (da pagare)' end,
            new.utente_id, auth.uid());
  elsif new.pagato and not old.pagato then
    insert into public.attivita (tipo, descrizione, utente_id, autore_id)
    values ('pagamento', 'Pagamento registrato: ' || v_chi || ' · ' || new.tipo, new.utente_id, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists cronologia_abbonamenti on public.abbonamenti;
create trigger cronologia_abbonamenti
  after insert or update of pagato on public.abbonamenti
  for each row execute function public.registra_abbonamento();

-- ---------------------------------------------------------------------
-- 3) Funzioni per l'app
-- ---------------------------------------------------------------------

-- Lo staff manda una notifica a una o piu persone
create or replace function public.invia_notifica(
  p_utenti uuid[], p_titolo text, p_testo text, p_tipo text default 'promemoria', p_link text default null
) returns int language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  if coalesce(trim(p_titolo), '') = '' then
    raise exception 'Scrivi un titolo per l''avviso';
  end if;

  insert into public.notifiche (utente_id, tipo, titolo, testo, link, creata_da)
  select distinct u, p_tipo, trim(p_titolo), coalesce(trim(p_testo), ''), p_link, auth.uid()
    from unnest(p_utenti) as u
    join public.profili p on p.id = u and p.attivo;
  get diagnostics v_n = row_count;

  if v_n > 0 then
    insert into public.attivita (tipo, descrizione, autore_id)
    values ('avviso', 'Avviso inviato a ' || v_n || case when v_n = 1 then ' persona' else ' persone' end
            || ': "' || trim(p_titolo) || '"', auth.uid());
  end if;
  return v_n;
end;
$$;

-- Il cliente segna come lette le sue notifiche
create or replace function public.segna_notifiche_lette()
returns void language sql security definer set search_path = '' as $$
  update public.notifiche set letta_il = now()
   where utente_id = auth.uid() and letta_il is null;
$$;

-- Ogni mattina: promemoria automatici
create or replace function public.notifiche_giornaliere()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_tot  int := 0;
  v_n    int;
begin
  -- a) Lezioni di oggi ancora da confermare
  insert into public.notifiche (utente_id, tipo, titolo, testo, link, chiave)
  select p.utente_id, 'lezione',
         'Conferma la tua presenza di oggi',
         c.nome || ' alle ' || to_char(l.inizio at time zone 'Europe/Rome', 'HH24:MI')
           || ': conferma entro le ' || to_char(l.scadenza_conferma at time zone 'Europe/Rome', 'HH24:MI')
           || ', altrimenti il posto viene liberato.',
         '/area', 'conferma:' || p.id
    from public.prenotazioni p
    join public.lezioni l on l.id = p.lezione_id
    join public.corsi c on c.id = l.corso_id
   where p.stato = 'riservata'
     and p.utente_id is not null
     and not l.annullata
     and (l.inizio at time zone 'Europe/Rome')::date = v_oggi
     and l.scadenza_conferma > now()
  on conflict (chiave) do nothing;
  get diagnostics v_n = row_count; v_tot := v_tot + v_n;

  -- b) Abbonamenti che scadono tra 7 giorni e oggi
  insert into public.notifiche (utente_id, tipo, titolo, testo, link, chiave)
  select a.utente_id, 'scadenza',
         case when a.data_fine = v_oggi then 'Il tuo abbonamento scade oggi'
              else 'Il tuo abbonamento scade tra 7 giorni' end,
         a.tipo || ': valido fino al ' || to_char(a.data_fine, 'DD/MM/YYYY') || '. Chiedi in reception per il rinnovo.',
         '/area/profilo',
         case when a.data_fine = v_oggi then 'scade0:' else 'scade7:' end || a.id
    from public.abbonamenti a
    join public.profili pr on pr.id = a.utente_id and pr.attivo
   where a.data_fine in (v_oggi, v_oggi + 7)
  on conflict (chiave) do nothing;
  get diagnostics v_n = row_count; v_tot := v_tot + v_n;

  return v_tot;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Permessi: niente per chi non ha fatto l'accesso
-- ---------------------------------------------------------------------
revoke execute on function public.invia_notifica(uuid[], text, text, text, text) from public, anon;
revoke execute on function public.segna_notifiche_lette()                        from public, anon;
revoke execute on function public.notifiche_giornaliere()                        from public, anon, authenticated;
revoke execute on function public.nome_persona(uuid, text)                       from public, anon;
revoke execute on function public.nome_lezione(uuid)                             from public, anon;
grant  execute on function public.invia_notifica(uuid[], text, text, text, text) to authenticated;
grant  execute on function public.segna_notifiche_lette()                        to authenticated;

-- ---------------------------------------------------------------------
-- 5) Ogni mattina alle 6:00 UTC (7:00 d'inverno, 8:00 d'estate in Italia)
-- ---------------------------------------------------------------------
select cron.schedule('notifiche-giornaliere', '0 6 * * *', $$ select public.notifiche_giornaliere(); $$);
