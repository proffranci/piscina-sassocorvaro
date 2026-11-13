-- =====================================================================
--  Gestionale Piscina Sassocorvaro - NOVITÀ PER LO STAFF
--  Ogni operazione fatta da un cliente (disdice, riprende il posto, prenota,
--  conferma, cambia preferenza) diventa una "novità" con il numerino rosso.
--  Da eseguire DOPO 0001-0007, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Nella cronologia segniamo cosa ha fatto direttamente un cliente
-- ---------------------------------------------------------------------
alter table public.attivita add column if not exists da_cliente boolean not null default false;
create index if not exists attivita_da_cliente_idx on public.attivita (creata_il desc) where da_cliente;

-- Stessa cronologia di prima, ma ora sa distinguere cliente / staff / automatico
create or replace function public.registra_prenotazione()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_chi     text := public.nome_persona(new.utente_id, new.nome_ospite);
  v_dove    text := public.nome_lezione(new.lezione_id);
  v_autore  uuid := auth.uid();
  v_staff   boolean := v_autore is not null and v_autore is distinct from new.utente_id;
  v_cliente boolean := v_autore is not null and v_autore = new.utente_id;
  v_tipo    text;
  v_testo   text;
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

-- Anche il cambio di preferenza (app/WhatsApp, telefono) è una novità per lo staff
create or replace function public.imposta_preferenze(
  p_canale text, p_telefono text, p_consenso_whatsapp boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_tel   text := nullif(trim(p_telefono), '');
  v_prima record;
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

  select canale_notifica, telefono into v_prima from public.profili where id = auth.uid();

  update public.profili
     set canale_notifica = p_canale,
         telefono = coalesce(v_tel, telefono),
         consenso_whatsapp = coalesce(p_consenso_whatsapp, false)
   where id = auth.uid();

  if v_prima.canale_notifica is distinct from p_canale then
    insert into public.attivita (tipo, descrizione, utente_id, autore_id, da_cliente)
    values ('preferenza',
            public.nome_persona(auth.uid(), null) || ' ora preferisce essere avvisato '
              || case when p_canale = 'whatsapp' then 'su WhatsApp' else 'nell''app' end,
            auth.uid(), auth.uid(), true);
  elsif v_tel is not null and v_prima.telefono is distinct from v_tel then
    insert into public.attivita (tipo, descrizione, utente_id, autore_id, da_cliente)
    values ('preferenza', public.nome_persona(auth.uid(), null) || ' ha aggiornato il numero di telefono: ' || v_tel,
            auth.uid(), auth.uid(), true);
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) Fin dove ha già letto ogni persona dello staff (ognuno il suo numerino)
-- ---------------------------------------------------------------------
create table if not exists public.staff_letture (
  utente_id uuid primary key references public.profili(id) on delete cascade,
  letto_fino timestamptz not null default now()
);
alter table public.staff_letture enable row level security;
drop policy if exists "letture: le mie" on public.staff_letture;
create policy "letture: le mie" on public.staff_letture
  for select to authenticated using (utente_id = auth.uid());

-- Il numerino: quante operazioni dei clienti non ho ancora visto
create or replace function public.conta_novita()
returns int language sql stable security definer set search_path = '' as $$
  select case when not public.is_staff() then 0 else (
    select count(*)::int from public.attivita a
     where a.da_cliente
       and a.creata_il > coalesce(
             (select letto_fino from public.staff_letture where utente_id = auth.uid()),
             now() - interval '7 days')
  ) end;
$$;

-- Ho visto tutto: azzera il numerino
create or replace function public.segna_novita_lette()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    return;
  end if;
  insert into public.staff_letture (utente_id, letto_fino) values (auth.uid(), now())
  on conflict (utente_id) do update set letto_fino = excluded.letto_fino;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) Notifica push anche ai telefoni dello staff
-- ---------------------------------------------------------------------
create or replace function public.avvisa_push_staff()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_url     text := (select valore from public.segreti where chiave = 'push_url');
  v_segreto text := (select valore from public.segreti where chiave = 'push_segreto');
begin
  if not new.da_cliente or v_url is null or v_segreto is null then
    return new;
  end if;
  -- Nessuno dello staff ha attivato le notifiche? Non serve chiamare
  if not exists (
    select 1 from public.push_iscrizioni i
      join public.profili p on p.id = i.utente_id
     where p.attivo and p.ruolo in ('staff', 'admin')
  ) then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('attivita_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-segreto', v_segreto),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  raise warning 'Push allo staff non inviata: %', sqlerrm;
  return new;
end;
$$;

drop trigger if exists push_staff_su_novita on public.attivita;
create trigger push_staff_su_novita
  after insert on public.attivita
  for each row execute function public.avvisa_push_staff();

-- ---------------------------------------------------------------------
-- 4) Diagnosi: com'è andata l'ultima consegna delle notifiche push?
--    (risposte di Vercel alle chiamate fatte dal database)
-- ---------------------------------------------------------------------
create or replace function public.stato_push()
returns table (quando timestamptz, codice int, risposta text, errore text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata all''amministratore';
  end if;
  if to_regclass('net._http_response') is null then
    return; -- pg_net non attivo: nessuna riga
  end if;
  return query
    select r.created, r.status_code, left(r.content::text, 160), r.error_msg
      from net._http_response r
     order by r.created desc
     limit 5;
end;
$$;

revoke execute on function public.conta_novita()       from public, anon;
revoke execute on function public.segna_novita_lette() from public, anon;
revoke execute on function public.stato_push()         from public, anon;
grant  execute on function public.conta_novita()       to authenticated;
grant  execute on function public.segna_novita_lette() to authenticated;
grant  execute on function public.stato_push()         to authenticated;
