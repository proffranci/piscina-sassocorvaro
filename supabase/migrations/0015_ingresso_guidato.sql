-- =====================================================================
--  Gestionale Piscina Sassocorvaro - INGRESSO GUIDATO e SCADENZA PAGAMENTO
--   - "da pagare entro": l'avviso ⚠️ compare solo se manca una settimana
--     (o è già passata); promemoria automatico al cliente
--   - all'ingresso prima si CONTROLLA (chi è, lezioni di oggi, abbonamenti),
--     poi la reception sceglie cosa entra a fare:
--       lezione prenotata · ingresso singolo (con pagamento) · altro
--   - il registro ingressi ricorda il motivo e l'eventuale pagamento
--  Da eseguire DOPO 0001-0014, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Entro quando va pagato l'abbonamento
-- ---------------------------------------------------------------------
alter table public.abbonamenti add column if not exists pagare_entro date;
update public.abbonamenti set pagare_entro = data_inizio where pagare_entro is null;

-- Se non lo scrive nessuno: il primo giorno dell'abbonamento
create or replace function public.pagare_entro_predefinito()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.pagare_entro := coalesce(new.pagare_entro, new.data_inizio);
  return new;
end;
$$;
drop trigger if exists pagare_entro_predefinito on public.abbonamenti;
create trigger pagare_entro_predefinito
  before insert or update of pagare_entro, data_inizio on public.abbonamenti
  for each row execute function public.pagare_entro_predefinito();

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

  -- c) Pagamento da fare: una settimana prima della data "da pagare entro" e il giorno stesso
  --    (non a chi ha già pagato in reception ed è in attesa della verifica)
  insert into public.notifiche (utente_id, tipo, titolo, testo, link, chiave)
  select a.utente_id, 'pagamento',
         case when a.pagare_entro = v_oggi then 'Oggi è il giorno del pagamento'
              else 'Promemoria: pagamento tra 7 giorni' end,
         a.tipo || ': da pagare entro il ' || to_char(a.pagare_entro, 'DD/MM/YYYY') || '. Puoi pagare in reception.',
         '/area/profilo',
         case when a.pagare_entro = v_oggi then 'paga0:' else 'paga7:' end || a.id
    from public.abbonamenti a
    join public.profili pr on pr.id = a.utente_id and pr.attivo
   where not a.pagato
     and a.pagare_entro in (v_oggi, v_oggi + 7)
     and a.data_fine >= v_oggi
     and not exists (select 1 from public.pagamenti x where x.abbonamento_id = a.id and not x.annullato and not x.verificato)
  on conflict (chiave) do nothing;
  get diagnostics v_n = row_count; v_tot := v_tot + v_n;

  return v_tot;
end;
$$;


-- ---------------------------------------------------------------------
-- 2) Il registro ingressi ricorda perché si è entrati
-- ---------------------------------------------------------------------
alter table public.ingressi add column if not exists motivo text;      -- lezione | singolo | altro
alter table public.ingressi add column if not exists nota text;
alter table public.ingressi add column if not exists pagamento_id uuid references public.pagamenti(id) on delete set null;

create or replace function public.trova_codice(p_codice text)
returns uuid language sql stable security definer set search_path = '' as $$
  select id from public.profili
   where upper(codice_ingresso) = public.normalizza_codice(p_codice)
      or tessera_rfid = public.normalizza_codice(p_codice)
   limit 1;
$$;
revoke execute on function public.trova_codice(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 3) CONTROLLO: si legge il QR / la tessera e si vede tutto, senza
--    registrare ancora niente
-- ---------------------------------------------------------------------
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
    select a.id, a.tipo, a.data_fine, a.pagato, a.prezzo, a.pagare_entro,
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

    v_abb := v_abb || jsonb_build_object('id', r.id, 'tipo', r.tipo, 'data_fine', r.data_fine, 'stato', v_stato,
                                         'pagare_entro', r.pagare_entro, 'residuo', v_residuo);
  end loop;
  if v_validi = 0 then
    v_info := array_append(v_info, 'Nessun abbonamento valido oggi');
  end if;

  -- b) Le sue lezioni di oggi (tutte, con quelle "di adesso" in evidenza)
  select coalesce(jsonb_agg(jsonb_build_object(
           'prenotazione_id', p.id, 'lezione_id', l.id, 'corso', c.nome,
           'ora', to_char(l.inizio at time zone 'Europe/Rome', 'HH24:MI'),
           'stato', p.stato, 'tipo', p.tipo, 'entrato_il', p.entrato_il,
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
               'lezione_id', l.id, 'corso', c.nome,
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

-- ---------------------------------------------------------------------
-- 4) REGISTRAZIONE: la reception ha scelto cosa entra a fare
--    p_motivo: 'lezione' (una sua prenotazione di oggi)
--              'singolo' (ingresso singolo in una lezione, pagabile subito)
--              'altro'   (es. accompagnatore, solo informazioni: serve la nota)
-- ---------------------------------------------------------------------
drop function if exists public.registra_ingresso(text, boolean);

create or replace function public.registra_ingresso(
  p_codice  text,
  p_motivo  text,
  p_lezione uuid default null,
  p_importo numeric default null,
  p_metodo  text default null,     -- valorizzato = paga adesso
  p_nota    text default null,
  p_forza   boolean default false  -- per un account disattivato
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
    select l.id, l.inizio, l.fine, l.annullata, c.nome as corso, c.prezzo_ingresso
      into v_l
      from public.lezioni l join public.corsi c on c.id = l.corso_id
     where l.id = p_lezione;
    if not found or v_l.annullata or v_l.fine <= now() then
      raise exception 'Lezione non disponibile';
    end if;
    v_lezione := public.testo_lezione(p_lezione);

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

    -- Ingresso singolo pagato subito: ricevuta numerata (lo staff la vede in verifica)
    if p_motivo = 'singolo' and nullif(trim(p_metodo), '') is not null then
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
    when p_motivo = 'singolo' and v_pag is null then 'attenzione'
    else 'ok' end;

  insert into public.ingressi (utente_id, nome, esito, messaggi, lezione_id, prenotazione_id, codice_letto,
                               registrato_da, motivo, nota, pagamento_id)
  values (v_id, v_nome, v_esito, v_msg, p_lezione, v_pid, left(p_codice, 80),
          auth.uid(), p_motivo, nullif(left(trim(p_nota), 200), ''), v_pag);

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

revoke execute on function public.controlla_codice(text) from public, anon;
revoke execute on function public.registra_ingresso(text, text, uuid, numeric, text, text, boolean) from public, anon;
grant  execute on function public.controlla_codice(text) to authenticated;
grant  execute on function public.registra_ingresso(text, text, uuid, numeric, text, text, boolean) to authenticated;
