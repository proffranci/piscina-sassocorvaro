-- =====================================================================
--  Gestionale Piscina Sassocorvaro - ACCOUNT e CAMBI DI GIORNO
--  Da eseguire DOPO 0001-0008, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Nome utente (unico) e cambio password obbligatorio
-- ---------------------------------------------------------------------
alter table public.profili add column if not exists nome_utente text;
alter table public.profili add column if not exists deve_cambiare_password boolean not null default false;

alter table public.profili drop constraint if exists profili_nome_utente_formato;
alter table public.profili add constraint profili_nome_utente_formato
  check (nome_utente is null or nome_utente ~ '^[a-z0-9][a-z0-9._-]{2,29}$');
-- Unico senza distinguere maiuscole/minuscole ("Mario" = "mario")
create unique index if not exists profili_nome_utente_unico on public.profili (lower(nome_utente));

-- Dopo aver scelto la nuova password il cliente "spegne" l'obbligo
create or replace function public.password_cambiata()
returns void language sql security definer set search_path = '' as $$
  update public.profili set deve_cambiare_password = false where id = auth.uid();
$$;

-- ---------------------------------------------------------------------
-- 2) Cambio di uno dei 2 giorni fissi di un abbonamento (lo fa lo staff)
--    - sostituisce l'orario
--    - toglie i posti futuri sul vecchio orario
--    - riserva i posti sul nuovo orario
-- ---------------------------------------------------------------------
create or replace function public.cambia_orario_abbonamento(
  p_abbonamento uuid, p_vecchio uuid, p_nuovo uuid
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_abb   record;
  v_altro smallint;
  v_nuovo record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;

  select * into v_abb from public.abbonamenti where id = p_abbonamento;
  if not found then
    raise exception 'Abbonamento non trovato';
  end if;
  if not exists (select 1 from public.abbonamenti_orari where abbonamento_id = p_abbonamento and orario_corso_id = p_vecchio) then
    raise exception 'Il giorno da cambiare non fa parte di questo abbonamento';
  end if;
  if p_vecchio = p_nuovo then
    raise exception 'Hai scelto lo stesso orario';
  end if;

  select o.id, o.giorno_settimana into v_nuovo from public.orari_corso o where o.id = p_nuovo and o.attivo;
  if not found then
    raise exception 'Il nuovo orario non è disponibile';
  end if;

  -- L'altro giorno fisso deve restare in un giorno diverso
  select o.giorno_settimana into v_altro
    from public.abbonamenti_orari ao join public.orari_corso o on o.id = ao.orario_corso_id
   where ao.abbonamento_id = p_abbonamento and ao.orario_corso_id <> p_vecchio
   limit 1;
  if v_altro is not null and v_altro = v_nuovo.giorno_settimana then
    raise exception 'I 2 giorni fissi devono essere in giorni diversi';
  end if;

  update public.abbonamenti_orari
     set orario_corso_id = p_nuovo
   where abbonamento_id = p_abbonamento and orario_corso_id = p_vecchio;

  -- Via i posti futuri sul vecchio orario (non ancora iniziati)
  delete from public.prenotazioni p
   using public.lezioni l
   where p.lezione_id = l.id
     and l.orario_corso_id = p_vecchio
     and l.inizio > now()
     and p.utente_id = v_abb.utente_id
     and p.tipo = 'abbonamento';

  insert into public.attivita (tipo, descrizione, utente_id, autore_id)
  values ('cambio_giorno',
          'Cambio giorno per ' || public.nome_persona(v_abb.utente_id, null) || ': '
            || public.nome_orario(p_vecchio) || ' → ' || public.nome_orario(p_nuovo),
          v_abb.utente_id, auth.uid());

  -- Posti sul nuovo orario nelle lezioni già in calendario
  perform public.genera_lezioni(28);
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Le richieste di cambio giorno dei clienti
-- ---------------------------------------------------------------------
create table if not exists public.richieste_cambio (
  id                uuid primary key default gen_random_uuid(),
  abbonamento_id    uuid not null references public.abbonamenti(id) on delete cascade,
  utente_id         uuid not null references public.profili(id) on delete cascade,
  orario_vecchio_id uuid not null references public.orari_corso(id),
  orario_nuovo_id   uuid not null references public.orari_corso(id),
  nota              text,
  stato             text not null default 'in_attesa' check (stato in ('in_attesa', 'approvata', 'rifiutata')),
  risposta          text,
  creata_il         timestamptz not null default now(),
  gestita_il        timestamptz,
  gestita_da        uuid references public.profili(id) on delete set null
);
-- Una sola richiesta in attesa per abbonamento
create unique index if not exists richieste_una_in_attesa on public.richieste_cambio (abbonamento_id) where stato = 'in_attesa';

alter table public.richieste_cambio enable row level security;
drop policy if exists "richieste: lettura" on public.richieste_cambio;
create policy "richieste: lettura" on public.richieste_cambio
  for select to authenticated using (utente_id = auth.uid() or public.is_staff());
-- Scritture solo tramite le funzioni qui sotto

-- Nome leggibile di un orario: "Martedì 19:00"
create or replace function public.nome_orario(p_orario uuid)
returns text language sql stable security definer set search_path = '' as $$
  select (array['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'])[o.giorno_settimana]
         || ' ' || to_char(o.ora_inizio, 'HH24:MI')
    from public.orari_corso o where o.id = p_orario;
$$;

-- Il cliente chiede di cambiare uno dei suoi giorni
create or replace function public.richiedi_cambio_giorno(
  p_abbonamento uuid, p_vecchio uuid, p_nuovo uuid, p_nota text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_altro smallint;
  v_nuovo smallint;
begin
  if not exists (
    select 1 from public.abbonamenti a
      join public.profili p on p.id = a.utente_id and p.attivo
     where a.id = p_abbonamento and a.utente_id = auth.uid() and a.data_fine >= current_date
  ) then
    raise exception 'Abbonamento non trovato o scaduto';
  end if;
  if not exists (select 1 from public.abbonamenti_orari where abbonamento_id = p_abbonamento and orario_corso_id = p_vecchio) then
    raise exception 'Scegli quale dei tuoi giorni vuoi cambiare';
  end if;
  select giorno_settimana into v_nuovo from public.orari_corso where id = p_nuovo and attivo;
  if v_nuovo is null or p_nuovo = p_vecchio then
    raise exception 'Scegli un nuovo orario diverso da quello attuale';
  end if;
  select o.giorno_settimana into v_altro
    from public.abbonamenti_orari ao join public.orari_corso o on o.id = ao.orario_corso_id
   where ao.abbonamento_id = p_abbonamento and ao.orario_corso_id <> p_vecchio limit 1;
  if v_altro = v_nuovo then
    raise exception 'Il nuovo giorno coincide con l''altro tuo giorno fisso';
  end if;
  if exists (select 1 from public.richieste_cambio where abbonamento_id = p_abbonamento and stato = 'in_attesa') then
    raise exception 'Hai già una richiesta in attesa: aspetta la risposta della reception';
  end if;

  insert into public.richieste_cambio (abbonamento_id, utente_id, orario_vecchio_id, orario_nuovo_id, nota)
  values (p_abbonamento, auth.uid(), p_vecchio, p_nuovo, nullif(left(trim(p_nota), 300), ''));

  insert into public.attivita (tipo, descrizione, utente_id, autore_id, da_cliente)
  values ('richiesta',
          public.nome_persona(auth.uid(), null) || ' chiede di cambiare giorno: '
            || public.nome_orario(p_vecchio) || ' → ' || public.nome_orario(p_nuovo),
          auth.uid(), auth.uid(), true);
end;
$$;

-- Lo staff approva o rifiuta; il cliente riceve l'esito come avviso
create or replace function public.gestisci_richiesta(p_richiesta uuid, p_approva boolean, p_risposta text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  select * into r from public.richieste_cambio where id = p_richiesta for update;
  if not found or r.stato <> 'in_attesa' then
    raise exception 'Richiesta già gestita';
  end if;

  if p_approva then
    perform public.cambia_orario_abbonamento(r.abbonamento_id, r.orario_vecchio_id, r.orario_nuovo_id);
  end if;

  update public.richieste_cambio
     set stato = case when p_approva then 'approvata' else 'rifiutata' end,
         risposta = nullif(trim(p_risposta), ''),
         gestita_il = now(),
         gestita_da = auth.uid()
   where id = p_richiesta;

  insert into public.notifiche (utente_id, tipo, titolo, testo, link, creata_da)
  values (r.utente_id, 'sistema',
          case when p_approva then 'Cambio giorno approvato ✓' else 'Cambio giorno non possibile' end,
          case when p_approva
               then 'Il tuo giorno fisso ora è ' || public.nome_orario(r.orario_nuovo_id) || ' (al posto di ' || public.nome_orario(r.orario_vecchio_id) || ').'
               else 'La tua richiesta (' || public.nome_orario(r.orario_vecchio_id) || ' → ' || public.nome_orario(r.orario_nuovo_id) || ') non è stata accettata.'
          end || coalesce(' ' || nullif(trim(p_risposta), ''), ''),
          '/area/profilo', auth.uid());
end;
$$;

revoke execute on function public.password_cambiata()                           from public, anon;
revoke execute on function public.cambia_orario_abbonamento(uuid, uuid, uuid)   from public, anon;
revoke execute on function public.richiedi_cambio_giorno(uuid, uuid, uuid, text) from public, anon;
revoke execute on function public.gestisci_richiesta(uuid, boolean, text)       from public, anon;
grant  execute on function public.password_cambiata()                           to authenticated;
grant  execute on function public.cambia_orario_abbonamento(uuid, uuid, uuid)   to authenticated;
grant  execute on function public.richiedi_cambio_giorno(uuid, uuid, uuid, text) to authenticated;
grant  execute on function public.gestisci_richiesta(uuid, boolean, text)       to authenticated;
