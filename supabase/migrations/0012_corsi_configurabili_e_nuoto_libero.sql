-- =====================================================================
--  Gestionale Piscina Sassocorvaro - CORSI CONFIGURABILI e NUOTO LIBERO
--   - scadenza di conferma per corso (e per singolo orario)
--   - posti e giorni d'abbonamento per corso
--   - lezioni modificabili e annullabili, orari sospendibili
--   - nuovo corso "Nuoto libero" con orari dalla mattina alla sera
--  Da eseguire DOPO 0001-0011, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Impostazioni di ogni corso
--    scadenza_modo:
--      'stesso_giorno' -> il giorno della lezione entro scadenza_ora (es. 17:00)
--      'giorno_prima'  -> il giorno prima entro scadenza_ora (es. 21:00)
--      'ore_prima'     -> scadenza_ore_prima ore prima dell'inizio (es. 2)
-- ---------------------------------------------------------------------
alter table public.corsi add column if not exists descrizione text;
alter table public.corsi add column if not exists giorni_abbonamento int not null default 2;
alter table public.corsi add column if not exists scadenza_modo text not null default 'stesso_giorno';
alter table public.corsi add column if not exists scadenza_ora time not null default '17:00';
alter table public.corsi add column if not exists scadenza_ore_prima int not null default 2;
alter table public.corsi drop constraint if exists corsi_impostazioni_check;
alter table public.corsi add constraint corsi_impostazioni_check check (
  giorni_abbonamento between 1 and 7
  and scadenza_modo in ('stesso_giorno', 'giorno_prima', 'ore_prima')
  and scadenza_ore_prima between 0 and 72
);

-- Hydrobike mantiene l'orario che c'era (17:00 del giorno stesso)
update public.corsi
   set scadenza_ora = coalesce((select valore from public.impostazioni where chiave = 'orario_scadenza_conferma'), '17:00')::time
 where scadenza_modo = 'stesso_giorno';

-- ---------------------------------------------------------------------
-- 2) Personalizzazioni del singolo orario (vuoto = come il corso)
-- ---------------------------------------------------------------------
alter table public.orari_corso add column if not exists capienza int;
alter table public.orari_corso add column if not exists scadenza_modo text;
alter table public.orari_corso add column if not exists scadenza_ora time;
alter table public.orari_corso add column if not exists scadenza_ore_prima int;
alter table public.orari_corso drop constraint if exists orari_personalizzati_check;
alter table public.orari_corso add constraint orari_personalizzati_check check (
  (capienza is null or capienza > 0)
  and (scadenza_modo is null or scadenza_modo in ('stesso_giorno', 'giorno_prima', 'ore_prima'))
  and (scadenza_ore_prima is null or scadenza_ore_prima between 0 and 72)
);

-- Una lezione modificata a mano non viene più ricalcolata in automatico
alter table public.lezioni add column if not exists personalizzata boolean not null default false;
alter table public.lezioni add column if not exists motivo_annullamento text;

-- ---------------------------------------------------------------------
-- 3) Come si calcola la scadenza di una lezione
-- ---------------------------------------------------------------------
create or replace function public.calcola_scadenza(p_orario uuid, p_inizio timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz    text := coalesce((select valore from public.impostazioni where chiave = 'fuso_orario'), 'Europe/Rome');
  v_modo  text;
  v_ora   time;
  v_ore   int;
  v_giorno date := (p_inizio at time zone v_tz)::date;
  v_scad  timestamptz;
begin
  select coalesce(o.scadenza_modo, c.scadenza_modo),
         coalesce(o.scadenza_ora, c.scadenza_ora),
         coalesce(o.scadenza_ore_prima, c.scadenza_ore_prima)
    into v_modo, v_ora, v_ore
    from public.orari_corso o join public.corsi c on c.id = o.corso_id
   where o.id = p_orario;

  v_scad := case v_modo
    when 'giorno_prima' then ((v_giorno - 1) + coalesce(v_ora, '21:00')) at time zone v_tz
    when 'ore_prima'    then p_inizio - make_interval(hours => coalesce(v_ore, 2))
    else                     (v_giorno + coalesce(v_ora, '17:00')) at time zone v_tz
  end;
  -- Mai dopo l'inizio della lezione
  return least(v_scad, p_inizio);
end;
$$;

-- Testi leggibili: "oggi alle 17:00", "domani alle 21:00", "sabato 15/11 alle 06:00"
create or replace function public.testo_quando(p_istante timestamptz)
returns text language sql stable security definer set search_path = '' as $$
  select case (p_istante at time zone 'Europe/Rome')::date - (now() at time zone 'Europe/Rome')::date
           when 0 then 'oggi'
           when 1 then 'domani'
           when -1 then 'ieri'
           else (array['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'])
                  [extract(isodow from p_istante at time zone 'Europe/Rome')::int]
                || ' ' || to_char(p_istante at time zone 'Europe/Rome', 'DD/MM')
         end || ' alle ' || to_char(p_istante at time zone 'Europe/Rome', 'HH24:MI');
$$;
revoke execute on function public.testo_quando(timestamptz) from public, anon;

-- ---------------------------------------------------------------------
-- 4) Funzioni aggiornate (stessa logica di prima, con le nuove impostazioni)
-- ---------------------------------------------------------------------

create or replace function public.genera_lezioni(p_giorni int default 28)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_tz     text;
  v_oggi   date;
  v_nuove  int := 0;
  r        record;
begin
  -- Dall'app solo lo staff; il cron notturno gira senza utente (auth.uid() vuoto)
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;

  v_tz   := coalesce((select valore from public.impostazioni where chiave = 'fuso_orario'), 'Europe/Rome');
  v_oggi := (now() at time zone v_tz)::date;

  -- 2a) Le lezioni: "giorno + ora" sono ora italiana, convertite in un istante preciso
  with nuove as (
    insert into public.lezioni (corso_id, orario_corso_id, inizio, fine, capienza, scadenza_conferma)
    select
      o.corso_id,
      o.id,
      (g.giorno + o.ora_inizio) at time zone v_tz,
      (g.giorno + o.ora_inizio + make_interval(mins => o.durata_minuti)) at time zone v_tz,
      coalesce(o.capienza, c.capienza),
      public.calcola_scadenza(o.id, (g.giorno + o.ora_inizio) at time zone v_tz)
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
    raise exception 'Tempo scaduto: la scadenza per confermare questa lezione è passata';
  end if;

  update public.prenotazioni
     set stato = 'confermata', confermata_il = now()
   where id = p_prenotazione;
end;
$$;

create or replace function public.notifiche_giornaliere()
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_tot  int := 0;
  v_n    int;
begin
  -- a) Prenotazioni da confermare con scadenza entro le prossime 26 ore
  --    (va bene per ogni tipo di scadenza: stesso giorno, giorno prima, ore prima)
  insert into public.notifiche (utente_id, tipo, titolo, testo, link, chiave)
  select p.utente_id, 'lezione',
         'Conferma la tua presenza',
         public.testo_lezione(l.id) || ': conferma entro ' || public.testo_quando(l.scadenza_conferma)
           || ', altrimenti il posto viene liberato.',
         '/area', 'conferma:' || p.id
    from public.prenotazioni p
    join public.lezioni l on l.id = p.lezione_id
   where p.stato = 'riservata'
     and p.utente_id is not null
     and not l.annullata
     and l.scadenza_conferma > now()
     and l.scadenza_conferma <= now() + interval '26 hours'
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
         public.testo_lezione(l.id) || ': conferma entro ' || public.testo_quando(l.scadenza_conferma)
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
  if (select corso_id from public.orari_corso where id = p_vecchio)
     is distinct from (select corso_id from public.orari_corso where id = p_nuovo) then
    raise exception 'Il nuovo orario deve essere dello stesso corso';
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
  if (select corso_id from public.orari_corso where id = p_vecchio)
     is distinct from (select corso_id from public.orari_corso where id = p_nuovo) then
    raise exception 'Il nuovo orario deve essere dello stesso corso';
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

-- ---------------------------------------------------------------------
-- 5) Quando cambiano le impostazioni di un corso o di un orario,
--    le lezioni future si aggiornano da sole (posti e scadenza).
--    Non tocchiamo: lezioni già iniziate, annullate, modificate a mano,
--    e scadenze che finirebbero nel passato (per non liberare posti di colpo).
-- ---------------------------------------------------------------------
create or replace function public.ricalcola_lezioni(p_corso uuid, p_orario uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.lezioni l
     set capienza = coalesce(o.capienza, c.capienza),
         fine = l.inizio + make_interval(mins => o.durata_minuti)
    from public.orari_corso o, public.corsi c
   where o.id = l.orario_corso_id and c.id = l.corso_id
     and l.inizio > now() and not l.annullata and not l.personalizzata
     and (p_corso is null or l.corso_id = p_corso)
     and (p_orario is null or l.orario_corso_id = p_orario);

  update public.lezioni l
     set scadenza_conferma = public.calcola_scadenza(l.orario_corso_id, l.inizio)
   where l.inizio > now() and not l.annullata and not l.personalizzata
     and l.orario_corso_id is not null
     and (p_corso is null or l.corso_id = p_corso)
     and (p_orario is null or l.orario_corso_id = p_orario)
     and public.calcola_scadenza(l.orario_corso_id, l.inizio) > now();
end;
$$;
revoke execute on function public.ricalcola_lezioni(uuid, uuid) from public, anon, authenticated;

create or replace function public.ricalcola_da_corso()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.ricalcola_lezioni(new.id, null);
  return new;
end;
$$;
drop trigger if exists ricalcola_su_corso on public.corsi;
create trigger ricalcola_su_corso
  after update of capienza, scadenza_modo, scadenza_ora, scadenza_ore_prima on public.corsi
  for each row execute function public.ricalcola_da_corso();

create or replace function public.ricalcola_da_orario()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  perform public.ricalcola_lezioni(null, new.id);
  return new;
end;
$$;
drop trigger if exists ricalcola_su_orario on public.orari_corso;
create trigger ricalcola_su_orario
  after update of capienza, durata_minuti, scadenza_modo, scadenza_ora, scadenza_ore_prima on public.orari_corso
  for each row execute function public.ricalcola_da_orario();

-- ---------------------------------------------------------------------
-- 6) Modificare o annullare una singola lezione (staff)
-- ---------------------------------------------------------------------
create or replace function public.modifica_lezione(p_lezione uuid, p_capienza int, p_scadenza_locale text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_occupati int;
  v_l        record;
  v_scad     timestamptz;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  select * into v_l from public.lezioni where id = p_lezione for update;
  if not found then
    raise exception 'Lezione non trovata';
  end if;
  if p_capienza is null or p_capienza < 1 then
    raise exception 'Numero di posti non valido';
  end if;
  select count(*) into v_occupati from public.prenotazioni
   where lezione_id = p_lezione and stato in ('riservata', 'confermata');
  if p_capienza < v_occupati then
    raise exception 'Ci sono già % persone prenotate: non puoi scendere sotto', v_occupati;
  end if;

  -- La scadenza arriva dal modulo come ora italiana ("2026-11-14T17:00")
  v_scad := coalesce((nullif(trim(p_scadenza_locale), '')::timestamp at time zone 'Europe/Rome'), v_l.scadenza_conferma);
  if v_scad > v_l.inizio then
    raise exception 'La scadenza non può essere dopo l''inizio della lezione';
  end if;

  update public.lezioni
     set capienza = p_capienza, scadenza_conferma = v_scad, personalizzata = true
   where id = p_lezione;
end;
$$;

create or replace function public.annulla_lezione(p_lezione uuid, p_annulla boolean, p_motivo text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_n int := 0;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  update public.lezioni
     set annullata = p_annulla,
         motivo_annullamento = case when p_annulla then nullif(trim(p_motivo), '') end
   where id = p_lezione and annullata is distinct from p_annulla;
  if not found then
    return 0;
  end if;

  -- Avvisiamo chi ha un posto (app + notifica sul telefono)
  insert into public.notifiche (utente_id, tipo, titolo, testo, link, creata_da)
  select p.utente_id, 'lezione',
         case when p_annulla then 'Lezione annullata' else 'Lezione confermata di nuovo' end,
         public.testo_lezione(p_lezione) ||
           case when p_annulla then ' è annullata.'
                  || coalesce(' ' || nullif(trim(p_motivo), '') || case when trim(p_motivo) ~ '[.!?]$' then '' else '.' end, '')
                  || ' Ci scusiamo per il disagio.'
                else ' si farà regolarmente: il tuo posto è sempre valido.' end,
         '/area', auth.uid()
    from public.prenotazioni p
   where p.lezione_id = p_lezione and p.utente_id is not null and p.stato in ('riservata', 'confermata');
  get diagnostics v_n = row_count;

  insert into public.attivita (tipo, descrizione, lezione_id, autore_id)
  values ('lezione', case when p_annulla then 'Lezione annullata: ' else 'Lezione ripristinata: ' end
            || coalesce(public.nome_lezione(p_lezione), 'lezione')
            || case when v_n > 0 then ' (' || v_n || ' avvisati)' else '' end,
          p_lezione, auth.uid());
  return v_n;
end;
$$;

-- Sospendere un orario annulla le sue lezioni future (avvisando i prenotati);
-- riattivarlo le rimette in calendario
create or replace function public.sospendi_orario(p_orario uuid, p_attivo boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_tot int := 0;
  r record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  update public.orari_corso set attivo = p_attivo where id = p_orario;

  for r in
    select id from public.lezioni
     where orario_corso_id = p_orario and inizio > now() and annullata = p_attivo
  loop
    v_tot := v_tot + public.annulla_lezione(r.id, not p_attivo,
                       case when not p_attivo then 'L''orario è stato sospeso.' end);
  end loop;

  if p_attivo then
    perform public.genera_lezioni(28);
  end if;
  return v_tot;
end;
$$;

-- ---------------------------------------------------------------------
-- 7) I posti non confermati si liberano solo nelle lezioni non annullate
-- ---------------------------------------------------------------------
select cron.schedule(
  'libera-posti-non-confermati',
  '* * * * *',
  $$
    update public.prenotazioni p
       set stato = 'liberata'
      from public.lezioni l
     where p.lezione_id = l.id
       and p.stato = 'riservata'
       and not l.annullata
       and l.scadenza_conferma <= now();
  $$
);

revoke execute on function public.calcola_scadenza(uuid, timestamptz)        from public, anon;
revoke execute on function public.modifica_lezione(uuid, int, text)         from public, anon;
revoke execute on function public.annulla_lezione(uuid, boolean, text)      from public, anon;
revoke execute on function public.sospendi_orario(uuid, boolean)            from public, anon;
grant  execute on function public.modifica_lezione(uuid, int, text)         to authenticated;
grant  execute on function public.annulla_lezione(uuid, boolean, text)      to authenticated;
grant  execute on function public.sospendi_orario(uuid, boolean)            to authenticated;

-- ---------------------------------------------------------------------
-- 8) NUOTO LIBERO
--    Orari di partenza (da confermare con il responsabile):
--    lunedì-sabato dalle 8:00 alle 21:00, domenica dalle 9:00 alle 12:00,
--    turni da un'ora. 20 posti (5 corsie x 4 persone).
--    Gli abbonati confermano fino a 2 ore prima dell'inizio.
-- ---------------------------------------------------------------------
insert into public.corsi (nome, capienza, descrizione, giorni_abbonamento, scadenza_modo, scadenza_ore_prima)
values ('Nuoto libero', 20, '5 corsie · turni da un''ora', 2, 'ore_prima', 2)
on conflict (nome) do nothing;

insert into public.orari_corso (corso_id, giorno_settimana, ora_inizio, durata_minuti)
select c.id, g, make_time(h, 0, 0), 60
  from public.corsi c, generate_series(1, 6) g, generate_series(8, 20) h
 where c.nome = 'Nuoto libero'
union all
select c.id, 7, make_time(h, 0, 0), 60
  from public.corsi c, generate_series(9, 11) h
 where c.nome = 'Nuoto libero'
on conflict (corso_id, giorno_settimana, ora_inizio) do nothing;

-- Le lezioni delle prossime 4 settimane
select public.genera_lezioni(28) as lezioni_create;
