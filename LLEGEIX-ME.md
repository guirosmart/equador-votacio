# Votació del Pas d'Equador

Web estàtica (HTML, CSS i JS) desplegada a Vercel: https://equador-uab.vercel.app
Els vots es guarden a Supabase (pla gratuït). El vot és **anònim**: no es demana cap nom.

## Com funciona el vot

- Es compta **un vot per dispositiu**: el navegador guarda un identificador aleatori (sense dades personals) i la base de dades només en desa un hash.
- Funciona igual des de la wifi de la uni, de casa o amb dades: no depèn de l'IP.
- Si algú torna a entrar des del mateix mòbil o ordinador, veu el seu vot marcat i el pot canviar o treure.
- Per frenar abusos hi ha un **tope de 40 vots per adreça IP**: prou alt perquè una classe sencera voti des de la wifi de la uni. Es canvia a `supabase.sql` (busca `>= 40`).
- La web no pot llegir ni escriure la taula directament: només pot cridar les funcions `votar`, `quitar_voto`, `mi_voto` i `resultados`.

Limitacions que cal saber:
- Algú pot votar més d'un cop si esborra les dades del navegador, usa una finestra d'incògnit o vota des d'un altre aparell. Sense comptes no hi ha manera d'evitar-ho.
- Si algú canvia de mòbil, el vot antic continua comptant i en pot fer un de nou.

## Posar en marxa la base de dades (5 minuts)

1. A https://supabase.com crea un projecte nou (pla Free).
2. **SQL Editor > New query**: enganxa tot `supabase.sql` i prem **Run**. Ha de dir "Success". Només cal fer-ho una vegada.
3. **Project Settings > API**: copia la **Project URL** i la clau **publishable** (o *anon*). Mai la *secret* ni *service_role*.
4. Enganxa-les a `config.js` i torna a desplegar (`vercel deploy --prod`).

## Desplegar

```
vercel deploy --prod
```
(projecte `equador-uab`). Per canviar preus, textos o fotos, edita `index.html`: les dades de les cases són a dalt del bloc `<script>`.
