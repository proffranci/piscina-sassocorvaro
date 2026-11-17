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
src/app/admin/lezioni  dettaglio di una lezione: conferme, posti, ingressi dalla reception
src/app/admin/ingresso lettore degli ingressi (fotocamera, lettore USB, NFC)
src/app/admin/pagamenti pagamenti del mese, nuova ricevuta, export CSV
src/app/ricevuta       la ricevuta da stampare (staff e cliente)
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
- Le ricevute si scrivono solo con le funzioni `registra_pagamento` / `annulla_pagamento`: numerazione senza buchi né doppioni.
- Il QR contiene solo un codice casuale (nessun dato personale); se viene perso o condiviso si rigenera e il vecchio smette di funzionare.

## Fasi

- [x] **Fase 1** – login, ruoli, utenti, corsi e orari, abbonamenti con i 2 giorni fissi
- [x] **Fase 2** – lezioni generate dal calendario, conferma entro le 17:00, ingressi singoli, dashboard
- [x] **Avvisi nell'app** – notifiche ai clienti, solleciti di pagamento, promemoria automatici, pagina "Oggi" con cronologia per lo staff
- [x] **Notifiche push** (Android, computer, iPhone con app installata) e **pulsanti WhatsApp** con testo pronto
- [x] **Novità per lo staff** – campanella con numerino per ogni operazione dei clienti, push anche allo staff, diagnosi delle consegne
- [x] **Account e cambi giorno** – nome utente unico, scheda utente, password temporanea, cambio password obbligatorio, richieste di cambio giorno
- [x] **Corsi configurabili e Nuoto libero** – scadenza di conferma per corso/orario, orari in blocco, lezioni modificabili e annullabili, Nuoto libero con abbonamenti
- [x] **Corsi su misura, eliminazioni, pagamenti, ingresso con QR** (script `0013`):
  - orario limite per confermare: il giorno stesso, N giorni prima, N ore prima oppure "nessuna conferma"; limite per disdire; regole degli ingressi singoli (dall'app sì/no, subito o solo dopo l'orario limite, giorni di anticipo); prezzi; durata predefinita; sospensione del corso
  - nuovo corso con tutte le impostazioni e i primi orari in un solo modulo
  - eliminare orari, corsi (admin) e account (con conferma scritta)
  - pagamenti con data, modalità e importo, acconti, ricevuta numerata (n/anno) stampabile o in PDF, annullo con motivo, export CSV del mese
  - ingresso: QR personale nell'app (Tessera), tessera stampabile, tessere/braccialetti RFID-NFC; la reception legge con la fotocamera, con un lettore USB o con l'NFC del telefono Android e vede subito verde/giallo/rosso
- [ ] **Email** – promemoria anche via email
- [ ] **Fase 3** – prenotazione corsie
- [ ] **Fase 4** – WhatsApp, report, rifiniture grafiche
