-- =====================================================================
--  Gestionale Piscina Sassocorvaro - PAGAMENTI VERIFICATI DALL'ADMIN
--   - "pagato" non si cambia più a mano: lo calcola il database
--     dai pagamenti registrati (con ricevuta) e verificati
--   - i pagamenti registrati dallo staff restano "in verifica"
--     finché un admin non li conferma; quelli dell'admin valgono subito
--   - quando l'abbonamento risulta saldato il cliente riceve un avviso
--  Da eseguire DOPO 0001-0013, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Verifica dei pagamenti
--    (quelli già registrati prima di questo script valgono come verificati)
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'pagamenti' and column_name = 'verificato') then
    alter table public.pagamenti add column verificato boolean not null default false;
    update public.pagamenti set verificato = true;
  end if;
end $$;
alter table public.pagamenti add column if not exists verificato_da uuid references public.profili(id) on delete set null;
alter table public.pagamenti add column if not exists verificato_il timestamptz;
create index if not exists pagamenti_da_verificare_idx on public.pagamenti (creato_il) where not verificato and not annullato;

-- ---------------------------------------------------------------------
-- 2) Lo stato "pagato" lo calcola solo il database:
--    pagato = pagamenti verificati (non annullati) che coprono il prezzo
--    (senza prezzo basta un pagamento verificato)
-- ---------------------------------------------------------------------
create or replace function public.aggiorna_stato_pagato(p_abbonamento uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_abb    record;
  v_tot    numeric;
  v_pagato boolean;
begin
  select id, utente_id, tipo, prezzo, pagato into v_abb from public.abbonamenti where id = p_abbonamento;
  if not found then
    return;
  end if;
  select coalesce(sum(importo), 0) into v_tot
    from public.pagamenti where abbonamento_id = p_abbonamento and not annullato and verificato;
  v_pagato := v_tot > 0 and (v_abb.prezzo is null or v_tot >= v_abb.prezzo);

  if v_pagato is distinct from v_abb.pagato then
    perform set_config('piscina.silenzioso', '1', true);
    update public.abbonamenti set pagato = v_pagato where id = p_abbonamento;
    perform set_config('piscina.silenzioso', '', true);

    if v_pagato then
      insert into public.notifiche (utente_id, tipo, titolo, testo, link, creata_da, chiave)
      values (v_abb.utente_id, 'pagamento', 'Abbonamento saldato ✓',
              v_abb.tipo || ': il pagamento è stato registrato. Grazie!', '/area/profilo', auth.uid(),
              'saldato:' || v_abb.id || ':' || to_char(now(), 'YYYYMMDDHH24MI'))
      on conflict (chiave) do nothing;
    end if;
  end if;
end;
$$;
revoke execute on function public.aggiorna_stato_pagato(uuid) from public, anon, authenticated;

-- Blocco: nessuno (nemmeno lo staff dall'app) può scrivere "pagato" a mano
create or replace function public.proteggi_pagato()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Le funzioni del database (modalità silenziosa) e il SQL Editor (nessun utente) possono
  if public.silenzioso() or auth.uid() is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.pagato := false; -- un abbonamento nuovo nasce da pagare: lo salda il pagamento
  elsif new.pagato is distinct from old.pagato then
    raise exception 'Lo stato "pagato" non si cambia a mano: registra il pagamento con la ricevuta';
  end if;
  return new;
end;
$$;
drop trigger if exists proteggi_pagato on public.abbonamenti;
create trigger proteggi_pagato
  before insert or update on public.abbonamenti
  for each row execute function public.proteggi_pagato();

-- Prezzo concordato: cambiandolo si ricalcola se è saldato
create or replace function public.imposta_prezzo(p_abbonamento uuid, p_prezzo numeric)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'Operazione riservata allo staff';
  end if;
  if p_prezzo is not null and (p_prezzo < 0 or p_prezzo > 100000) then
    raise exception 'Prezzo non valido';
  end if;
  update public.abbonamenti set prezzo = round(p_prezzo, 2) where id = p_abbonamento;
  if not found then
    raise exception 'Abbonamento non trovato';
  end if;
  perform public.aggiorna_stato_pagato(p_abbonamento);
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Registrare un pagamento (come nella 0013, più la verifica)
-- ---------------------------------------------------------------------
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
  v_admin  boolean := public.is_admin();
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

  -- Se lo registra l'admin vale subito; se lo registra lo staff aspetta la verifica dell'admin
  insert into public.pagamenti (anno, numero, utente_id, intestatario, abbonamento_id, descrizione,
                                importo, metodo, pagato_il, note, registrato_da,
                                verificato, verificato_da, verificato_il)
  values (v_anno, v_num, v_utente, left(v_nome, 120), p_abbonamento, left(v_descr, 200),
          round(p_importo, 2), p_metodo, p_data, nullif(left(trim(p_note), 300), ''), auth.uid(),
          v_admin, case when v_admin then auth.uid() end, case when v_admin then now() end)
  returning id into v_id;

  if p_abbonamento is not null then
    perform public.aggiorna_stato_pagato(p_abbonamento);
  end if;

  insert into public.attivita (tipo, descrizione, utente_id, autore_id)
  values ('pagamento',
          'Pagamento di € ' || public.euro(p_importo) || ' (' || p_metodo || ') da ' || v_nome
            || ' · ' || v_descr || ' · ricevuta n. ' || v_num || '/' || v_anno
            || case when v_admin then '' else ' · da verificare' end,
          v_utente, auth.uid());
  return v_id;
end;
$$;


-- L'admin conferma (o rifiuta) un pagamento registrato dallo staff
create or replace function public.verifica_pagamento(p_pagamento uuid, p_ok boolean, p_motivo text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v record;
begin
  if not public.is_admin() then
    raise exception 'Solo un amministratore può verificare i pagamenti';
  end if;
  select * into v from public.pagamenti where id = p_pagamento for update;
  if not found or v.annullato then
    raise exception 'Pagamento non trovato o annullato';
  end if;
  if v.verificato then
    return; -- già verificato
  end if;
  if not p_ok and nullif(trim(p_motivo), '') is null then
    raise exception 'Scrivi perché il pagamento non va bene';
  end if;

  if p_ok then
    update public.pagamenti set verificato = true, verificato_da = auth.uid(), verificato_il = now() where id = p_pagamento;
  else
    update public.pagamenti
       set annullato = true, motivo_annullamento = 'Non confermato dall''admin: ' || left(trim(p_motivo), 250)
     where id = p_pagamento;
  end if;
  if v.abbonamento_id is not null then
    perform public.aggiorna_stato_pagato(v.abbonamento_id);
  end if;

  insert into public.attivita (tipo, descrizione, utente_id, autore_id)
  values ('pagamento',
          case when p_ok then 'Pagamento verificato: ' else 'Pagamento rifiutato: ' end
            || v.intestatario || ' · € ' || public.euro(v.importo) || ' · ricevuta n. ' || v.numero || '/' || v.anno
            || case when p_ok then '' else ' — ' || trim(p_motivo) end,
          v.utente_id, auth.uid());
end;
$$;

-- Annullare: come prima (ora il ricalcolo avvisa anche il cliente quando serve)
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
  -- Un pagamento già verificato lo può annullare solo l'admin
  if exists (select 1 from public.pagamenti where id = p_pagamento and verificato) and not public.is_admin() then
    raise exception 'Questo pagamento è già stato verificato: può annullarlo solo un amministratore';
  end if;
  update public.pagamenti
     set annullato = true, motivo_annullamento = left(trim(p_motivo), 300)
   where id = p_pagamento and not annullato
  returning * into v;
  if not found then
    raise exception 'Pagamento non trovato o già annullato';
  end if;
  if v.abbonamento_id is not null then
    perform public.aggiorna_stato_pagato(v.abbonamento_id);
  end if;
  insert into public.attivita (tipo, descrizione, utente_id, autore_id)
  values ('pagamento', 'Ricevuta n. ' || v.numero || '/' || v.anno || ' annullata (' || v.intestatario || '): ' || trim(p_motivo),
          v.utente_id, auth.uid());
end;
$$;

-- ---------------------------------------------------------------------
-- 4) Ingresso: distingue "da pagare" da "pagato, in attesa di verifica"
-- ---------------------------------------------------------------------
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
           (select coalesce(sum(importo), 0) from public.pagamenti x
             where x.abbonamento_id = a.id and not x.annullato and x.verificato) as versato,
           (select coalesce(sum(importo), 0) from public.pagamenti x
             where x.abbonamento_id = a.id and not x.annullato and not x.verificato) as in_attesa
      from public.abbonamenti a
     where utente_id = v_u.id and v_oggi between data_inizio and data_fine
     order by data_fine
  loop
    v_validi := v_validi + 1;
    v_abb := v_abb || jsonb_build_object('id', r.id, 'tipo', r.tipo, 'data_fine', r.data_fine, 'pagato', r.pagato);
    if not r.pagato then
      if v_esito = 'ok' then v_esito := 'attenzione'; end if;
      if r.in_attesa > 0 and (r.prezzo is null or r.versato + r.in_attesa >= r.prezzo) then
        -- ha pagato in reception, ma l'admin non l'ha ancora verificato
        v_msg := array_append(v_msg, (r.tipo || ': pagamento registrato, in attesa di verifica dell''admin'));
      else
        v_msg := array_append(v_msg, (r.tipo || ': da pagare'
          || case when r.prezzo is not null and r.versato + r.in_attesa > 0
                  then ' (mancano € ' || public.euro(r.prezzo - r.versato - r.in_attesa) || ')' else '' end));
      end if;
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


revoke execute on function public.proteggi_pagato()                       from public, anon;
revoke execute on function public.imposta_prezzo(uuid, numeric)            from public, anon;
revoke execute on function public.verifica_pagamento(uuid, boolean, text)  from public, anon;
grant  execute on function public.imposta_prezzo(uuid, numeric)            to authenticated;
grant  execute on function public.verifica_pagamento(uuid, boolean, text)  to authenticated;
