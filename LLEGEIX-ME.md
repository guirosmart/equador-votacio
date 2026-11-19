# Votació del Pas d'Equador

Tot a Vercel, sense serveis externs: https://equador-uab.vercel.app

- La web és estàtica (`index.html` i `img/`).
- Els vots els gestiona una funció de Vercel (`api/vote.js`) i es guarden en un Vercel Blob privat (`equador-votos`, regió fra1), connectat al projecte `equador-uab`.
- Pla Hobby gratuït. Cap clau a posar a mà: Vercel injecta el token del Blob.

## Com funciona el vot

- Vot anònim: no es demana cap nom ni compte.
- **Un vot per dispositiu.** El navegador guarda un identificador aleatori (sense dades personals) i el servidor en desa només un hash.
- Funciona igual des de la wifi de la uni, de casa o amb dades.
- Si algú torna a entrar des del mateix mòbil o ordinador, veu el seu vot marcat i el pot canviar o treure.
- **Tope de 40 vots per IP** per frenar abusos (`MAX_PER_IP` a `api/vote.js`). Prou alt perquè una classe sencera voti des de la wifi de la uni.
- Cada vot és un arxiu buit al Blob, amb el nom `v/<hash dispositiu>.<casa>.<hash IP>`. La web no pot llegir el Blob directament, només parlar amb `/api/vote`.

Limitacions: es pot votar més d'un cop esborrant les dades del navegador, amb una finestra d'incògnit o des d'un altre aparell. Sense comptes no hi ha manera d'evitar-ho.

## Operacions útils

```
vercel deploy --prod              # desplegar els canvis
vercel env pull .env.local        # un cop, per tenir el token del Blob en local
vercel blob list                  # veure els vots (un arxiu per vot)
vercel blob empty-store           # esborrar tots els vots
```
No pugis mai `.env.local` a GitHub (ja és al `.gitignore`).
Per canviar preus, textos o fotos, edita `index.html` (les dades de les cases són a dalt del bloc `<script>`) i torna a desplegar.

## Bústia

Les propostes es guarden al mateix Blob (arxius `s/...json`). Per moderar, obre el web amb `#admin=LA_CLAU` (la clau és la variable d'entorn `ADMIN_KEY` de Vercel, no és al repositori) i apareixerà un botó "Esborra" a cada proposta.
