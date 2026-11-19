# Votació del Pas d'Equador

Web estàtica (HTML, CSS i JS) desplegada a Vercel: https://equador-uab.vercel.app
Els vots es guarden a Supabase (pla gratuït). El vot és **anònim**: no es demana cap nom.

## Com funciona el vot

- Es compta **un sol vot per adreça IP**. Si dues persones voten des de la mateixa IP, només en queda un (l'últim). L'IP no es guarda en clar, només un hash.
- Si algú torna a entrar des de la mateixa connexió, veu el seu vot marcat i el pot canviar o treure.
- La web no pot llegir ni escriure la taula directament: només pot cridar les funcions `votar`, `quitar_voto`, `mi_voto` i `resultados`.

Limitacions que cal saber:
- Companys que votin des de la **mateixa wifi** (casa, residència, campus) comparteixen IP i només comptaran com un. Si algú diu que no li deixa votar, que ho faci amb dades mòbils: el seu vot substituirà el de l'altre si ja n'hi havia.
- Qui tingui dades mòbils i wifi pot votar dues vegades (una per cada IP). No hi ha manera de saber-ho sense comptes.
- Qualsevol de la mateixa IP pot treure el vot de l'altre.

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
