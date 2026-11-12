-- =====================================================================
--  Gestionale Piscina Sassocorvaro - email nei profili e protezione ruoli
--  Da eseguire DOPO 0001 e 0002, in Supabase > SQL Editor
-- =====================================================================

-- 1) Copiamo l'email anche nel profilo, cosi lo staff la vede nelle liste
--    (la tabella auth.users non e leggibile dall'app, per sicurezza)
alter table public.profili add column if not exists email text;

update public.profili p
   set email = u.email
  from auth.users u
 where u.id = p.id;

create or replace function public.crea_profilo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profili (id, email, nome, cognome)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    coalesce(new.raw_user_meta_data ->> 'cognome', '')
  );
  return new;
end;
$$;

-- 2) Solo un admin puo cambiare il ruolo di qualcuno.
--    Senza questo controllo, una persona dello staff potrebbe
--    promuoversi da sola ad admin.
--    (Dal SQL Editor di Supabase auth.uid() e vuoto, quindi tu puoi sempre farlo da li.)
create or replace function public.proteggi_ruolo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.ruolo is distinct from old.ruolo
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Solo un amministratore puo cambiare i ruoli';
  end if;
  return new;
end;
$$;

drop trigger if exists proteggi_ruolo on public.profili;
create trigger proteggi_ruolo
  before update on public.profili
  for each row execute function public.proteggi_ruolo();
