# Halfway There · Pas d'Equador 2026-27

Web informativa de la festa (30 de gener de 2027, Mas Aliberch, Muntanyola): https://equador-uab.vercel.app

- Pàgina estàtica (`index.html` i `img/`). Estètica del PDF: granat `#581a10` i crema `#f6efd8`.
- Seccions: info (horari, dresscode, què portar), on (galeria i mapa), bústia de suggeriments i, aviat, tauler de cotxes.
- La bústia usa `api/vote.js` i guarda les propostes en un Vercel Blob privat (`data/ideas.json`). Ja no hi ha votació a la web.

## Moderar la bústia

Obre el web amb `#admin=LA_CLAU` (variable `ADMIN_KEY` de Vercel) o fes servir "Organitzador" al peu. Apareix el botó "Esborra" a cada proposta.

## Desplegar

```
vercel deploy --prod
```
No pugis mai `.env.local` a GitHub.
