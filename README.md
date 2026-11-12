# Piscina Sassocorvaro · Gestionale prenotazioni

Web app per gestire utenti, abbonamenti, corsi (Hydrobike) e corsie della piscina di Sassocorvaro.

**Stack:** Next.js 16 + TypeScript + Tailwind · Supabase (Postgres + login) · Vercel

## Struttura

```
supabase/migrations/   gli script SQL del database, da eseguire in ordine
src/proxy.ts           gira prima di ogni pagina: rinnova la sessione e protegge /admin e /area
src/lib/supabase/      i collegamenti a Supabase (utente normale e chiave segreta)
src/lib/sessione.ts    "chi è entrato?" e i controlli staff/admin
src/app/login          pagina di accesso
src/app/admin          area di gestione (staff e admin)
src/app/area           area del cliente
```

## Configurazione

1. **Supabase → SQL Editor**: esegui in ordine i file in `supabase/migrations/`.
2. **Vercel → Environment Variables**: aggiungi le tre variabili di `.env.example`.
3. Il primo admin si crea da Supabase (Authentication → Add user), poi dal SQL Editor:
   ```sql
   update public.profili set ruolo = 'admin'
   where id = (select id from auth.users where email = 'tua@email.it');
   ```

## Regole di sicurezza

- La chiave `SUPABASE_SECRET_KEY` vive solo su Vercel: mai nel codice, mai su GitHub.
- Ogni pagina e azione admin controlla lato server che l'utente sia staff (`richiediStaff`).
- La Row Level Security nel database fa da seconda barriera: un cliente vede solo i propri dati.
- Solo un admin può cambiare i ruoli (trigger `proteggi_ruolo`).

## Fasi

- [x] **Fase 1** – login, ruoli, utenti, corsi e orari, abbonamenti con i 2 giorni fissi
- [ ] **Fase 2** – lezioni generate dal calendario, conferma entro le 17:00, ingressi singoli, email
- [ ] **Fase 3** – prenotazione corsie
- [ ] **Fase 4** – WhatsApp, report, rifiniture grafiche
