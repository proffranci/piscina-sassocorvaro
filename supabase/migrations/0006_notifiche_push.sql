-- =====================================================================
--  Gestionale Piscina Sassocorvaro - NOTIFICHE PUSH SUL TELEFONO
--  Da eseguire DOPO 0001-0005, in Supabase > SQL Editor > Run
--
--  Come funziona:
--  1. il telefono del cliente "si iscrive" alle notifiche (tabella push_iscrizioni)
--  2. ogni volta che nasce un avviso (tabella notifiche), il database chiama
--     la nostra app su Vercel (/api/push) con pg_net
--  3. l'app manda la notifica push a tutti i telefoni iscritti di quella persona
-- =====================================================================

-- pg_net: permette al database di fare chiamate web (lo usa anche Supabase)
create extension if not exists pg_net;

-- ---------------------------------------------------------------------
-- 1) I telefoni (e computer) iscritti alle notifiche
-- ---------------------------------------------------------------------
create table if not exists public.push_iscrizioni (
  id          uuid primary key default gen_random_uuid(),
  utente_id   uuid not null references public.profili(id) on delete cascade,
  endpoint    text not null unique, -- l'"indirizzo" del telefono presso Google/Apple/Mozilla
  p256dh      text not null,        -- chiavi per cifrare il messaggio: solo quel telefono lo legge
  auth        text not null,
  dispositivo text,
  creata_il   timestamptz not null default now()
);
create index if not exists push_iscrizioni_utente_idx on public.push_iscrizioni (utente_id);

alter table public.push_iscrizioni enable row level security;
drop policy if exists "push: vedo le mie" on public.push_iscrizioni;
create policy "push: vedo le mie" on public.push_iscrizioni
  for select to authenticated using (utente_id = auth.uid());
-- Scrittura solo tramite le funzioni qui sotto

-- Iscrive questo dispositivo per l'utente che ha fatto l'accesso.
-- Se lo stesso telefono era di un'altra persona (es. telefono condiviso), passa a lui.
create or replace function public.salva_iscrizione_push(
  p_endpoint text, p_p256dh text, p_auth text, p_dispositivo text default null
) returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Devi prima accedere';
  end if;
  if coalesce(p_endpoint, '') !~ '^https://' or coalesce(p_p256dh, '') = '' or coalesce(p_auth, '') = '' then
    raise exception 'Iscrizione non valida';
  end if;
  delete from public.push_iscrizioni where endpoint = p_endpoint;
  insert into public.push_iscrizioni (utente_id, endpoint, p256dh, auth, dispositivo)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_dispositivo, 200));
end;
$$;

create or replace function public.rimuovi_iscrizione_push(p_endpoint text)
returns void language sql security definer set search_path = '' as $$
  delete from public.push_iscrizioni where endpoint = p_endpoint and utente_id = auth.uid();
$$;

revoke execute on function public.salva_iscrizione_push(text, text, text, text) from public, anon;
revoke execute on function public.rimuovi_iscrizione_push(text)                 from public, anon;
grant  execute on function public.salva_iscrizione_push(text, text, text, text) to authenticated;
grant  execute on function public.rimuovi_iscrizione_push(text)                 to authenticated;

-- ---------------------------------------------------------------------
-- 2) Segreti: indirizzo dell'app e parola segreta condivisa con Vercel.
--    Nessuno puo leggerli dall'app (nessuna regola di accesso):
--    li usa solo il trigger qui sotto.
-- ---------------------------------------------------------------------
create table if not exists public.segreti (
  chiave text primary key,
  valore text not null
);
alter table public.segreti enable row level security;

insert into public.segreti (chiave, valore) values
  ('push_url', 'https://piscina-sassocorvaro.vercel.app/api/push'),
  -- 64 caratteri casuali (due UUID casuali senza trattini)
  ('push_segreto', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''))
on conflict (chiave) do nothing;

-- ---------------------------------------------------------------------
-- 3) Ogni nuovo avviso -> chiamata all'app, che manda la push
-- ---------------------------------------------------------------------
create or replace function public.avvisa_push()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_url     text := (select valore from public.segreti where chiave = 'push_url');
  v_segreto text := (select valore from public.segreti where chiave = 'push_segreto');
begin
  -- Se non c'e nessun telefono iscritto, non serve chiamare nessuno
  if v_url is null or v_segreto is null
     or not exists (select 1 from public.push_iscrizioni where utente_id = new.utente_id) then
    return new;
  end if;

  perform net.http_post(
    url     := v_url,
    body    := jsonb_build_object('notifica_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-segreto', v_segreto),
    timeout_milliseconds := 5000
  );
  return new;
exception when others then
  -- La push e un "di piu": se qualcosa va storto l'avviso nell'app resta comunque
  raise warning 'Push non inviata per la notifica %: %', new.id, sqlerrm;
  return new;
end;
$$;

drop trigger if exists push_su_nuova_notifica on public.notifiche;
create trigger push_su_nuova_notifica
  after insert on public.notifiche
  for each row execute function public.avvisa_push();

-- ---------------------------------------------------------------------
-- 4) Da copiare su Vercel come PUSH_SEGRETO
-- ---------------------------------------------------------------------
select valore as copia_questo_in_vercel_come_PUSH_SEGRETO
  from public.segreti where chiave = 'push_segreto';
