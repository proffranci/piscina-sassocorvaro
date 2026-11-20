-- =====================================================================
--  Gestionale Piscina Sassocorvaro - CORSIE, CARNET, ORARI, ABBONAMENTI
--  (decisioni dell'incontro con il titolare)
--   1) corsi "a corsie" (nuoto libero): posti = corsie aperte x persone
--      per corsia; le corsie aperte si decidono per ogni turno della
--      settimana tipo e, se serve, per un singolo giorno
--   2) nuoto libero senza abbonamento: solo ingressi singoli o CARNET
--   3) spostare un orario (giorno, ora, durata) senza ricrearlo
--   4) chiudere in anticipo o eliminare un abbonamento
--   5) disdetta fino a 2 ore prima, prenotazioni a 1 settimana
--   6) corretto: "nessuna conferma" + "solo dopo l'orario limite"
--  Da eseguire DOPO 0001-0015, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Corsie
-- ---------------------------------------------------------------------
alter table public.corsi add column if not exists usa_corsie         boolean not null default false;
alter table public.corsi add column if not exists corsie_max         int not null default 5;
alter table public.corsi add column if not exists persone_per_corsia int not null default 7;
alter table public.corsi add column if not exists abbonabile         boolean not null default true; -- abbonamenti a giorni fissi
alter table public.corsi drop constraint if exists corsi_corsie_check;
alter table public.corsi add constraint corsi_corsie_check check (corsie_max between 1 and 10 and persone_per_corsia between 1 and 10);

alter table public.orari_corso add column if not exists corsie int;  -- vuoto = tutte (corsie_max)
alter table public.orari_corso drop constraint if exists orari_corsie_check;
alter table public.orari_corso add constraint orari_corsie_check check (corsie is null or corsie between 1 and 10);

alter table public.lezioni add column if not exists corsie int;      -- corsie aperte in quella lezione
alter table public.prenotazioni add column if not exists corsia int; -- assegnata in reception

-- Corsie aperte e posti di un orario
create or replace function public.corsie_orario(p_orario uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when c.usa_corsie then least(coalesce(o.corsie, c.corsie_max), c.corsie_max) end
    from public.orari_corso o join public.corsi c on c.id = o.corso_id
   where o.id = p_orario;
$$;

create or replace function public.capienza_orario(p_orario uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when c.usa_corsie
              then least(coalesce(o.corsie, c.corsie_max), c.corsie_max) * c.persone_per_corsia
              else coalesce(o.capienza, c.capienza) end
    from public.orari_corso o join public.corsi c on c.id = o.corso_id
   where o.id = p_orario;
$$;

-- Quante persone ci sono in ogni corsia di una lezione: [{"n":1,"persone":3}, …]
create or replace function public.occupazione_corsie(p_lezione uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select case when l.corsie is null then null else
    (select jsonb_agg(jsonb_build_object('n', g,
              'persone', (select count(*) from public.prenotazioni p
                           where p.lezione_id = l.id and p.corsia = g and p.stato in ('riservata', 'confermata')))
            order by g)
       from generate_series(1, l.corsie) g)
  end
  from public.lezioni l where l.id = p_lezione;
$$;

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
    insert into public.lezioni (corso_id, orario_corso_id, inizio, fine, capienza, corsie, scadenza_conferma)
    select
      o.corso_id,
      o.id,
      (g.giorno + o.ora_inizio) at time zone v_tz,
      (g.giorno + o.ora_inizio + make_interval(mins => o.durata_minuti)) at time zone v_tz,
      public.capienza_orario(o.id),
      public.corsie_orario(o.id),
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


create or replace function public.ricalcola_lezioni(p_corso uuid, p_orario uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.lezioni l
     set capienza = public.capienza_orario(o.id),
         corsie   = public.corsie_orario(o.id),
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
  after update of capienza, scadenza_modo, scadenza_ora, scadenza_ore_prima, scadenza_giorni_prima,
                  usa_corsie, corsie_max, persone_per_corsia on public.corsi
  for each row execute function public.ricalcola_da_corso();

drop trigger if exists ricalcola_su_orario on public.orari_corso;
create trigger ricalcola_su_orario
  after update of capienza, durata_minuti, scadenza_modo, scadenza_ora, scadenza_ore_prima, scadenza_giorni_prima, corsie
  on public.orari_corso
  for each row execute function public.ricalcola_da_orario();

-- Modificare UNA lezione (es. "martedì 25 solo 3 corsie")
drop function if exists public.modifica_lezione(uuid, int, text);
create or replace function public.modifica_lezione(p_lezione uuid, p_capienza int, p_scadenza_locale text, p_corsie int default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_occupati int;
  v_l        record;
  v_scad     timestamptz;
  v_cap      int := p_capienza;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  select l.*, c.usa_corsie, c.corsie_max, c.persone_per_corsia
    into v_l
    from public.lezioni l join public.corsi c on c.id = l.corso_id
   where l.id = p_lezione
     for update of l;
  if not found then
    raise exception 'Lezione non trovata';
  end if;
  if v_l.usa_corsie and p_corsie is not null then
    if p_corsie < 1 or p_corsie > v_l.corsie_max then
      raise exception 'Corsie: da 1 a %', v_l.corsie_max;
    end if;
    if exists (select 1 from public.prenotazioni where lezione_id = p_lezione and corsia > p_corsie
                 and stato in ('riservata', 'confermata')) then
      raise exception 'C''è gente assegnata a una corsia che vuoi chiudere: spostala prima';
    end if;
    v_cap := p_corsie * v_l.persone_per_corsia;
  end if;
  if v_cap is null or v_cap < 1 then
    raise exception 'Numero di posti non valido';
  end if;
  select count(*) into v_occupati from public.prenotazioni
   where lezione_id = p_lezione and stato in ('riservata', 'confermata');
  if v_cap < v_occupati then
    raise exception 'Ci sono già % persone prenotate: non puoi scendere sotto', v_occupati;
  end if;

  -- La scadenza arriva dal modulo come ora italiana ("2026-11-14T17:00")
  v_scad := coalesce((nullif(trim(p_scadenza_locale), '')::timestamp at time zone 'Europe/Rome'), v_l.scadenza_conferma);
  if v_scad > v_l.inizio then
    raise exception 'La scadenza non può essere dopo l''inizio della lezione';
  end if;

  update public.lezioni
     set capienza = v_cap,
         corsie = case when v_l.usa_corsie then coalesce(p_corsie, v_l.corsie) else null end,
         scadenza_conferma = v_scad, personalizzata = true
   where id = p_lezione;
end;
$$;

-- Assegnare / cambiare la corsia di una persona in una lezione
create or replace function public.assegna_corsia(p_prenotazione uuid, p_corsia int)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  select p.id, l.corsie into v
    from public.prenotazioni p join public.lezioni l on l.id = p.lezione_id
   where p.id = p_prenotazione;
  if not found then
    raise exception 'Prenotazione non trovata';
  end if;
  if p_corsia is not null and (v.corsie is null or p_corsia < 1 or p_corsia > v.corsie) then
    raise exception 'Corsia non valida';
  end if;
  update public.prenotazioni set corsia = p_corsia where id = p_prenotazione;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Spostare un orario: cambia giorno, ora o durata. Le lezioni future
--    vengono rifatte all'orario nuovo (chi era prenotato riceve l'avviso);
--    gli abbonati che lo avevano come giorno fisso lo seguono.
-- ---------------------------------------------------------------------
create or replace function public.sposta_orario(p_orario uuid, p_giorno int, p_ora time, p_durata int)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_o      record;
  v_tot    int := 0;
  v_motivo text;
  r        record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  if p_giorno not between 1 and 7 or p_ora is null or p_durata not between 15 and 240 then
    raise exception 'Giorno, ora o durata non validi';
  end if;
  select * into v_o from public.orari_corso where id = p_orario for update;
  if not found then
    raise exception 'Orario non trovato';
  end if;
  if v_o.giorno_settimana = p_giorno and v_o.ora_inizio = p_ora and v_o.durata_minuti = p_durata then
    return 0;
  end if;
  if exists (select 1 from public.orari_corso where corso_id = v_o.corso_id and giorno_settimana = p_giorno
               and ora_inizio = p_ora and id <> p_orario) then
    raise exception 'Esiste già un orario di questo corso in quel giorno a quell''ora';
  end if;

  -- Solo durata cambiata: basta aggiornare (il ricalcolo sistema le lezioni)
  if v_o.giorno_settimana = p_giorno and v_o.ora_inizio = p_ora then
    update public.orari_corso set durata_minuti = p_durata where id = p_orario;
    return 0;
  end if;

  v_motivo := 'L''orario è stato spostato a ' || (array['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'])[p_giorno] || ' alle ' || to_char(p_ora, 'HH24:MI') || '.';
  for r in select id from public.lezioni where orario_corso_id = p_orario and inizio > now() and not annullata loop
    v_tot := v_tot + public.annulla_lezione(r.id, true, v_motivo);
  end loop;
  delete from public.lezioni where orario_corso_id = p_orario and inizio > now();

  update public.orari_corso set giorno_settimana = p_giorno, ora_inizio = p_ora, durata_minuti = p_durata where id = p_orario;
  perform public.genera_lezioni(28);

  insert into public.attivita (tipo, descrizione, autore_id)
  values ('corso', 'Orario spostato: ' || coalesce(public.nome_orario(p_orario), 'orario')
          || case when v_tot > 0 then ' (' || v_tot || ' prenotati avvisati)' else '' end, auth.uid());
  return v_tot;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) CARNET: un "abbonamento" a numero di ingressi, senza giorni fissi
--    (es. 10 ingressi di nuoto libero, validi 6 mesi). Si paga e si
--    verifica come gli abbonamenti; a ogni ingresso se ne scala uno.
-- ---------------------------------------------------------------------
alter table public.abbonamenti add column if not exists ingressi_totali int;
alter table public.abbonamenti add column if not exists corso_id uuid references public.corsi(id) on delete set null;
alter table public.abbonamenti drop constraint if exists abbonamenti_carnet_check;
alter table public.abbonamenti add constraint abbonamenti_carnet_check check (ingressi_totali is null or ingressi_totali between 1 and 200);
alter table public.ingressi add column if not exists carnet_id uuid references public.abbonamenti(id) on delete set null;
create index if not exists ingressi_carnet_idx on public.ingressi (carnet_id) where carnet_id is not null;

create or replace function public.carnet_rimasti(p_abbonamento uuid)
returns int language sql stable security definer set search_path = '' as $$
  select case when a.ingressi_totali is null then null
              else a.ingressi_totali - (select count(*) from public.ingressi i where i.carnet_id = a.id)::int end
    from public.abbonamenti a where a.id = p_abbonamento;
$$;

-- ---------------------------------------------------------------------
-- 4) Chiudere in anticipo / eliminare un abbonamento
--    I posti già riservati dopo la chiusura si liberano (senza avvisi).
-- ---------------------------------------------------------------------
create or replace function public.libera_posti_abbonamento(p_abbonamento uuid, p_dopo date)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v_n int;
begin
  perform set_config('piscina.silenzioso', '1', true);
  delete from public.prenotazioni p
   using public.lezioni l, public.abbonamenti a, public.abbonamenti_orari ao
   where p.lezione_id = l.id
     and a.id = p_abbonamento and p.utente_id = a.utente_id and p.tipo = 'abbonamento'
     and ao.abbonamento_id = a.id and ao.orario_corso_id = l.orario_corso_id
     and l.inizio > now()
     and (l.inizio at time zone 'Europe/Rome')::date > p_dopo
     and p.entrato_il is null;
  get diagnostics v_n = row_count;
  perform set_config('piscina.silenzioso', '', true);
  return v_n;
end;
$$;
revoke execute on function public.libera_posti_abbonamento(uuid, date) from public, anon, authenticated;

create or replace function public.chiudi_abbonamento(p_abbonamento uuid, p_ultimo_giorno date, p_motivo text default null)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_n int;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  select * into v from public.abbonamenti where id = p_abbonamento for update;
  if not found then
    raise exception 'Abbonamento non trovato';
  end if;
  if p_ultimo_giorno is null or p_ultimo_giorno < v.data_inizio then
    raise exception 'L''ultimo giorno non può essere prima dell''inizio (se non è mai partito, eliminalo)';
  end if;
  if p_ultimo_giorno >= v.data_fine then
    raise exception 'L''abbonamento finisce già il %', to_char(v.data_fine, 'DD/MM/YYYY');
  end if;

  update public.abbonamenti
     set data_fine = p_ultimo_giorno,
         note = concat_ws(E'
', note, 'Chiuso in anticipo il ' || to_char(now() at time zone 'Europe/Rome', 'DD/MM/YYYY')
                                       || coalesce(': ' || nullif(trim(p_motivo), ''), ''))
   where id = p_abbonamento;
  v_n := public.libera_posti_abbonamento(p_abbonamento, p_ultimo_giorno);

  insert into public.attivita (tipo, descrizione, utente_id, autore_id)
  values ('abbonamento', 'Abbonamento chiuso in anticipo: ' || public.nome_persona(v.utente_id, null) || ' · ' || v.tipo
          || ' (ultimo giorno ' || to_char(p_ultimo_giorno, 'DD/MM') || ')', v.utente_id, auth.uid());
  return v_n;
end;
$$;

create or replace function public.elimina_abbonamento(p_abbonamento uuid)
returns int language plpgsql security definer set search_path = '' as $$
declare
  v record;
  v_n int;
begin
  if not public.is_admin() then
    raise exception 'Solo un amministratore può eliminare un abbonamento';
  end if;
  select * into v from public.abbonamenti where id = p_abbonamento;
  if not found then
    raise exception 'Abbonamento non trovato';
  end if;
  v_n := public.libera_posti_abbonamento(p_abbonamento, (now() at time zone 'Europe/Rome')::date - 1);
  delete from public.abbonamenti where id = p_abbonamento; -- le ricevute restano (senza collegamento)

  insert into public.attivita (tipo, descrizione, utente_id, autore_id)
  values ('eliminazione', 'Abbonamento eliminato: ' || public.nome_persona(v.utente_id, null) || ' · ' || v.tipo,
          v.utente_id, auth.uid());
  return v_n;
end;
$$;

-- ---------------------------------------------------------------------
-- 5) Regole decise: prenotazioni a 1 settimana, disdetta fino a 2 ore prima,
--    nuoto libero a corsie (5 x 7) solo con ingressi singoli o carnet
-- ---------------------------------------------------------------------
alter table public.corsi alter column disdetta_ore_prima set default 2;
update public.corsi set disdetta_ore_prima = 2 where disdetta_ore_prima = 0;
update public.corsi set prenotabile_giorni = 7;

update public.corsi
   set usa_corsie = true, corsie_max = 5, persone_per_corsia = 7, abbonabile = false,
       scadenza_modo = 'nessuna', ingressi_clienti = true, ingressi_da = 'subito',
       descrizione = coalesce(nullif(descrizione, ''), '5 corsie · turni da un''ora')
 where nome = 'Nuoto libero';

-- Le lezioni già in calendario prendono subito le nuove regole
select public.ricalcola_lezioni(id, null) from public.corsi;

-- ---------------------------------------------------------------------
-- 6) Correzione e ingresso con carnet e corsia
-- ---------------------------------------------------------------------
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
  -- (con "nessuna conferma" l'orario limite coincide con l'inizio: la regola non vale)
  if v_l.ingressi_da = 'dopo_scadenza' and v_l.scadenza_conferma < v_l.inizio and now() < v_l.scadenza_conferma then
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


create or replace function public.controlla_codice(p_codice text)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_oggi    date := (now() at time zone 'Europe/Rome')::date;
  v_id      uuid;
  v_u       record;
  v_esito   text := 'ok';
  v_avvisi  text[] := '{}';   -- cose da controllare (⚠️)
  v_info    text[] := '{}';   -- solo per sapere
  v_abb     jsonb := '[]'::jsonb;
  v_validi  int := 0;
  v_stato   text;
  v_residuo numeric;
  v_lezioni jsonb;
  v_prossima text;
  v_proposte jsonb;
  v_ultimo  timestamptz;
  r         record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  if coalesce(length(public.normalizza_codice(p_codice)), 0) < 4 then
    raise exception 'Codice non valido';
  end if;

  v_id := public.trova_codice(p_codice);
  if v_id is null then
    return jsonb_build_object('trovato', false, 'esito', 'negato',
      'avvisi', jsonb_build_array('Codice non riconosciuto: QR o tessera non assegnati a nessuno.'));
  end if;
  select id, nome, cognome, attivo, telefono into v_u from public.profili where id = v_id;

  if not v_u.attivo then
    v_esito := 'negato';
    v_avvisi := array_append(v_avvisi, 'Account disattivato');
  end if;

  -- a) Abbonamenti validi oggi, con lo stato del pagamento
  for r in
    select a.id, a.tipo, a.data_fine, a.pagato, a.prezzo, a.pagare_entro, a.ingressi_totali, a.corso_id,
           public.carnet_rimasti(a.id) as rimasti,
           (select coalesce(sum(importo), 0) from public.pagamenti x where x.abbonamento_id = a.id and not x.annullato and x.verificato) as versato,
           (select coalesce(sum(importo), 0) from public.pagamenti x where x.abbonamento_id = a.id and not x.annullato and not x.verificato) as in_attesa
      from public.abbonamenti a
     where a.utente_id = v_id and v_oggi between a.data_inizio and a.data_fine
     order by a.data_fine
  loop
    v_validi := v_validi + 1;
    v_stato := case when r.pagato then 'pagato'
                    when r.in_attesa > 0 and (r.prezzo is null or r.versato + r.in_attesa >= r.prezzo) then 'in_verifica'
                    when r.versato + r.in_attesa > 0 then 'acconto'
                    else 'da_pagare' end;
    v_residuo := case when r.prezzo is null then null else greatest(r.prezzo - r.versato - r.in_attesa, 0) end;

    if v_stato in ('da_pagare', 'acconto') then
      if r.pagare_entro < v_oggi then
        v_avvisi := array_append(v_avvisi, r.tipo || ': pagamento scaduto il ' || to_char(r.pagare_entro, 'DD/MM')
                     || coalesce(' (mancano € ' || public.euro(v_residuo) || ')', ''));
      elsif r.pagare_entro - v_oggi <= 7 then
        v_avvisi := array_append(v_avvisi, r.tipo || ': da pagare entro ' ||
                     case when r.pagare_entro = v_oggi then 'oggi' else 'il ' || to_char(r.pagare_entro, 'DD/MM') end
                     || coalesce(' (€ ' || public.euro(v_residuo) || ')', ''));
      else
        v_info := array_append(v_info, r.tipo || ': da pagare entro il ' || to_char(r.pagare_entro, 'DD/MM'));
      end if;
    elsif v_stato = 'in_verifica' then
      v_info := array_append(v_info, r.tipo || ': pagato, in verifica dall''admin');
    end if;
    if r.data_fine - v_oggi <= 7 then
      v_info := array_append(v_info, r.tipo || ': scade ' ||
                 case when r.data_fine = v_oggi then 'oggi' else 'il ' || to_char(r.data_fine, 'DD/MM') end);
    end if;

    if r.ingressi_totali is not null then
      v_info := array_append(v_info, r.tipo || ': ' || case when r.rimasti > 0
                  then 'restano ' || r.rimasti || ' ingress' || case when r.rimasti = 1 then 'o' else 'i' end
                  else 'carnet esaurito' end);
    end if;
    v_abb := v_abb || jsonb_build_object('id', r.id, 'tipo', r.tipo, 'data_fine', r.data_fine, 'stato', v_stato,
                                         'pagare_entro', r.pagare_entro, 'residuo', v_residuo,
                                         'carnet', r.ingressi_totali is not null, 'rimasti', r.rimasti,
                                         'corso_id', r.corso_id);
  end loop;
  if v_validi = 0 then
    v_info := array_append(v_info, 'Nessun abbonamento o carnet valido oggi');
  end if;

  -- b) Le sue lezioni di oggi (tutte, con quelle "di adesso" in evidenza)
  select coalesce(jsonb_agg(jsonb_build_object(
           'prenotazione_id', p.id, 'lezione_id', l.id, 'corso', c.nome,
           'ora', to_char(l.inizio at time zone 'Europe/Rome', 'HH24:MI'),
           'stato', p.stato, 'tipo', p.tipo, 'entrato_il', p.entrato_il,
           'corso_id', c.id, 'corsia', p.corsia, 'corsie', public.occupazione_corsie(l.id),
           'adesso', l.inizio <= now() + interval '90 minutes' and l.fine > now(),
           'finita', l.fine <= now())
         order by l.inizio), '[]'::jsonb)
    into v_lezioni
    from public.prenotazioni p
    join public.lezioni l on l.id = p.lezione_id
    join public.corsi c on c.id = l.corso_id
   where p.utente_id = v_id and p.stato <> 'annullata' and not l.annullata
     and (l.inizio at time zone 'Europe/Rome')::date = v_oggi;

  -- La prossima lezione dopo oggi (per sapere quando torna)
  select c.nome || ' ' || public.testo_quando(l.inizio) into v_prossima
    from public.prenotazioni p
    join public.lezioni l on l.id = p.lezione_id
    join public.corsi c on c.id = l.corso_id
   where p.utente_id = v_id and p.stato in ('riservata', 'confermata') and not l.annullata
     and (l.inizio at time zone 'Europe/Rome')::date > v_oggi
   order by l.inizio limit 1;

  -- c) Per un ingresso singolo: le lezioni di oggi non ancora finite con posti liberi
  select coalesce(jsonb_agg(x order by x->>'inizio'), '[]'::jsonb) into v_proposte
    from (
      select jsonb_build_object(
               'lezione_id', l.id, 'corso', c.nome, 'corso_id', c.id,
               'corsie', public.occupazione_corsie(l.id),
               'inizio', l.inizio,
               'ora', to_char(l.inizio at time zone 'Europe/Rome', 'HH24:MI'),
               'liberi', l.capienza - (select count(*) from public.prenotazioni q
                                        where q.lezione_id = l.id and q.stato in ('riservata', 'confermata')),
               'prezzo', c.prezzo_ingresso) as x
        from public.lezioni l
        join public.corsi c on c.id = l.corso_id and c.attivo
       where not l.annullata
         and l.fine > now()
         and (l.inizio at time zone 'Europe/Rome')::date = v_oggi
         and not exists (select 1 from public.prenotazioni q
                          where q.lezione_id = l.id and q.utente_id = v_id and q.stato in ('riservata', 'confermata'))
       order by l.inizio
       limit 20
    ) s
   where (x->>'liberi')::int > 0;

  -- d) Già entrato da poco?
  select max(creato_il) into v_ultimo
    from public.ingressi
   where utente_id = v_id and esito in ('ok', 'attenzione', 'forzato') and creato_il > now() - interval '3 hours';
  if v_ultimo is not null then
    v_avvisi := array_append(v_avvisi, 'Già entrato oggi alle ' || to_char(v_ultimo at time zone 'Europe/Rome', 'HH24:MI'));
  end if;

  -- ok = ha una lezione adesso ed è tutto a posto; scegli = niente di prenotato adesso
  if v_esito = 'ok' and array_length(v_avvisi, 1) > 0 then
    v_esito := 'attenzione';
  elsif v_esito = 'ok' and not exists (
    select 1 from jsonb_array_elements(v_lezioni) e
     where (e->>'adesso')::boolean and e->>'stato' <> 'liberata' and e->>'entrato_il' is null) then
    v_esito := 'scegli';
  end if;

  return jsonb_build_object(
    'trovato', true,
    'esito', v_esito,
    'utente_id', v_id,
    'nome', coalesce(nullif(trim(v_u.nome || ' ' || v_u.cognome), ''), 'Senza nome'),
    'telefono', v_u.telefono,
    'attivo', v_u.attivo,
    'avvisi', to_jsonb(v_avvisi),
    'info', to_jsonb(v_info),
    'abbonamenti', v_abb,
    'lezioni_oggi', v_lezioni,
    'prossima', v_prossima,
    'proposte_singolo', v_proposte);
end;
$$;


drop function if exists public.registra_ingresso(text, text, uuid, numeric, text, text, boolean);
create or replace function public.registra_ingresso(
  p_codice  text,
  p_motivo  text,
  p_lezione uuid default null,
  p_importo numeric default null,
  p_metodo  text default null,     -- valorizzato = paga adesso
  p_nota    text default null,
  p_forza   boolean default false, -- per un account disattivato
  p_carnet  uuid default null,     -- scala un ingresso da questo carnet
  p_corsia  int default null       -- la corsia assegnata (nuoto libero)
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_oggi    date := (now() at time zone 'Europe/Rome')::date;
  v_chk     jsonb;
  v_id      uuid;
  v_nome    text;
  v_esito   text;
  v_msg     text[];
  v_p       record;
  v_l       record;
  v_pid     uuid;
  v_pag     uuid;
  v_importo numeric;
  v_lezione text;
  v_c       record;
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  if p_motivo not in ('lezione', 'singolo', 'altro') then
    raise exception 'Scegli cosa entra a fare';
  end if;

  v_chk := public.controlla_codice(p_codice);
  if not (v_chk->>'trovato')::boolean then
    raise exception 'Codice non riconosciuto';
  end if;
  v_id   := (v_chk->>'utente_id')::uuid;
  v_nome := v_chk->>'nome';
  v_msg  := array(select jsonb_array_elements_text(v_chk->'avvisi'));
  if not (v_chk->>'attivo')::boolean and not p_forza then
    raise exception 'Account disattivato: spunta "Fallo entrare comunque" se vuoi registrarlo lo stesso';
  end if;

  perform set_config('piscina.silenzioso', '1', true);

  if p_motivo in ('lezione', 'singolo') then
    if p_lezione is null then
      raise exception 'Scegli la lezione';
    end if;
    select l.id, l.inizio, l.fine, l.annullata, l.corsie, l.corso_id, c.nome as corso, c.prezzo_ingresso
      into v_l
      from public.lezioni l join public.corsi c on c.id = l.corso_id
     where l.id = p_lezione;
    if not found or v_l.annullata or v_l.fine <= now() then
      raise exception 'Lezione non disponibile';
    end if;
    v_lezione := public.testo_lezione(p_lezione);
    if p_corsia is not null and (v_l.corsie is null or p_corsia < 1 or p_corsia > v_l.corsie) then
      raise exception 'Corsia non valida: oggi ce ne sono % aperte', coalesce(v_l.corsie, 0);
    end if;

    select id, stato into v_p
      from public.prenotazioni
     where lezione_id = p_lezione and utente_id = v_id and stato <> 'annullata'
     for update;

    if found and v_p.stato in ('riservata', 'confermata') then
      -- aveva già il posto: segniamo che è arrivato
      update public.prenotazioni
         set stato = 'confermata', confermata_il = coalesce(confermata_il, now()),
             entrato_il = coalesce(entrato_il, now()), da_confermare_staff = false
       where id = v_p.id;
      v_pid := v_p.id;
      if v_p.stato = 'riservata' then
        v_msg := array_append(v_msg, 'Presenza confermata ora');
      end if;
    elsif p_motivo = 'lezione' and not found then
      raise exception 'Non ha una prenotazione per questa lezione: scegli "Ingresso singolo"';
    else
      begin
        if found then -- posto liberato (non aveva confermato): lo riprende se c'è spazio
          update public.prenotazioni
             set stato = 'confermata', confermata_il = now(), entrato_il = now(), da_confermare_staff = false
           where id = v_p.id;
          v_pid := v_p.id;
          v_msg := array_append(v_msg, 'Non aveva confermato: posto ripreso');
        else
          insert into public.prenotazioni (lezione_id, utente_id, tipo, stato, confermata_il, entrato_il)
          values (p_lezione, v_id, 'ingresso_singolo', 'confermata', now(), now())
          returning id into v_pid;
        end if;
      exception when others then
        raise exception 'Lezione al completo: non ci sono più posti';
      end;
    end if;

    if p_corsia is not null then
      update public.prenotazioni set corsia = p_corsia where id = v_pid;
      v_msg := array_append(v_msg, 'Corsia ' || p_corsia);
    end if;

    -- Ingresso singolo dal carnet: si scala un ingresso
    if p_motivo = 'singolo' and p_carnet is not null then
      select a.id, a.tipo, a.utente_id, a.data_inizio, a.data_fine, a.ingressi_totali, a.corso_id,
             public.carnet_rimasti(a.id) as rimasti
        into v_c
        from public.abbonamenti a where a.id = p_carnet
         for update;
      if not found or v_c.utente_id <> v_id or v_c.ingressi_totali is null then
        raise exception 'Carnet non trovato';
      end if;
      if v_oggi not between v_c.data_inizio and v_c.data_fine then
        raise exception 'Il carnet non è valido oggi (scade il %)', to_char(v_c.data_fine, 'DD/MM/YYYY');
      end if;
      if v_c.rimasti <= 0 then
        raise exception 'Il carnet è esaurito';
      end if;
      if v_c.corso_id is not null and v_c.corso_id <> v_l.corso_id then
        raise exception 'Questo carnet non vale per %', v_l.corso;
      end if;
      v_msg := array_append(v_msg, 'Carnet: ' || case when v_c.rimasti - 1 = 0 then 'era l''ultimo ingresso'
                                     else 'restano ' || (v_c.rimasti - 1) end);
    -- Ingresso singolo pagato subito: ricevuta numerata (lo staff la vede in verifica)
    elsif p_motivo = 'singolo' and nullif(trim(p_metodo), '') is not null then
      v_importo := coalesce(p_importo, v_l.prezzo_ingresso);
      if v_importo is null or v_importo <= 0 then
        raise exception 'Scrivi l''importo dell''ingresso';
      end if;
      perform set_config('piscina.silenzioso', '', true);
      v_pag := public.registra_pagamento(v_id, null, null,
                 'Ingresso singolo ' || v_l.corso || ' del ' || to_char(v_l.inizio at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI'),
                                         v_importo, p_metodo, v_oggi, null);
      perform set_config('piscina.silenzioso', '1', true);
      v_msg := array_append(v_msg, 'Pagato € ' || public.euro(v_importo));
    elsif p_motivo = 'singolo' then
      v_msg := array_append(v_msg, 'Ingresso singolo da incassare');
    end if;
  else
    if nullif(trim(p_nota), '') is null then
      raise exception 'Scrivi in breve perché entra (es. accompagna il figlio)';
    end if;
  end if;
  perform set_config('piscina.silenzioso', '', true);

  if nullif(trim(p_nota), '') is not null then
    v_msg := array_append(v_msg, trim(p_nota));
  end if;

  -- Verde, giallo o "deciso dalla reception"
  v_esito := case
    when not (v_chk->>'attivo')::boolean then 'forzato'
    when p_motivo = 'altro' and jsonb_array_length(v_chk->'abbonamenti') = 0 then 'forzato'
    when jsonb_array_length(v_chk->'avvisi') > 0 then 'attenzione'
    when p_motivo = 'singolo' and v_pag is null and p_carnet is null then 'attenzione'
    else 'ok' end;

  insert into public.ingressi (utente_id, nome, esito, messaggi, lezione_id, prenotazione_id, codice_letto,
                               registrato_da, motivo, nota, pagamento_id, carnet_id)
  values (v_id, v_nome, v_esito, v_msg, p_lezione, v_pid, left(p_codice, 80),
          auth.uid(), p_motivo, nullif(left(trim(p_nota), 200), ''), v_pag,
          case when p_motivo = 'singolo' then p_carnet end);

  insert into public.attivita (tipo, descrizione, utente_id, lezione_id, autore_id)
  values ('ingresso',
          'Entrato: ' || v_nome || ' · '
            || case p_motivo when 'lezione' then coalesce(v_lezione, 'lezione')
                             when 'singolo' then 'ingresso singolo ' || coalesce(v_lezione, '')
                             else 'altro' end
            || case when array_length(v_msg, 1) > 0 then ' — ' || array_to_string(v_msg, ', ') else '' end,
          v_id, p_lezione, auth.uid());

  return jsonb_build_object('esito', v_esito, 'nome', v_nome, 'utente_id', v_id,
                            'lezione', v_lezione, 'messaggi', to_jsonb(v_msg), 'pagamento_id', v_pag);
end;
$$;


-- ---------------------------------------------------------------------
-- 7) Chi può chiamare cosa
-- ---------------------------------------------------------------------
revoke execute on function public.corsie_orario(uuid)            from public, anon;
revoke execute on function public.capienza_orario(uuid)          from public, anon;
revoke execute on function public.occupazione_corsie(uuid)       from public, anon;
revoke execute on function public.carnet_rimasti(uuid)           from public, anon;
revoke execute on function public.modifica_lezione(uuid, int, text, int) from public, anon;
revoke execute on function public.assegna_corsia(uuid, int)      from public, anon;
revoke execute on function public.sposta_orario(uuid, int, time, int) from public, anon;
revoke execute on function public.chiudi_abbonamento(uuid, date, text) from public, anon;
revoke execute on function public.elimina_abbonamento(uuid)      from public, anon;
revoke execute on function public.registra_ingresso(text, text, uuid, numeric, text, text, boolean, uuid, int) from public, anon;
grant  execute on function public.carnet_rimasti(uuid)           to authenticated;
grant  execute on function public.modifica_lezione(uuid, int, text, int) to authenticated;
grant  execute on function public.assegna_corsia(uuid, int)      to authenticated;
grant  execute on function public.sposta_orario(uuid, int, time, int) to authenticated;
grant  execute on function public.chiudi_abbonamento(uuid, date, text) to authenticated;
grant  execute on function public.elimina_abbonamento(uuid)      to authenticated;
grant  execute on function public.registra_ingresso(text, text, uuid, numeric, text, text, boolean, uuid, int) to authenticated;
