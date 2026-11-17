-- =====================================================================
--  Gestionale Piscina Sassocorvaro - CORSI SU MISURA, ELIMINAZIONI,
--  PAGAMENTI CON RICEVUTA e INGRESSO CON QR / TESSERA
--   1) corsi ancora più configurabili (scadenza "N giorni prima" o
--      "nessuna conferma", limite per disdire, regole degli ingressi
--      singoli, prezzi, durata predefinita, sospensione del corso)
--   2) eliminare un orario o un intero corso
--   3) pagamenti: data, modalità, importo, ricevuta numerata
--   4) ingresso: QR personale, tessera/braccialetto RFID o NFC,
--      controllo abbonamento e registro degli ingressi
--  Da eseguire DOPO 0001-0012, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) "Modalità silenziosa": certe operazioni automatiche (es. conferma
--    di massa, ingresso in reception) non devono mandare avvisi a
--    raffica ai clienti né riempire la cronologia.
--    Vale solo per la transazione in corso.
-- ---------------------------------------------------------------------
create or replace function public.silenzioso()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(current_setting('piscina.silenzioso', true), '') = '1';
$$;

-- ---------------------------------------------------------------------
-- 1) Corsi: tutte le impostazioni
-- ---------------------------------------------------------------------
--  scadenza_modo:
--    'stesso_giorno' -> il giorno della lezione entro scadenza_ora
--    'giorno_prima'  -> scadenza_giorni_prima giorni prima entro scadenza_ora
--    'ore_prima'     -> scadenza_ore_prima ore prima dell'inizio
--    'nessuna'       -> gli abbonati non devono confermare: il posto è già confermato
alter table public.corsi add column if not exists scadenza_giorni_prima int not null default 1;
alter table public.corsi add column if not exists disdetta_ore_prima    int not null default 0;     -- fino a quando il cliente può dire "non vengo"
alter table public.corsi add column if not exists ingressi_clienti      boolean not null default true; -- ingressi singoli prenotabili dall'app
alter table public.corsi add column if not exists ingressi_da           text not null default 'subito'; -- 'subito' | 'dopo_scadenza'
alter table public.corsi add column if not exists prenotabile_giorni    int not null default 7;     -- quanti giorni in anticipo
alter table public.corsi add column if not exists durata_predefinita    int not null default 45;
alter table public.corsi add column if not exists prezzo_ingresso       numeric(10,2);
alter table public.corsi add column if not exists prezzo_abbonamento    numeric(10,2);

alter table public.corsi drop constraint if exists corsi_impostazioni_check;
alter table public.corsi add constraint corsi_impostazioni_check check (
  giorni_abbonamento between 1 and 7
  and scadenza_modo in ('stesso_giorno', 'giorno_prima', 'ore_prima', 'nessuna')
  and scadenza_ore_prima between 0 and 72
  and scadenza_giorni_prima between 1 and 14
  and disdetta_ore_prima between 0 and 72
  and ingressi_da in ('subito', 'dopo_scadenza')
  and prenotabile_giorni between 1 and 60
  and durata_predefinita between 15 and 240
  and (prezzo_ingresso is null or prezzo_ingresso >= 0)
  and (prezzo_abbonamento is null or prezzo_abbonamento >= 0)
);

update public.corsi set durata_predefinita = 60 where nome = 'Nuoto libero';

alter table public.orari_corso add column if not exists scadenza_giorni_prima int;
alter table public.orari_corso drop constraint if exists orari_personalizzati_check;
alter table public.orari_corso add constraint orari_personalizzati_check check (
  (capienza is null or capienza > 0)
  and (scadenza_modo is null or scadenza_modo in ('stesso_giorno', 'giorno_prima', 'ore_prima', 'nessuna'))
  and (scadenza_ore_prima is null or scadenza_ore_prima between 0 and 72)
  and (scadenza_giorni_prima is null or scadenza_giorni_prima between 1 and 14)
);

-- La regola che vale per un orario (la sua, oppure quella del corso)
create or replace function public.modo_scadenza(p_orario uuid)
returns text language sql stable security definer set search_path = '' as $$
  select coalesce(o.scadenza_modo, c.scadenza_modo)
    from public.orari_corso o join public.corsi c on c.id = o.corso_id
   where o.id = p_orario;
$$;

create or replace function public.calcola_scadenza(p_orario uuid, p_inizio timestamptz)
returns timestamptz language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz     text := coalesce((select valore from public.impostazioni where chiave = 'fuso_orario'), 'Europe/Rome');
  v_modo   text;
  v_ora    time;
  v_ore    int;
  v_gg     int;
  v_giorno date := (p_inizio at time zone v_tz)::date;
  v_scad   timestamptz;
begin
  select coalesce(o.scadenza_modo, c.scadenza_modo),
         coalesce(o.scadenza_ora, c.scadenza_ora),
         coalesce(o.scadenza_ore_prima, c.scadenza_ore_prima),
         coalesce(o.scadenza_giorni_prima, c.scadenza_giorni_prima)
    into v_modo, v_ora, v_ore, v_gg
    from public.orari_corso o join public.corsi c on c.id = o.corso_id
   where o.id = p_orario;

  v_scad := case v_modo
    when 'nessuna'      then p_inizio
    when 'giorno_prima' then ((v_giorno - coalesce(v_gg, 1)) + coalesce(v_ora, '21:00')) at time zone v_tz
    when 'ore_prima'    then p_inizio - make_interval(hours => coalesce(v_ore, 2))
    else                     (v_giorno + coalesce(v_ora, '17:00')) at time zone v_tz
  end;
  -- Mai dopo l'inizio della lezione
  return least(v_scad, p_inizio);
end;
$$;

-- Il calendario: come prima, ma con "nessuna conferma" il posto
-- dell'abbonato nasce già confermato
create or replace function public.genera_lezioni(p_giorni int default 28)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_tz     text;
  v_oggi   date;
  v_nuove  int := 0;
  r        record;
begin
  if auth.uid() is not null and not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;

  v_tz   := coalesce((select valore from public.impostazioni where chiave = 'fuso_orario'), 'Europe/Rome');
  v_oggi := (now() at time zone v_tz)::date;

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

  -- Posti riservati agli abbonati: senza avvisi né righe in cronologia
  perform set_config('piscina.silenzioso', '1', true);
  for r in
    select l.id as lezione_id, a.utente_id,
           coalesce(public.modo_scadenza(l.orario_corso_id), 'stesso_giorno') = 'nessuna' as gia_confermato
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
      insert into public.prenotazioni (lezione_id, utente_id, tipo, stato, confermata_il)
      values (r.lezione_id, r.utente_id, 'abbonamento',
              case when r.gia_confermato then 'confermata' else 'riservata' end::public.stato_prenotazione,
              case when r.gia_confermato then now() end);
    exception when others then
      raise notice 'Posto non riservato (utente %, lezione %): %', r.utente_id, r.lezione_id, sqlerrm;
    end;
  end loop;
  perform set_config('piscina.silenzioso', '', true);

  return v_nuove;
end;
$$;

-- Quando cambiano le impostazioni: come prima, in più se ora la regola è
-- "nessuna conferma" i posti ancora da confermare diventano confermati
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

  perform set_config('piscina.silenzioso', '1', true);
  update public.prenotazioni p
     set stato = 'confermata', confermata_il = now()
    from public.lezioni l
   where p.lezione_id = l.id and p.stato = 'riservata'
     and l.inizio > now() and not l.annullata
     and l.orario_corso_id is not null
     and (p_corso is null or l.corso_id = p_corso)
     and (p_orario is null or l.orario_corso_id = p_orario)
     and public.modo_scadenza(l.orario_corso_id) = 'nessuna';
  perform set_config('piscina.silenzioso', '', true);
end;
$$;
revoke execute on function public.ricalcola_lezioni(uuid, uuid) from public, anon, authenticated;

drop trigger if exists ricalcola_su_corso on public.corsi;
create trigger ricalcola_su_corso
  after update of capienza, scadenza_modo, scadenza_ora, scadenza_ore_prima, scadenza_giorni_prima on public.corsi
  for each row execute function public.ricalcola_da_corso();

drop trigger if exists ricalcola_su_orario on public.orari_corso;
create trigger ricalcola_su_orario
  after update of capienza, durata_minuti, scadenza_modo, scadenza_ora, scadenza_ore_prima, scadenza_giorni_prima on public.orari_corso
  for each row execute function public.ricalcola_da_orario();

-- Cronologia delle prenotazioni (dalla 0010) + modalità silenziosa
create or replace function public.registra_prenotazione()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_chi     text := public.nome_persona(new.utente_id, new.nome_ospite);
  v_dove    text := public.nome_lezione(new.lezione_id);
  v_autore  uuid := auth.uid();
  v_staff   boolean := v_autore is not null and v_autore is distinct from new.utente_id;
  v_cliente boolean := coalesce(v_autore is not null and v_autore = new.utente_id, false);
  v_tipo    text;
  v_testo   text;
begin
  if public.silenzioso() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.stato = 'riservata' then
      return new;
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
      v_tipo := 'ripreso';
      v_testo := case when v_staff then 'Reception: posto riassegnato a ' || v_chi
                      else v_chi || ' ha ripreso il suo posto' end;
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

  insert into public.attivita (tipo, descrizione, utente_id, lezione_id, autore_id, da_cliente)
  values (v_tipo, v_testo || ' · ' || coalesce(v_dove, 'lezione'), new.utente_id, new.lezione_id, v_autore, v_cliente);
  return new;
end;
$$;

-- Avviso "Prenotazione confermata" (dalla 0011) + modalità silenziosa
create or replace function public.avvisa_prenotazione_confermata()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_autore uuid := auth.uid();
  v_titolo text;
begin
  if public.silenzioso() then
    return new;
  end if;
  if new.utente_id is null or new.stato <> 'confermata' or new.da_confermare_staff then
    return new;
  end if;

  if tg_op = 'INSERT' then
    v_titolo := 'Prenotazione confermata ✓';
  elsif old.da_confermare_staff and not new.da_confermare_staff then
    v_titolo := 'Prenotazione confermata ✓';
  elsif old.stato = 'liberata' and v_autore is distinct from new.utente_id then
    v_titolo := 'Prenotazione confermata ✓';
  elsif old.stato = 'riservata' and v_autore is distinct from new.utente_id then
    v_titolo := 'Presenza confermata dalla reception ✓';
  else
    return new;
  end if;

  insert into public.notifiche (utente_id, tipo, titolo, testo, link, creata_da, chiave)
  values (new.utente_id, 'lezione', v_titolo,
          coalesce(public.testo_lezione(new.lezione_id), 'La tua lezione') || '. Ti aspettiamo in vasca! 🏊',
          '/area', v_autore,
          'confermata:' || new.id || ':' || to_char(now(), 'YYYYMMDDHH24MI'))
  on conflict (chiave) do nothing;

  if tg_op = 'UPDATE' and old.da_confermare_staff and not new.da_confermare_staff then
    insert into public.attivita (tipo, descrizione, utente_id, lezione_id, autore_id)
    values ('conferma', 'Reception: ingresso confermato a ' || public.nome_persona(new.utente_id, new.nome_ospite)
              || ' · ' || coalesce(public.nome_lezione(new.lezione_id), 'lezione'),
            new.utente_id, new.lezione_id, v_autore);
  end if;
  return new;
end;
$$;

-- "Non vengo": ora rispetta il limite per disdire del corso
create or replace function public.disdici_prenotazione(p_prenotazione uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  select p.id, p.stato, p.tipo, p.utente_id, l.inizio, c.disdetta_ore_prima
    into v
    from public.prenotazioni p
    join public.lezioni l on l.id = p.lezione_id
    join public.corsi c on c.id = l.corso_id
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
  if v.disdetta_ore_prima > 0 and now() >= v.inizio - make_interval(hours => v.disdetta_ore_prima) then
    raise exception 'Si può disdire fino a % prima dell''inizio: contatta la reception',
      case when v.disdetta_ore_prima = 1 then '1 ora' else v.disdetta_ore_prima || ' ore' end;
  end if;

  if v.tipo = 'abbonamento' then
    update public.prenotazioni set stato = 'liberata' where id = p_prenotazione;
  else
    update public.prenotazioni set stato = 'annullata' where id = p_prenotazione;
  end if;
end;
$$;

-- Ingresso singolo dall'app: ora rispetta le regole del corso
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

  select l.id, l.inizio, l.annullata, l.scadenza_conferma,
         c.ingressi_clienti, c.ingressi_da, c.prenotabile_giorni, c.attivo
    into v_l
    from public.lezioni l join public.corsi c on c.id = l.corso_id
   where l.id = p_lezione;
  if not found or v_l.annullata or not v_l.attivo then
    raise exception 'Lezione non disponibile';
  end if;
  if v_l.inizio <= now() then
    raise exception 'La lezione è già iniziata';
  end if;
  if not v_l.ingressi_clienti then
    raise exception 'Per questo corso gli ingressi si prenotano solo in reception';
  end if;
  if v_l.inizio > now() + make_interval(days => v_l.prenotabile_giorni) then
    raise exception 'Questa lezione si potrà prenotare da % giorni prima', v_l.prenotabile_giorni;
  end if;
  if v_l.ingressi_da = 'dopo_scadenza' and now() < v_l.scadenza_conferma then
    raise exception 'Gli ingressi singoli per questa lezione si aprono %', public.testo_quando(v_l.scadenza_conferma);
  end if;

  select id, stato into v_es
    from public.prenotazioni
   where lezione_id = p_lezione and utente_id = auth.uid() and stato <> 'annullata';

  if found then
    if v_es.stato in ('riservata', 'confermata') then
      raise exception 'Hai già un posto in questa lezione';
    end if;
    update public.prenotazioni
       set stato = 'confermata', confermata_il = now(), da_confermare_staff = true
     where id = v_es.id;
  else
    insert into public.prenotazioni (lezione_id, utente_id, tipo, stato, confermata_il, da_confermare_staff)
    values (p_lezione, auth.uid(), 'ingresso_singolo', 'confermata', now(), true);
  end if;
end;
$$;

-- Sospendere / riattivare un intero corso: le lezioni future si annullano
-- (avvisando i prenotati) e poi tornano
create or replace function public.attiva_corso(p_corso uuid, p_attivo boolean)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_tot int := 0;
  v_motivo constant text := 'Il corso è stato sospeso.';
  r record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  update public.corsi set attivo = p_attivo where id = p_corso;
  if not found then
    raise exception 'Corso non trovato';
  end if;

  for r in
    select id from public.lezioni
     where corso_id = p_corso and inizio > now()
       and (case when p_attivo then annullata and motivo_annullamento = v_motivo else not annullata end)
  loop
    v_tot := v_tot + public.annulla_lezione(r.id, not p_attivo, case when not p_attivo then v_motivo end);
  end loop;

  if p_attivo then
    perform public.genera_lezioni(28);
  end if;
  return v_tot;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Eliminare un orario o un corso
--    Si blocca se ci sono abbonamenti ancora validi che lo usano:
--    prima vanno spostati o eliminati. Chi era prenotato nelle lezioni
--    future riceve l'avviso di annullamento. Le lezioni passate dell'orario
--    restano nello storico; con il corso se ne va tutto.
-- ---------------------------------------------------------------------
create or replace function public.elimina_orario(p_orario uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_n    int;
  v_tot  int := 0;
  v_nome text := public.nome_orario(p_orario);
  r record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  if not exists (select 1 from public.orari_corso where id = p_orario) then
    raise exception 'Orario non trovato';
  end if;
  select count(*) into v_n
    from public.abbonamenti_orari ao join public.abbonamenti a on a.id = ao.abbonamento_id
   where ao.orario_corso_id = p_orario and a.data_fine >= v_oggi;
  if v_n > 0 then
    raise exception 'Questo orario è il giorno fisso di % ancora valid%: prima cambia il loro giorno fisso',
      case when v_n = 1 then '1 abbonamento' else v_n || ' abbonamenti' end, case when v_n = 1 then 'o' else 'i' end;
  end if;

  for r in select id from public.lezioni where orario_corso_id = p_orario and inizio > now() and not annullata loop
    v_tot := v_tot + public.annulla_lezione(r.id, true, 'L''orario è stato eliminato.');
  end loop;

  delete from public.richieste_cambio where orario_vecchio_id = p_orario or orario_nuovo_id = p_orario;
  delete from public.abbonamenti_orari where orario_corso_id = p_orario;            -- solo abbonamenti scaduti
  delete from public.lezioni where orario_corso_id = p_orario and inizio > now();   -- le future (già annullate)
  update public.lezioni set orario_corso_id = null where orario_corso_id = p_orario; -- le passate restano
  delete from public.orari_corso where id = p_orario;

  insert into public.attivita (tipo, descrizione, autore_id)
  values ('eliminazione', 'Orario eliminato: ' || coalesce(v_nome, 'orario')
          || case when v_tot > 0 then ' (' || v_tot || ' prenotati avvisati)' else '' end, auth.uid());
  return v_tot;
end;
$$;

create or replace function public.elimina_corso(p_corso uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_oggi date := (now() at time zone 'Europe/Rome')::date;
  v_nome text;
  v_n    int;
  v_tot  int := 0;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Solo un amministratore può eliminare un corso';
  end if;
  select nome into v_nome from public.corsi where id = p_corso;
  if not found then
    raise exception 'Corso non trovato';
  end if;
  select count(distinct a.id) into v_n
    from public.abbonamenti_orari ao
    join public.orari_corso o on o.id = ao.orario_corso_id
    join public.abbonamenti a on a.id = ao.abbonamento_id
   where o.corso_id = p_corso and a.data_fine >= v_oggi;
  if v_n > 0 then
    raise exception '% ancora valid% per %: eliminali o aspetta che scadano (oppure sospendi il corso)',
      case when v_n = 1 then 'C''è 1 abbonamento' else 'Ci sono ' || v_n || ' abbonamenti' end,
      case when v_n = 1 then 'o' else 'i' end, v_nome;
  end if;

  for r in select id from public.lezioni where corso_id = p_corso and inizio > now() and not annullata loop
    v_tot := v_tot + public.annulla_lezione(r.id, true, 'Il corso non è più in programma.');
  end loop;

  delete from public.richieste_cambio rc
   using public.orari_corso o
   where o.corso_id = p_corso and (rc.orario_vecchio_id = o.id or rc.orario_nuovo_id = o.id);
  delete from public.abbonamenti_orari ao
   using public.orari_corso o
   where o.id = ao.orario_corso_id and o.corso_id = p_corso;
  delete from public.lezioni where corso_id = p_corso;        -- con le loro prenotazioni
  delete from public.orari_corso where corso_id = p_corso;
  delete from public.corsi where id = p_corso;

  insert into public.attivita (tipo, descrizione, autore_id)
  values ('eliminazione', 'Corso eliminato: ' || v_nome
          || case when v_tot > 0 then ' (' || v_tot || ' prenotati avvisati)' else '' end, auth.uid());
  return v_tot;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) PAGAMENTI e RICEVUTE
--    Ogni pagamento ha un numero di ricevuta progressivo per anno
--    (1/2026, 2/2026, …). Un pagamento sbagliato non si cancella:
--    si annulla (resta nello storico, la numerazione non ha buchi).
-- ---------------------------------------------------------------------
alter table public.abbonamenti add column if not exists prezzo numeric(10,2);
alter table public.abbonamenti drop constraint if exists abbonamenti_prezzo_check;
alter table public.abbonamenti add constraint abbonamenti_prezzo_check check (prezzo is null or prezzo >= 0);

create table if not exists public.pagamenti (
  id              uuid primary key default gen_random_uuid(),
  anno            int  not null,
  numero          int  not null,
  utente_id       uuid references public.profili(id) on delete set null,
  intestatario    text not null,                 -- il nome resta anche se l'utente viene eliminato
  abbonamento_id  uuid references public.abbonamenti(id) on delete set null,
  descrizione     text not null,
  importo         numeric(10,2) not null check (importo > 0),
  metodo          text not null check (metodo in ('contanti', 'carta', 'bancomat', 'bonifico', 'satispay', 'altro')),
  pagato_il       date not null,
  note            text,
  annullato       boolean not null default false,
  motivo_annullamento text,
  registrato_da   uuid references public.profili(id) on delete set null,
  creato_il       timestamptz not null default now(),
  unique (anno, numero)
);
create index if not exists pagamenti_data_idx on public.pagamenti (pagato_il desc);
create index if not exists pagamenti_abbonamento_idx on public.pagamenti (abbonamento_id);
create index if not exists pagamenti_utente_idx on public.pagamenti (utente_id);

alter table public.pagamenti enable row level security;
drop policy if exists "pagamenti: lettura" on public.pagamenti;
create policy "pagamenti: lettura" on public.pagamenti
  for select to authenticated using (utente_id = auth.uid() or public.is_staff());
-- Nessuna scrittura diretta: solo con le funzioni qui sotto (numerazione garantita)

insert into public.impostazioni (chiave, valore) values
  ('ricevuta_intestazione', 'Piscina Comunale di Sassocorvaro'),
  ('ricevuta_piede', 'Ricevuta di pagamento non fiscale.')
on conflict (chiave) do nothing;

-- "1234.5" -> "1.234,50"
create or replace function public.euro(p_importo numeric)
returns text language sql immutable set search_path = '' as $$
  select translate(to_char(round(coalesce(p_importo, 0), 2), 'FM999,999,990.00'), ',.', '.,');
$$;

-- Pagato del tutto? (senza prezzo basta un pagamento)
create or replace function public.aggiorna_stato_pagato(p_abbonamento uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_prezzo numeric;
  v_tot    numeric;
begin
  select prezzo into v_prezzo from public.abbonamenti where id = p_abbonamento;
  select coalesce(sum(importo), 0) into v_tot
    from public.pagamenti where abbonamento_id = p_abbonamento and not annullato;
  update public.abbonamenti
     set pagato = (v_tot > 0 and (v_prezzo is null or v_tot >= v_prezzo))
   where id = p_abbonamento;
end;
$$;
revoke execute on function public.aggiorna_stato_pagato(uuid) from public, anon, authenticated;

-- Cronologia degli abbonamenti (dalla 0005) + modalità silenziosa
create or replace function public.registra_abbonamento()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_chi text := public.nome_persona(new.utente_id, null);
begin
  if public.silenzioso() then
    return new;
  end if;
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

create or replace function public.registra_pagamento(
  p_utente        uuid,
  p_intestatario  text,
  p_abbonamento   uuid,
  p_descrizione   text,
  p_importo       numeric,
  p_metodo        text,
  p_data          date,
  p_note          text default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_abb    record;
  v_utente uuid := p_utente;
  v_nome   text;
  v_descr  text := nullif(trim(p_descrizione), '');
  v_anno   int;
  v_num    int;
  v_id     uuid;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  if p_importo is null or p_importo <= 0 or p_importo > 100000 then
    raise exception 'Importo non valido';
  end if;
  if p_metodo not in ('contanti', 'carta', 'bancomat', 'bonifico', 'satispay', 'altro') then
    raise exception 'Modalità di pagamento non valida';
  end if;
  if p_data is null or p_data > (now() at time zone 'Europe/Rome')::date then
    raise exception 'La data del pagamento non può essere nel futuro';
  end if;

  if p_abbonamento is not null then
    select id, utente_id, tipo into v_abb from public.abbonamenti where id = p_abbonamento;
    if not found then
      raise exception 'Abbonamento non trovato';
    end if;
    v_utente := v_abb.utente_id;
    v_descr  := coalesce(v_descr, 'Abbonamento ' || v_abb.tipo);
  end if;

  v_nome := coalesce(nullif(trim(p_intestatario), ''),
                     (select nullif(trim(nome || ' ' || cognome), '') from public.profili where id = v_utente));
  if v_nome is null then
    raise exception 'Scegli il cliente o scrivi a chi è intestata la ricevuta';
  end if;
  if v_descr is null then
    raise exception 'Scrivi per cosa è il pagamento';
  end if;

  -- Numero di ricevuta: uno alla volta, così due pagamenti nello stesso
  -- istante non prendono lo stesso numero
  v_anno := extract(year from p_data)::int;
  perform pg_advisory_xact_lock(424242, v_anno);
  select coalesce(max(numero), 0) + 1 into v_num from public.pagamenti where anno = v_anno;

  insert into public.pagamenti (anno, numero, utente_id, intestatario, abbonamento_id, descrizione,
                                importo, metodo, pagato_il, note, registrato_da)
  values (v_anno, v_num, v_utente, left(v_nome, 120), p_abbonamento, left(v_descr, 200),
          round(p_importo, 2), p_metodo, p_data, nullif(left(trim(p_note), 300), ''), auth.uid())
  returning id into v_id;

  if p_abbonamento is not null then
    perform set_config('piscina.silenzioso', '1', true);
    perform public.aggiorna_stato_pagato(p_abbonamento);
    perform set_config('piscina.silenzioso', '', true);
  end if;

  insert into public.attivita (tipo, descrizione, utente_id, autore_id)
  values ('pagamento',
          'Pagamento di € ' || public.euro(p_importo) || ' (' || p_metodo || ') da ' || v_nome
            || ' · ' || v_descr || ' · ricevuta n. ' || v_num || '/' || v_anno,
          v_utente, auth.uid());
  return v_id;
end;
$$;

create or replace function public.annulla_pagamento(p_pagamento uuid, p_motivo text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  if nullif(trim(p_motivo), '') is null then
    raise exception 'Scrivi il motivo dell''annullamento';
  end if;
  update public.pagamenti
     set annullato = true, motivo_annullamento = left(trim(p_motivo), 300)
   where id = p_pagamento and not annullato
  returning * into v;
  if not found then
    raise exception 'Pagamento non trovato o già annullato';
  end if;

  if v.abbonamento_id is not null then
    perform set_config('piscina.silenzioso', '1', true);
    perform public.aggiorna_stato_pagato(v.abbonamento_id);
    perform set_config('piscina.silenzioso', '', true);
  end if;

  insert into public.attivita (tipo, descrizione, utente_id, autore_id)
  values ('pagamento', 'Ricevuta n. ' || v.numero || '/' || v.anno || ' annullata (' || v.intestatario || '): ' || trim(p_motivo),
          v.utente_id, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------
-- 4) INGRESSO: QR personale, tessera o braccialetto (RFID / NFC)
-- ---------------------------------------------------------------------
-- Il codice del QR: lungo e casuale, impossibile da indovinare
alter table public.profili add column if not exists codice_ingresso text not null default replace(gen_random_uuid()::text, '-', '');
create unique index if not exists profili_codice_ingresso_idx on public.profili (codice_ingresso);
-- Il numero della tessera/braccialetto, come lo scrive il lettore
alter table public.profili add column if not exists tessera_rfid text;
create unique index if not exists profili_tessera_idx on public.profili (tessera_rfid) where tessera_rfid is not null;

alter table public.prenotazioni add column if not exists entrato_il timestamptz;

-- Tutto maiuscolo, senza "PSC:", spazi, due punti e trattini
-- ("04:a2:3f:1b" e "04A23F1B" sono la stessa tessera)
-- (il prefisso PSC del nostro QR si toglie anche se un lettore cambia i due punti)
create or replace function public.normalizza_codice(p_testo text)
returns text language sql immutable set search_path = '' as $$
  select nullif(regexp_replace(upper(regexp_replace(coalesce(p_testo, ''), '[^0-9A-Za-z]', '', 'g')), '^PSC', ''), '');
$$;

create table if not exists public.ingressi (
  id              bigint generated always as identity primary key,
  creato_il       timestamptz not null default now(),
  utente_id       uuid references public.profili(id) on delete set null,
  nome            text,
  esito           text not null check (esito in ('ok', 'attenzione', 'negato', 'forzato')),
  messaggi        text[] not null default '{}',
  lezione_id      uuid references public.lezioni(id) on delete set null,
  prenotazione_id uuid references public.prenotazioni(id) on delete set null,
  codice_letto    text,
  registrato_da   uuid references public.profili(id) on delete set null
);
create index if not exists ingressi_data_idx on public.ingressi (creato_il desc);
create index if not exists ingressi_utente_idx on public.ingressi (utente_id, creato_il desc);

alter table public.ingressi enable row level security;
drop policy if exists "ingressi: lettura" on public.ingressi;
create policy "ingressi: lettura" on public.ingressi
  for select to authenticated using (utente_id = auth.uid() or public.is_staff());

-- Nuovo QR (telefono perso, QR girato ad altri…): il vecchio smette di funzionare
create or replace function public.rigenera_codice_ingresso(p_utente uuid default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_chi uuid := coalesce(p_utente, auth.uid());
begin
  if auth.uid() is null then
    raise exception 'Devi prima accedere';
  end if;
  if v_chi <> auth.uid() and not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  update public.profili set codice_ingresso = replace(gen_random_uuid()::text, '-', '') where id = v_chi;
end;
$$;

-- Collega (o scollega, con codice vuoto) una tessera a una persona
create or replace function public.assegna_tessera(p_utente uuid, p_codice text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_cod  text := public.normalizza_codice(p_codice);
  v_altro text;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  if v_cod is not null and length(v_cod) < 4 then
    raise exception 'Numero di tessera troppo corto';
  end if;
  select public.nome_persona(id, null) into v_altro
    from public.profili where tessera_rfid = v_cod and id <> p_utente;
  if v_altro is not null then
    raise exception 'Questa tessera è già assegnata a %', v_altro;
  end if;
  update public.profili set tessera_rfid = v_cod where id = p_utente;
end;
$$;

-- Il cuore dell'ingresso: la reception legge il codice, il database
-- controlla tutto e risponde con verde / giallo / rosso.
--   ok         -> tutto a posto, entrato
--   attenzione -> entrato, ma c'è qualcosa da sistemare (es. da pagare)
--   negato     -> non risulta niente di valido (si può forzare)
--   forzato    -> la reception l'ha fatto entrare comunque
create or replace function public.registra_ingresso(p_codice text, p_forza boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_cod     text := public.normalizza_codice(p_codice);
  v_oggi    date := (now() at time zone 'Europe/Rome')::date;
  v_u       record;
  v_p       record;
  v_esito   text := 'ok';
  v_msg     text[] := '{}';
  v_abb     jsonb := '[]'::jsonb;
  v_validi  int := 0;
  v_ultimo  timestamptz;
  v_lezione text;
  v_nome    text;
  v_trovata boolean;
  v_lid     uuid;   -- la lezione trovata
  v_pid     uuid;   -- la sua prenotazione
  r         record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  if v_cod is null or length(v_cod) < 4 then
    raise exception 'Codice non valido';
  end if;

  select id, nome, cognome, attivo, telefono into v_u
    from public.profili
   where upper(codice_ingresso) = v_cod or tessera_rfid = v_cod
   limit 1;

  if not found then
    insert into public.ingressi (esito, messaggi, codice_letto, registrato_da)
    values ('negato', array['Codice non riconosciuto'], left(p_codice, 80), auth.uid());
    return jsonb_build_object(
      'esito', 'negato', 'nome', null, 'utente_id', null, 'lezione', null, 'abbonamenti', '[]'::jsonb,
      'messaggi', jsonb_build_array('Codice non riconosciuto: QR o tessera non assegnati a nessuno.'));
  end if;
  v_nome := nullif(trim(v_u.nome || ' ' || v_u.cognome), '');

  -- a) Account
  if not v_u.attivo then
    v_esito := 'negato';
    v_msg := array_append(v_msg, 'Account disattivato');
  end if;

  -- b) Già entrato poco fa?
  select max(creato_il) into v_ultimo
    from public.ingressi
   where utente_id = v_u.id and esito in ('ok', 'attenzione', 'forzato') and creato_il > now() - interval '3 hours';

  -- c) Abbonamenti validi oggi
  for r in
    select id, tipo, data_fine, pagato, prezzo,
           (select coalesce(sum(importo), 0) from public.pagamenti x where x.abbonamento_id = a.id and not x.annullato) as versato
      from public.abbonamenti a
     where utente_id = v_u.id and v_oggi between data_inizio and data_fine
     order by data_fine
  loop
    v_validi := v_validi + 1;
    v_abb := v_abb || jsonb_build_object('id', r.id, 'tipo', r.tipo, 'data_fine', r.data_fine, 'pagato', r.pagato);
    if not r.pagato then
      if v_esito = 'ok' then v_esito := 'attenzione'; end if;
      v_msg := array_append(v_msg, (r.tipo || ': da pagare'
        || case when r.prezzo is not null and r.versato > 0
                then ' (mancano € ' || public.euro(r.prezzo - r.versato) || ')' else '' end));
    end if;
    if r.data_fine - v_oggi <= 7 then
      v_msg := array_append(v_msg, (r.tipo || ': scade ' || case when r.data_fine = v_oggi then 'oggi' else 'il ' || to_char(r.data_fine, 'DD/MM') end));
    end if;
  end loop;

  -- d) La sua lezione di adesso (da 90 minuti prima fino alla fine)
  select p.id, p.stato, p.tipo, p.entrato_il, p.da_confermare_staff, l.id as lezione_id, l.inizio
    into v_p
    from public.prenotazioni p
    join public.lezioni l on l.id = p.lezione_id
   where p.utente_id = v_u.id
     and p.stato in ('riservata', 'confermata', 'liberata')
     and not l.annullata
     and l.inizio <= now() + interval '90 minutes'
     and l.fine > now()
   order by (p.stato = 'liberata'), abs(extract(epoch from l.inizio - now()))
   limit 1
   for update of p;
  v_trovata := found;

  perform set_config('piscina.silenzioso', '1', true);
  if v_trovata then
    v_lid := v_p.lezione_id;
    v_pid := v_p.id;
    v_lezione := public.testo_lezione(v_lid);
    if v_p.stato = 'confermata' then
      update public.prenotazioni set entrato_il = coalesce(entrato_il, now()), da_confermare_staff = false where id = v_p.id;
    elsif v_p.stato = 'riservata' then
      update public.prenotazioni
         set stato = 'confermata', confermata_il = now(), entrato_il = now()
       where id = v_p.id;
      v_msg := array_append(v_msg, 'Presenza confermata ora');
    else -- liberata: non aveva confermato
      begin
        update public.prenotazioni
           set stato = 'confermata', confermata_il = now(), entrato_il = now()
         where id = v_p.id;
        if v_esito = 'ok' then v_esito := 'attenzione'; end if;
        v_msg := array_append(v_msg, 'Non aveva confermato: posto ripreso (c''era ancora spazio)');
      exception when others then
        if v_esito = 'ok' then v_esito := 'attenzione'; end if;
        v_msg := array_append(v_msg, 'Non aveva confermato e la lezione ora è al completo');
      end;
    end if;
    if v_p.tipo = 'ingresso_singolo' then
      v_msg := array_append(v_msg, 'Ingresso singolo');
    end if;
  else
    if v_validi = 0 then
      v_esito := 'negato';
      v_msg := array_append(v_msg, 'Nessun abbonamento valido e nessuna prenotazione per adesso');
    else
      if v_esito = 'ok' then v_esito := 'attenzione'; end if;
      v_msg := array_append(v_msg, 'Nessuna prenotazione per le lezioni di adesso');
    end if;
  end if;
  perform set_config('piscina.silenzioso', '', true);

  if v_ultimo is not null then
    if v_esito = 'ok' then v_esito := 'attenzione'; end if;
    v_msg := array_append(v_msg, ('Già entrato oggi alle ' || to_char(v_ultimo at time zone 'Europe/Rome', 'HH24:MI')));
  end if;

  if v_esito = 'negato' and p_forza then
    v_esito := 'forzato';
    v_msg := array_append(v_msg, 'Fatto entrare dalla reception');
  end if;

  insert into public.ingressi (utente_id, nome, esito, messaggi, lezione_id, prenotazione_id, codice_letto, registrato_da)
  values (v_u.id, v_nome, v_esito, v_msg, v_lid, v_pid, left(p_codice, 80), auth.uid());

  insert into public.attivita (tipo, descrizione, utente_id, lezione_id, autore_id)
  values ('ingresso',
          case v_esito when 'ok' then 'Entrato: ' when 'attenzione' then 'Entrato (con avviso): '
                       when 'forzato' then 'Entrato (forzato): ' else 'Ingresso rifiutato: ' end
            || coalesce(v_nome, 'Qualcuno') || coalesce(' · ' || v_lezione, '')
            || case when array_length(v_msg, 1) > 0 and v_esito <> 'ok' then ' — ' || array_to_string(v_msg, ', ') else '' end,
          v_u.id, v_lid, auth.uid());

  return jsonb_build_object(
    'esito', v_esito,
    'nome', coalesce(v_nome, 'Senza nome'),
    'utente_id', v_u.id,
    'telefono', v_u.telefono,
    'lezione', v_lezione,
    'abbonamenti', v_abb,
    'messaggi', to_jsonb(v_msg));
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Chi può chiamare cosa
-- ---------------------------------------------------------------------
revoke execute on function public.silenzioso()                                   from public, anon;
revoke execute on function public.modo_scadenza(uuid)                            from public, anon;
revoke execute on function public.attiva_corso(uuid, boolean)                    from public, anon;
revoke execute on function public.elimina_orario(uuid)                           from public, anon;
revoke execute on function public.elimina_corso(uuid)                            from public, anon;
revoke execute on function public.registra_pagamento(uuid, text, uuid, text, numeric, text, date, text) from public, anon;
revoke execute on function public.annulla_pagamento(uuid, text)                  from public, anon;
revoke execute on function public.normalizza_codice(text)                        from public, anon;
revoke execute on function public.euro(numeric)                                 from public, anon;
revoke execute on function public.rigenera_codice_ingresso(uuid)                 from public, anon;
revoke execute on function public.assegna_tessera(uuid, text)                    from public, anon;
revoke execute on function public.registra_ingresso(text, boolean)               from public, anon;
grant  execute on function public.attiva_corso(uuid, boolean)                    to authenticated;
grant  execute on function public.elimina_orario(uuid)                           to authenticated;
grant  execute on function public.elimina_corso(uuid)                            to authenticated;
grant  execute on function public.registra_pagamento(uuid, text, uuid, text, numeric, text, date, text) to authenticated;
grant  execute on function public.annulla_pagamento(uuid, text)                  to authenticated;
grant  execute on function public.rigenera_codice_ingresso(uuid)                 to authenticated;
grant  execute on function public.assegna_tessera(uuid, text)                    to authenticated;
grant  execute on function public.registra_ingresso(text, boolean)               to authenticated;
