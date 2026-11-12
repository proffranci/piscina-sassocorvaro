-- =====================================================================
--  Gestionale Piscina Sassocorvaro - schema del database (fase 1)
--  Da eseguire UNA volta in Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- Tipi di valori ammessi ----------
create type public.ruolo as enum ('utente', 'staff', 'admin');
create type public.canale_notifica as enum ('email', 'whatsapp');
create type public.stato_prenotazione as enum ('riservata', 'confermata', 'liberata', 'annullata');
create type public.tipo_prenotazione as enum ('abbonamento', 'ingresso_singolo');

-- ---------- Profili (dati dell'utente oltre al login) ----------
-- Il login (email/password) lo gestisce Supabase Auth in auth.users;
-- qui teniamo tutto il resto, collegato con lo stesso id.
create table public.profili (
  id                uuid primary key references auth.users(id) on delete cascade,
  nome              text not null default '',
  cognome           text not null default '',
  telefono          text,
  ruolo             public.ruolo not null default 'utente',
  canale_notifica   public.canale_notifica not null default 'email',
  consenso_whatsapp boolean not null default false,
  attivo            boolean not null default true,
  creato_il         timestamptz not null default now()
);

-- ---------- Corsi e calendario ----------
-- Il corso in generale (es. Hydrobike, 29 posti)
create table public.corsi (
  id       uuid primary key default gen_random_uuid(),
  nome     text not null unique,
  capienza int  not null check (capienza > 0),
  attivo   boolean not null default true
);

-- Lo schema settimanale ricorrente (es. Hydrobike il martedi alle 19:00)
create table public.orari_corso (
  id               uuid primary key default gen_random_uuid(),
  corso_id         uuid not null references public.corsi(id),
  giorno_settimana smallint not null check (giorno_settimana between 1 and 7), -- 1 = lunedi
  ora_inizio       time not null,
  durata_minuti    int  not null default 45 check (durata_minuti > 0),
  attivo           boolean not null default true,
  unique (corso_id, giorno_settimana, ora_inizio)
);

-- La singola lezione con data e ora precise, generata dagli orari ricorrenti
create table public.lezioni (
  id                uuid primary key default gen_random_uuid(),
  corso_id          uuid not null references public.corsi(id),
  orario_corso_id   uuid references public.orari_corso(id),
  inizio            timestamptz not null,
  fine              timestamptz not null,
  capienza          int not null check (capienza > 0),
  scadenza_conferma timestamptz not null, -- es. stesso giorno alle 17:00
  annullata         boolean not null default false,
  unique (corso_id, inizio),              -- niente lezioni doppie
  check (fine > inizio)
);
create index lezioni_inizio_idx on public.lezioni (inizio);

-- ---------- Abbonamenti ----------
create table public.abbonamenti (
  id          uuid primary key default gen_random_uuid(),
  utente_id   uuid not null references public.profili(id) on delete cascade,
  tipo        text not null,                  -- es. "Hydrobike trimestrale"
  data_inizio date not null,
  data_fine   date not null,
  pagato      boolean not null default false, -- segnato a mano dallo staff
  note        text,
  creato_il   timestamptz not null default now(),
  check (data_fine >= data_inizio)
);

-- I 2 appuntamenti settimanali fissi scelti con l'abbonamento
create table public.abbonamenti_orari (
  abbonamento_id  uuid not null references public.abbonamenti(id) on delete cascade,
  orario_corso_id uuid not null references public.orari_corso(id),
  primary key (abbonamento_id, orario_corso_id)
);

-- ---------- Prenotazioni dei corsi ----------
create table public.prenotazioni (
  id            uuid primary key default gen_random_uuid(),
  lezione_id    uuid not null references public.lezioni(id) on delete cascade,
  utente_id     uuid not null references public.profili(id) on delete cascade,
  tipo          public.tipo_prenotazione not null,
  stato         public.stato_prenotazione not null,
  confermata_il timestamptz,
  creata_il     timestamptz not null default now(),
  aggiornata_il timestamptz not null default now()
);
-- Una persona puo avere un solo posto attivo per lezione
-- (le prenotazioni annullate non contano, cosi si puo riprenotare)
create unique index prenotazioni_un_posto_per_persona
  on public.prenotazioni (lezione_id, utente_id)
  where stato <> 'annullata';
create index prenotazioni_lezione_stato_idx on public.prenotazioni (lezione_id, stato);

-- ---------- Corsie ----------
create table public.corsie (
  id       smallint primary key check (id between 1 and 20),
  capienza int not null default 1 check (capienza > 0), -- persone per fascia, da confermare con la piscina
  attiva   boolean not null default true
);

create table public.prenotazioni_corsia (
  id        uuid primary key default gen_random_uuid(),
  corsia_id smallint not null references public.corsie(id),
  utente_id uuid not null references public.profili(id) on delete cascade,
  inizio    timestamptz not null,
  fine      timestamptz not null,
  annullata boolean not null default false,
  creata_il timestamptz not null default now(),
  check (fine > inizio)
);
create index prenotazioni_corsia_idx on public.prenotazioni_corsia (corsia_id, inizio);

-- ---------- Impostazioni modificabili dall'admin ----------
create table public.impostazioni (
  chiave text primary key,
  valore text not null
);

-- ---------- Dati iniziali ----------
insert into public.corsi (nome, capienza) values ('Hydrobike', 29);
insert into public.corsie (id) values (1), (2), (3), (4), (5);
insert into public.impostazioni (chiave, valore) values
  ('orario_scadenza_conferma', '17:00'),
  ('fuso_orario', 'Europe/Rome');

-- =====================================================================
--  Funzioni e automatismi
-- =====================================================================

-- Quando qualcuno si registra, gli creiamo in automatico il profilo
create function public.crea_profilo()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profili (id, nome, cognome)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', ''),
    coalesce(new.raw_user_meta_data ->> 'cognome', '')
  );
  return new;
end;
$$;

create trigger alla_registrazione
  after insert on auth.users
  for each row execute function public.crea_profilo();

-- Chi sta usando l'app e staff o admin?
create function public.is_staff()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profili
    where id = auth.uid() and ruolo in ('staff', 'admin') and attivo
  );
$$;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profili
    where id = auth.uid() and ruolo = 'admin' and attivo
  );
$$;

-- Mai piu posti del previsto: il database rifiuta la prenotazione
-- se la lezione e piena. Il "for update" blocca la lezione per un istante,
-- cosi due persone che prenotano nello stesso momento vengono messe in fila.
create function public.controlla_capienza()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  cap      int;
  occupati int;
begin
  if new.stato in ('riservata', 'confermata') then
    select capienza into cap
      from public.lezioni where id = new.lezione_id
      for update;

    select count(*) into occupati
      from public.prenotazioni
      where lezione_id = new.lezione_id
        and stato in ('riservata', 'confermata')
        and id <> new.id;

    if occupati >= cap then
      raise exception 'Lezione al completo';
    end if;
  end if;

  new.aggiornata_il := now();
  return new;
end;
$$;

create trigger capienza_prenotazioni
  before insert or update on public.prenotazioni
  for each row execute function public.controlla_capienza();

-- =====================================================================
--  Sicurezza: Row Level Security
--  Ogni utente vede solo i propri dati; staff e admin vedono tutto.
-- =====================================================================
alter table public.profili             enable row level security;
alter table public.corsi               enable row level security;
alter table public.orari_corso         enable row level security;
alter table public.lezioni             enable row level security;
alter table public.abbonamenti         enable row level security;
alter table public.abbonamenti_orari   enable row level security;
alter table public.prenotazioni        enable row level security;
alter table public.corsie              enable row level security;
alter table public.prenotazioni_corsia enable row level security;
alter table public.impostazioni        enable row level security;

-- Profili: ognuno vede il suo, lo staff vede e modifica tutti.
-- (Niente modifica diretta del proprio profilo: altrimenti un utente
--  potrebbe cambiarsi il ruolo in admin. Lo faremo con una funzione apposita.)
create policy "profili: lettura" on public.profili
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "profili: staff modifica" on public.profili
  for update to authenticated using (public.is_staff()) with check (public.is_staff());

-- Corsi, orari, lezioni, corsie: tutti gli utenti loggati leggono, lo staff gestisce
create policy "corsi: lettura" on public.corsi
  for select to authenticated using (true);
create policy "corsi: staff gestisce" on public.corsi
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "orari: lettura" on public.orari_corso
  for select to authenticated using (true);
create policy "orari: staff gestisce" on public.orari_corso
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "lezioni: lettura" on public.lezioni
  for select to authenticated using (true);
create policy "lezioni: staff gestisce" on public.lezioni
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "corsie: lettura" on public.corsie
  for select to authenticated using (true);
create policy "corsie: staff gestisce" on public.corsie
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Abbonamenti: ognuno vede i suoi, lo staff gestisce tutto
create policy "abbonamenti: lettura" on public.abbonamenti
  for select to authenticated using (utente_id = auth.uid() or public.is_staff());
create policy "abbonamenti: staff gestisce" on public.abbonamenti
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "abbonamenti_orari: lettura" on public.abbonamenti_orari
  for select to authenticated using (
    public.is_staff() or exists (
      select 1 from public.abbonamenti a
      where a.id = abbonamento_id and a.utente_id = auth.uid()
    )
  );
create policy "abbonamenti_orari: staff gestisce" on public.abbonamenti_orari
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Prenotazioni: ognuno vede le sue, lo staff gestisce tutto.
-- (Conferma e prenotazione da parte dell'utente arriveranno in fase 2,
--  tramite funzioni che controllano la scadenza delle 17:00.)
create policy "prenotazioni: lettura" on public.prenotazioni
  for select to authenticated using (utente_id = auth.uid() or public.is_staff());
create policy "prenotazioni: staff gestisce" on public.prenotazioni
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

create policy "prenotazioni_corsia: lettura" on public.prenotazioni_corsia
  for select to authenticated using (utente_id = auth.uid() or public.is_staff());
create policy "prenotazioni_corsia: staff gestisce" on public.prenotazioni_corsia
  for all to authenticated using (public.is_staff()) with check (public.is_staff());

-- Impostazioni: tutti leggono, solo l'admin modifica
create policy "impostazioni: lettura" on public.impostazioni
  for select to authenticated using (true);
create policy "impostazioni: admin gestisce" on public.impostazioni
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
