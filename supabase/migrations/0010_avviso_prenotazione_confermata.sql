-- =====================================================================
--  Gestionale Piscina Sassocorvaro - AVVISO "PRENOTAZIONE CONFERMATA"
--  Il cliente riceve la conferma (nell'app e come notifica sul telefono):
--   - quando prenota un ingresso singolo (da solo o tramite la reception)
--   - quando riprende un posto liberato
--   - quando la reception conferma la presenza al posto suo
--  Da eseguire DOPO 0001-0009, in Supabase > SQL Editor > Run
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0) CORREZIONE: dalla 0008 la reception non riusciva ad aggiungere
--    un ospite senza account (errore nella cronologia). Sistemato qui.
-- ---------------------------------------------------------------------
create or replace function public.registra_prenotazione()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_chi     text := public.nome_persona(new.utente_id, new.nome_ospite);
  v_dove    text := public.nome_lezione(new.lezione_id);
  v_autore  uuid := auth.uid();
  v_staff   boolean := v_autore is not null and v_autore is distinct from new.utente_id;
  -- coalesce: per gli ospiti senza account (utente vuoto) il confronto darebbe "vuoto" invece di "no"
  v_cliente boolean := coalesce(v_autore is not null and v_autore = new.utente_id, false);
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

-- "Hydrobike oggi alle 20:00" / "Hydrobike domani alle 19:00" / "Hydrobike sabato 15/11 alle 19:00"
create or replace function public.testo_lezione(p_lezione uuid)
returns text language sql stable security definer set search_path = '' as $$
  select c.nome || ' ' ||
         case (l.inizio at time zone 'Europe/Rome')::date - (now() at time zone 'Europe/Rome')::date
           when 0 then 'oggi'
           when 1 then 'domani'
           else (array['lunedì','martedì','mercoledì','giovedì','venerdì','sabato','domenica'])
                  [extract(isodow from l.inizio at time zone 'Europe/Rome')::int]
                || ' ' || to_char(l.inizio at time zone 'Europe/Rome', 'DD/MM')
         end
         || ' alle ' || to_char(l.inizio at time zone 'Europe/Rome', 'HH24:MI')
    from public.lezioni l join public.corsi c on c.id = l.corso_id
   where l.id = p_lezione;
$$;
revoke execute on function public.testo_lezione(uuid) from public, anon;

create or replace function public.avvisa_prenotazione_confermata()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_autore uuid := auth.uid();
  v_titolo text;
begin
  if new.utente_id is null or new.stato <> 'confermata' then
    return new; -- ospiti senza account: niente app (c'è il pulsante WhatsApp)
  end if;

  if tg_op = 'INSERT' then
    v_titolo := 'Prenotazione confermata ✓';
  elsif old.stato = 'liberata' then
    v_titolo := 'Prenotazione confermata ✓';
  elsif old.stato = 'riservata' and v_autore is distinct from new.utente_id then
    v_titolo := 'Presenza confermata dalla reception ✓';
  else
    return new; -- conferma fatta dal cliente stesso: lo sa già, non serve avvisarlo
  end if;

  insert into public.notifiche (utente_id, tipo, titolo, testo, link, creata_da, chiave)
  values (new.utente_id, 'lezione', v_titolo,
          coalesce(public.testo_lezione(new.lezione_id), 'La tua lezione') || '. Ti aspettiamo in vasca! 🏊',
          '/area', v_autore,
          'confermata:' || new.id || ':' || to_char(now(), 'YYYYMMDDHH24MI'))
  on conflict (chiave) do nothing;
  return new;
end;
$$;

drop trigger if exists avviso_prenotazione_confermata on public.prenotazioni;
create trigger avviso_prenotazione_confermata
  after insert or update of stato on public.prenotazioni
  for each row execute function public.avvisa_prenotazione_confermata();
