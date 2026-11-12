-- =====================================================================
--  Gestionale Piscina Sassocorvaro - FASE 2: lezioni, conferme, ingressi
--  Da eseguire DOPO 0001, 0002 e 0003, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Ingressi singoli anche per chi NON ha un account
--    (la reception scrive solo il nome, es. "Anna Bianchi")
-- ---------------------------------------------------------------------
alter table public.prenotazioni alter column utente_id drop not null;
alter table public.prenotazioni add column if not exists nome_ospite text;
alter table public.prenotazioni drop constraint if exists prenotazioni_chi;
alter table public.prenotazioni add constraint prenotazioni_chi
  check (utente_id is not null or nullif(trim(nome_ospite), '') is not null);

-- ---------------------------------------------------------------------
-- 2) Generazione del calendario
--    Crea le lezioni mancanti delle prossime N settimane dagli orari
--    settimanali, poi riserva il posto agli abbonati di quel giorno.
--    Si puo lanciare quante volte si vuole: non crea mai doppioni.
-- ---------------------------------------------------------------------
create or replace function public.genera_lezioni(p_giorni int default 28)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_tz     text;
  v_scad   time;
  v_oggi   date;
  v_nuove  int := 0;
  r        record;
begin
  -- Dall'app solo lo staff; il cron notturno gira senza utente (auth.uid() vuoto)
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;

  v_tz   := coalesce((select valore from public.impostazioni where chiave = 'fuso_orario'), 'Europe/Rome');
  v_scad := coalesce((select valore from public.impostazioni where chiave = 'orario_scadenza_conferma'), '17:00')::time;
  v_oggi := (now() at time zone v_tz)::date;

  -- 2a) Le lezioni: "giorno + ora" sono ora italiana, convertite in un istante preciso
  with nuove as (
    insert into public.lezioni (corso_id, orario_corso_id, inizio, fine, capienza, scadenza_conferma)
    select
      o.corso_id,
      o.id,
      (g.giorno + o.ora_inizio) at time zone v_tz,
      (g.giorno + o.ora_inizio + make_interval(mins => o.durata_minuti)) at time zone v_tz,
      c.capienza,
      least((g.giorno + v_scad) at time zone v_tz, (g.giorno + o.ora_inizio) at time zone v_tz)
    from (
      select d::date as giorno
      from generate_series(v_oggi::timestamp, (v_oggi + p_giorni)::timestamp, interval '1 day') as d
    ) g
    join public.orari_corso o on o.attivo and extract(isodow from g.giorno) = o.giorno_settimana
    join public.corsi c on c.id = o.corso_id and c.attivo
    where (g.giorno + o.ora_inizio) at time zone v_tz > now()
    on conflict (corso_id, inizio) do nothing
    returning 1
  )
  select count(*) into v_nuove from nuove;

  -- 2b) Il posto riservato per ogni abbonato nei suoi 2 giorni fissi.
  --     Se per quella lezione esiste gia una sua prenotazione (anche
  --     disdetta o liberata) non la ricreiamo.
  for r in
    select l.id as lezione_id, a.utente_id
    from public.lezioni l
    join public.abbonamenti_orari ao on ao.orario_corso_id = l.orario_corso_id
    join public.abbonamenti a on a.id = ao.abbonamento_id
    join public.profili p on p.id = a.utente_id and p.attivo
    where not l.annullata
      and l.scadenza_conferma > now()
      and (l.inizio at time zone v_tz)::date between a.data_inizio and a.data_fine
      and not exists (
        select 1 from public.prenotazioni x
        where x.lezione_id = l.id and x.utente_id = a.utente_id
      )
    order by l.inizio
  loop
    begin
      insert into public.prenotazioni (lezione_id, utente_id, tipo, stato)
      values (r.lezione_id, r.utente_id, 'abbonamento', 'riservata');
    exception when others then
      -- es. lezione al completo: saltiamo questa e andiamo avanti
      raise notice 'Posto non riservato (utente %, lezione %): %', r.utente_id, r.lezione_id, sqlerrm;
    end;
  end loop;

  return v_nuove;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Azioni del cliente (passano SOLO da queste funzioni, che controllano
--    le regole: la tabella prenotazioni resta in sola lettura per i clienti)
-- ---------------------------------------------------------------------

-- "Confermo la mia presenza" (entro la scadenza delle 17:00)
create or replace function public.conferma_presenza(p_prenotazione uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  select p.id, p.stato, p.utente_id, l.scadenza_conferma, l.annullata
    into v
    from public.prenotazioni p
    join public.lezioni l on l.id = p.lezione_id
   where p.id = p_prenotazione
     for update of p;

  if not found or v.utente_id is distinct from auth.uid() then
    raise exception 'Prenotazione non trovata';
  end if;
  if not exists (select 1 from public.profili where id = auth.uid() and attivo) then
    raise exception 'Il tuo account è disattivato: contatta la reception';
  end if;
  if v.annullata then
    raise exception 'La lezione è stata annullata';
  end if;
  if v.stato = 'confermata' then
    return; -- gia confermata: niente da fare
  end if;
  if v.stato <> 'riservata' then
    raise exception 'Questo posto non è più riservato per te';
  end if;
  if now() >= v.scadenza_conferma then
    raise exception 'Tempo scaduto: la presenza andava confermata entro le 17:00';
  end if;

  update public.prenotazioni
     set stato = 'confermata', confermata_il = now()
   where id = p_prenotazione;
end;
$$;

-- "Non vengo": l'abbonato libera il posto, l'ingresso singolo si annulla
create or replace function public.disdici_prenotazione(p_prenotazione uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  select p.id, p.stato, p.tipo, p.utente_id, l.inizio
    into v
    from public.prenotazioni p
    join public.lezioni l on l.id = p.lezione_id
   where p.id = p_prenotazione
     for update of p;

  if not found or v.utente_id is distinct from auth.uid() then
    raise exception 'Prenotazione non trovata';
  end if;
  if v.stato not in ('riservata', 'confermata') then
    raise exception 'Questa prenotazione è già stata disdetta';
  end if;
  if now() >= v.inizio then
    raise exception 'La lezione è già iniziata';
  end if;

  if v.tipo = 'abbonamento' then
    update public.prenotazioni set stato = 'liberata' where id = p_prenotazione;
  else
    update public.prenotazioni set stato = 'annullata' where id = p_prenotazione;
  end if;
end;
$$;

-- "Prenoto un ingresso singolo" su un posto libero
create or replace function public.prenota_ingresso(p_lezione uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_l  record;
  v_es record;
begin
  if auth.uid() is null then
    raise exception 'Devi prima accedere';
  end if;
  if not exists (select 1 from public.profili where id = auth.uid() and attivo) then
    raise exception 'Il tuo account è disattivato: contatta la reception';
  end if;

  select id, inizio, annullata into v_l from public.lezioni where id = p_lezione;
  if not found or v_l.annullata then
    raise exception 'Lezione non disponibile';
  end if;
  if v_l.inizio <= now() then
    raise exception 'La lezione è già iniziata';
  end if;

  select id, stato into v_es
    from public.prenotazioni
   where lezione_id = p_lezione and utente_id = auth.uid() and stato <> 'annullata';

  if found then
    if v_es.stato in ('riservata', 'confermata') then
      raise exception 'Hai già un posto in questa lezione';
    end if;
    -- Era un suo posto liberato: se c'e ancora spazio, lo riprende
    update public.prenotazioni
       set stato = 'confermata', confermata_il = now()
     where id = v_es.id;
  else
    -- Il controllo dei posti lo fa il trigger: se e pieno, "Lezione al completo"
    insert into public.prenotazioni (lezione_id, utente_id, tipo, stato, confermata_il)
    values (p_lezione, auth.uid(), 'ingresso_singolo', 'confermata', now());
  end if;
end;
$$;

-- Quanti posti sono occupati in ogni lezione (solo numeri, nessun nome:
-- serve ai clienti per vedere i posti liberi senza vedere chi c'e)
create or replace function public.posti_occupati(p_lezioni uuid[])
returns table (lezione_id uuid, occupati int)
language sql stable security definer set search_path = '' as $$
  select p.lezione_id, count(*)::int
    from public.prenotazioni p
   where p.lezione_id = any (p_lezioni)
     and p.stato in ('riservata', 'confermata')
   group by p.lezione_id;
$$;

-- ---------------------------------------------------------------------
-- 4) Chi puo chiamare cosa: nessuna funzione per chi non ha fatto l'accesso
-- ---------------------------------------------------------------------
revoke execute on function public.genera_lezioni(int)         from public, anon;
revoke execute on function public.conferma_presenza(uuid)     from public, anon;
revoke execute on function public.disdici_prenotazione(uuid)  from public, anon;
revoke execute on function public.prenota_ingresso(uuid)      from public, anon;
revoke execute on function public.posti_occupati(uuid[])      from public, anon;
grant  execute on function public.genera_lezioni(int)         to authenticated;
grant  execute on function public.conferma_presenza(uuid)     to authenticated;
grant  execute on function public.disdici_prenotazione(uuid)  to authenticated;
grant  execute on function public.prenota_ingresso(uuid)      to authenticated;
grant  execute on function public.posti_occupati(uuid[])      to authenticated;

-- ---------------------------------------------------------------------
-- 5) Gli orologi (pg_cron)
-- ---------------------------------------------------------------------
-- Ogni notte (01:15 UTC) aggiunge le lezioni delle prossime 4 settimane
select cron.schedule('genera-lezioni', '15 1 * * *', $$ select public.genera_lezioni(28); $$);

-- La liberazione dei posti ora gira ogni minuto, cosi alle 17:01 i posti
-- non confermati sono gia disponibili (stesso nome = aggiorna il job esistente)
select cron.schedule(
  'libera-posti-non-confermati',
  '* * * * *',
  $$
    update public.prenotazioni p
       set stato = 'liberata'
      from public.lezioni l
     where p.lezione_id = l.id
       and p.stato = 'riservata'
       and l.scadenza_conferma <= now();
  $$
);

-- E lo lanciamo subito una volta, per creare il calendario da oggi
select public.genera_lezioni(28) as lezioni_create;
