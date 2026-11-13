-- =====================================================================
--  Gestionale Piscina Sassocorvaro - LA CONFERMA DEGLI INGRESSI LA DÀ LA RECEPTION
--  Ogni ingresso singolo nasce "in attesa di conferma della reception"
--  (il posto è comunque tenuto). Quando lo staff preme "Conferma",
--  il cliente riceve "Prenotazione confermata ✓".
--  Da eseguire DOPO 0001-0010, in Supabase > SQL Editor > Run
-- =====================================================================

alter table public.prenotazioni
  add column if not exists da_confermare_staff boolean not null default false;
create index if not exists prenotazioni_da_confermare_idx
  on public.prenotazioni (lezione_id) where da_confermare_staff;

-- Il cliente prenota: il posto è suo, ma aspetta la conferma della reception
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
    update public.prenotazioni
       set stato = 'confermata', confermata_il = now(), da_confermare_staff = true
     where id = v_es.id;
  else
    insert into public.prenotazioni (lezione_id, utente_id, tipo, stato, confermata_il, da_confermare_staff)
    values (p_lezione, auth.uid(), 'ingresso_singolo', 'confermata', now(), true);
  end if;
end;
$$;

-- Quando arriva l'avviso "confermata" al cliente
create or replace function public.avvisa_prenotazione_confermata()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_autore uuid := auth.uid();
  v_titolo text;
begin
  if new.utente_id is null or new.stato <> 'confermata' or new.da_confermare_staff then
    return new; -- ospite senza account, oppure ancora in attesa della reception
  end if;

  if tg_op = 'INSERT' then
    v_titolo := 'Prenotazione confermata ✓';                 -- aggiunto dalla reception con "conferma subito"
  elsif old.da_confermare_staff and not new.da_confermare_staff then
    v_titolo := 'Prenotazione confermata ✓';                 -- la reception ha premuto "Conferma"
  elsif old.stato = 'liberata' and v_autore is distinct from new.utente_id then
    v_titolo := 'Prenotazione confermata ✓';                 -- la reception gli ha ridato il posto
  elsif old.stato = 'riservata' and v_autore is distinct from new.utente_id then
    v_titolo := 'Presenza confermata dalla reception ✓';    -- abbonato confermato dallo staff
  else
    return new;
  end if;

  insert into public.notifiche (utente_id, tipo, titolo, testo, link, creata_da, chiave)
  values (new.utente_id, 'lezione', v_titolo,
          coalesce(public.testo_lezione(new.lezione_id), 'La tua lezione') || '. Ti aspettiamo in vasca! 🏊',
          '/area', v_autore,
          'confermata:' || new.id || ':' || to_char(now(), 'YYYYMMDDHH24MI'))
  on conflict (chiave) do nothing;

  -- Nella cronologia anche la conferma data dalla reception a un ingresso
  if tg_op = 'UPDATE' and old.da_confermare_staff and not new.da_confermare_staff then
    insert into public.attivita (tipo, descrizione, utente_id, lezione_id, autore_id)
    values ('conferma', 'Reception: ingresso confermato a ' || public.nome_persona(new.utente_id, new.nome_ospite)
              || ' · ' || coalesce(public.nome_lezione(new.lezione_id), 'lezione'),
            new.utente_id, new.lezione_id, v_autore);
  end if;
  return new;
end;
$$;

drop trigger if exists avviso_prenotazione_confermata on public.prenotazioni;
create trigger avviso_prenotazione_confermata
  after insert or update of stato, da_confermare_staff on public.prenotazioni
  for each row execute function public.avvisa_prenotazione_confermata();
