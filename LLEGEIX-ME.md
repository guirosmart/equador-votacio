# Votació del Pas d'Equador: com posar-la en marxa

Web estàtica (HTML, CSS i JS) per pujar a GitHub Pages. Els vots es guarden a Supabase, que té pla gratuït.

## 1. Crear la base de dades (5 minuts)

1. Entra a https://supabase.com i crea un compte i un projecte nou (el pla Free va bé). Anota't la contrasenya de la base de dades, encara que no la farem servir.
2. Al projecte, obre **SQL Editor** > **New query**.
3. Obre el fitxer `supabase.sql`, copia'n tot el contingut, enganxa'l i prem **Run**. Ha de dir "Success".
4. Ves a **Project Settings > API** (o el botó **Connect**) i copia:
   - la **Project URL** (acaba en `.supabase.co`)
   - la clau **publishable** (o **anon**). És la pública: està pensada per anar dins d'una web.
   - No copiïs mai la clau **secret** ni **service_role**.
5. Obre `config.js` i enganxa'ls entre les cometes.

## 2. Pujar-la a GitHub Pages

1. A https://github.com crea un repositori nou, públic (per exemple `equador-votacio`).
2. Puja'n tot el contingut d'aquesta carpeta: `index.html`, `config.js`, la carpeta `img` i, si vols, el `supabase.sql` i aquest fitxer. (Botó **Add file > Upload files**.)
3. Al repositori: **Settings > Pages**. A "Build and deployment" tria **Deploy from a branch**, la branca `main` i la carpeta `/ (root)`. Desa.
4. Al cap d'un minut tindràs l'enllaç: `https://EL_TEU_USUARI.github.io/equador-votacio/`. Passa'l a la classe.

## 3. Provar-ho

1. Obre l'enllaç, escriu el teu nom i vota una casa. Ha de sortir el teu vot marcat i el comptador a 1.
2. Mira a Supabase > **Table Editor** > `votos`: hi has de veure la teva fila.
3. Treu el vot de prova des de la web (tocant la mateixa casa) o esborra la fila a Supabase.

## Com funciona i què cal saber

- Un vot per nom (sense distingir majúscules ni espais de més). Si algú escriu un nom diferent, pot votar dues vegades: no hi ha comptes ni verificació. Per veure qui ha votat què, mira la taula `votos` a Supabase; la web no mostra mai els noms.
- La web no pot llegir ni escriure la taula directament. Només pot cridar les funcions `votar`, `quitar_voto`, `mi_voto` i `resultados`, així ningú pot esborrar-ho tot des del navegador.
- Qui sàpiga el nom d'un altre pot treure-li el vot. Per a una classe és acceptable.
- El pla gratuït de Supabase pausa els projectes que passen setmanes sense activitat. Si passa, entra al panell i prem **Restore**.
- Per canviar preus, textos o fotos, edita `index.html` (les dades de les cases són a dalt del bloc `<script>`) i torna'l a pujar a GitHub.
- La data del compte enrere és el 30 de gener de 2027 a les 18:00; es canvia a la mateixa zona del `<script>`.
