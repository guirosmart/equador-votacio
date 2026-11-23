# Votació del Pas d'Equador

Tot a Vercel, sense serveis externs: https://equador-uab.vercel.app

- La web és estàtica (`index.html` i `img/`).
- Els vots els gestiona una funció de Vercel (`api/vote.js`) i es guarden en un Vercel Blob privat (`equador-votos`, regió fra1), connectat al projecte `equador-uab`.
- Pla Hobby gratuït. Cap clau a posar a mà: Vercel injecta el token del Blob.

## Com funciona el vot

- Cada persona escriu **nom i cognoms** (a mà, sense llista) i toca la casa. Un vot per persona.
- El nom es guarda al Blob privat (`data/votes.json`). **No es mostra mai als companys** ni es veu què ha votat cadascú; a la web pública només hi ha els totals per casa.
- El nom es normalitza (sense accents, majúscules ni espais de més): "Núria  Pérez" i "nuria perez" són la mateixa persona.
- **Antifrau:** un nom només pot votar des d'un dispositiu (el del primer vot); un dispositiu només pot votar amb un nom; i hi ha un tope de 40 vots per IP, prou alt perquè una classe voti des de la wifi de la uni.
- Qui vota pot canviar o treure el vot des del mateix dispositiu; un cop votat, el camp del nom queda bloquejat.

## Panell de l'organitzador

Obre el web amb `#admin=LA_CLAU` (la clau és la variable `ADMIN_KEY` de Vercel, no és al repositori). Al final de la pàgina apareix el panell:
- **Han votat**: nom i hora de cada votant, amb botó "Esborra" (esborrar un vot desbloqueja el nom i el dispositiu: útil si algú canvia de mòbil o es detecta un frau).
- **Llista de la classe** (opcional, només la veus tu): enganxa-la i et diu **qui falta per votar** i **qui ha votat però no surt a la llista**. La comparació tolera errors petits ("Anna Garcia" coincideix amb "Anna Garcia Puig").
- No mostra què ha votat cada persona.

Limitacions: algú pot escriure el nom d'un altre abans que ell voti; l'afectat veurà el missatge "aquest nom ja ha votat" i l'organitzador pot esborrar aquell vot des del panell.

## Operacions útils

```
vercel deploy --prod              # desplegar els canvis
vercel env pull .env.local        # un cop, per tenir el token del Blob en local
vercel blob list                  # veure els arxius: data/votes.json, data/ideas.json, data/roster.json
# Per buidar els vots, esborra'ls des del panell d'organitzador (o `vercel blob del data/votes.json`).
```
No pugis mai `.env.local` a GitHub (ja és al `.gitignore`).
Per canviar preus, textos o fotos, edita `index.html` (les dades de les cases són a dalt del bloc `<script>`) i torna a desplegar.

## Bústia

Les propostes es guarden al mateix Blob (arxius `s/...json`). Per moderar, obre el web amb `#admin=LA_CLAU` (la clau és la variable d'entorn `ADMIN_KEY` de Vercel, no és al repositori) i apareixerà un botó "Esborra" a cada proposta.

## Límits del pla gratuït (important)

El Blob del pla Hobby inclou només **2.000 operacions avançades** (pujar/llistar) i **10.000 de simples** (llegir) al mes. Si se superen, el Blob deixa de funcionar fins als 30 dies. Per això el codi no guarda un arxiu per vot sinó **tres arxius JSON** (`data/votes.json`, `data/ideas.json`, `data/roster.json`):
- Mirar la web = 1-2 lectures. Votar = 1 lectura + 1 pujada (amb control de concurrència: si molts voten alhora, el servidor ho reintenta sol).
- Un vot/proposta ≈ 1 operació avançada; no s'usa mai "llistar". Amb ~60 persones, el consum és una fracció petita del límit.
- Si algun dia cal més, es pot passar a Pro o mirar l'ús a https://vercel.com/guirosmart-2439/~/stores/blob/store_qs5NT3ELxkGa4jFK
