// Votació + bústia de propostes del Pas d'Equador, guardades a Vercel Blob (store privat).
//
// Vots:       arxiu  v/<hash-nom>.<casa>.<hash-dispositiu>.<hash-ip>   amb el nom escrit a dins (només el veu l'organitzador)
//             - un vot per nom (el nom queda lligat al primer dispositiu que vota)
//             - un vot per dispositiu
//             - tope de vots per IP perquè ningú pugui inundar la votació
// Propostes:  arxiu JSON  s/<marca-de-temps>.<hash-dispositiu>.<aleatori>.json
// Organitzador (clau ADMIN_KEY): veure qui ha votat, comparar amb la llista de la classe, esborrar vots.
const { put, list, del, get } = require("@vercel/blob");
const crypto = require("crypto");

const CASAS = ["aliberch", "molinou"];
const TIPUS = ["aporto", "idea", "altres"];
const MAX_PER_IP = 40;
const MAX_IDEES_PER_DISPOSITIU = 8;
const MAX_IDEES = 300;
const sha = (s) => crypto.createHash("sha256").update(s + ":equador-uab").digest("hex").slice(0, 32);

async function llistar(prefix) {
  let cursor, out = [];
  do {
    const r = await list({ prefix, cursor, limit: 1000 });
    out = out.concat(r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

async function llegirJson(pathname) {
  try {
    const r = await get(pathname, { access: "private" });
    if (!r) return null;
    return JSON.parse(await new Response(r.stream).text());
  } catch (e) { return null; }
}

// Vots per casa a partir dels noms dels arxius (v/<nom>.<casa>.<dispositiu>.<ip>).
function filas(pathnames) {
  const n = {};
  pathnames.forEach((p) => { const c = p.split(".")[1]; if (CASAS.includes(c)) n[c] = (n[c] || 0) + 1; });
  return Object.keys(n).map((c) => ({ casa: c, n: n[c] }));
}
const parts = (b) => b.pathname.split(".");

function ipDe(req) {
  const xf = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "");
  return xf.split(",")[0].trim() || "desconeguda";
}

const neteja = (s, max) => String(s || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

// Nom normalitzat: sense accents ni majúscules, només lletres i espais. "Núria  Pérez-Vila" -> "nuria perez vila"
const norma = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z]+/g, " ").replace(/\s+/g, " ").trim();
const nomValid = (n) => { const w = n.split(" ").filter(Boolean); return w.length >= 2 && w.every((x) => x.length >= 2) && n.length <= 80; };

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}
// Dos noms són "el mateix" si un conté les paraules de l'altre (Anna Garcia ~ Anna Garcia Puig) o hi ha com a molt 2 lletres de diferència.
function coincideix(a, b) {
  const ta = norma(a).split(" ").filter(Boolean), tb = norma(b).split(" ").filter(Boolean);
  if (!ta.length || !tb.length) return false;
  const [pet, gran] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (pet.length >= 2 && pet.every((w) => gran.includes(w))) return true;
  return lev(ta.slice().sort().join(" "), tb.slice().sort().join(" ")) <= 2;
}

// ---------- Bústia ----------
async function llegirIdea(b) {
  const o = await llegirJson(b.pathname);
  return o ? { id: b.pathname, tipus: o.tipus, text: o.text, nom: o.nom || "", t: o.t } : null;
}

// La clau no distingeix majúscules (el mòbil sol posar la primera en majúscula) i es frena una mica cada error.
function claueCorrecta(k) {
  const real = String(process.env.ADMIN_KEY || "").trim().toLowerCase();
  const a = Buffer.from(String(k || "").trim().toLowerCase()), b = Buffer.from(real);
  return real.length >= 6 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
const esperaSiFalla = (ok) => ok ? Promise.resolve() : new Promise((r) => setTimeout(r, 1200));

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "metode no permes" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const fn = body.fn;

    // ---------- Bústia de propostes ----------
    if (fn === "ideas_llistar") {
      const blobs = (await llistar("s/")).sort((a, b) => (a.pathname < b.pathname ? 1 : -1)).slice(0, 100);
      const idees = (await Promise.all(blobs.map(llegirIdea))).filter(Boolean);
      res.status(200).json({ idees });
      return;
    }
    if (fn === "idea_esborrar") {
      if (!claueCorrecta(body.key)) { await esperaSiFalla(false); res.status(403).json({ error: "no autoritzat" }); return; }
      const id = String(body.id || "");
      if (!/^s\/[0-9]+\.[0-9a-f]+\.[0-9a-z]+\.json$/.test(id)) { res.status(400).json({ error: "id no valid" }); return; }
      await del(id);
      res.status(200).json({ ok: true });
      return;
    }
    if (fn === "idea_nova") {
      const dev = String(body.p_dev || "");
      if (dev.length < 16 || dev.length > 80) { res.status(400).json({ error: "dispositiu no valid" }); return; }
      const text = neteja(body.text, 400), nom = neteja(body.nom, 40), tipus = String(body.tipus || "");
      if (text.length < 3) { res.status(400).json({ error: "missatge massa curt" }); return; }
      if (!TIPUS.includes(tipus)) { res.status(400).json({ error: "tipus no valid" }); return; }
      const d12 = sha(dev).slice(0, 12);
      const existents = await llistar("s/");
      if (existents.length >= MAX_IDEES || existents.filter((b) => b.pathname.split(".")[1] === d12).length >= MAX_IDEES_PER_DISPOSITIU) {
        res.status(429).json({ error: "massa propostes" });
        return;
      }
      const t = Date.now();
      const pathname = "s/" + String(t).padStart(13, "0") + "." + d12 + "." + crypto.randomBytes(3).toString("hex") + ".json";
      await put(pathname, JSON.stringify({ tipus, text, nom, t }), { access: "private", addRandomSuffix: false, contentType: "application/json" });
      res.status(200).json({ idea: { id: pathname, tipus, text, nom, t } });
      return;
    }

    // ---------- Organitzador (necessita la clau) ----------
    if (typeof fn === "string" && fn.indexOf("admin_") === 0) {
      if (!claueCorrecta(body.key)) { await esperaSiFalla(false); res.status(403).json({ error: "no autoritzat" }); return; }

      if (fn === "admin_votants") {
        const blobs = (await llistar("v/")).filter((b) => CASAS.includes(parts(b)[1]));
        const votants = (await Promise.all(blobs.map(async (b) => {
          const o = await llegirJson(b.pathname);
          return { id: b.pathname, nom: o && o.nom ? o.nom : "(sense nom)", t: o && o.t ? o.t : 0, ip: parts(b)[3] };
        }))).sort((a, b) => a.t - b.t);
        // Vots que surten de la mateixa connexió (no és prova de frau: la wifi de la uni la comparteix tothom). Es marquen amb una lletra, sense mostrar l'IP.
        const perIp = {};
        votants.forEach((x) => { perIp[x.ip] = (perIp[x.ip] || 0) + 1; });
        const lletres = {}; let nl = 0;
        votants.forEach((x) => {
          if (perIp[x.ip] > 1) { if (!lletres[x.ip]) lletres[x.ip] = String.fromCharCode(65 + (nl++ % 26)); x.xarxa = lletres[x.ip]; x.xarxaN = perIp[x.ip]; }
          delete x.ip;
        });
        const rost = await llegirJson("admin/roster.json");
        const noms = rost && Array.isArray(rost.noms) ? rost.noms : [];
        let falten = [], senseCoincidencia = [];
        if (noms.length) {
          falten = noms.filter((n) => !votants.some((v) => coincideix(n, v.nom)));
          senseCoincidencia = votants.filter((v) => !noms.some((n) => coincideix(n, v.nom))).map((v) => v.id);
        }
        res.status(200).json({ votants, noms, falten, senseCoincidencia });
        return;
      }
      if (fn === "admin_roster_desar") {
        const noms = (Array.isArray(body.noms) ? body.noms : []).map((n) => neteja(n, 80)).filter((n) => n.length >= 3).slice(0, 400);
        await put("admin/roster.json", JSON.stringify({ noms }), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
        res.status(200).json({ ok: true, n: noms.length });
        return;
      }
      if (fn === "admin_esborrar_vot") {
        const id = String(body.id || "");
        if (!/^v\/[0-9a-f]{32}\.[a-z]+\.[0-9a-f]{32}\.[0-9a-f]{32}$/.test(id)) { res.status(400).json({ error: "id no valid" }); return; }
        await del(id);
        res.status(200).json({ ok: true });
        return;
      }
      res.status(400).json({ error: "funcio desconeguda" });
      return;
    }

    // ---------- Votació ----------
    const dev = String(body.p_dev || "");
    if (dev.length < 16 || dev.length > 80) { res.status(400).json({ error: "dispositiu no valid" }); return; }
    const d = sha(dev);
    const blobs = await llistar("v/");
    const mine = blobs.filter((b) => parts(b)[2] === d);
    const others = blobs.filter((b) => parts(b)[2] !== d);

    // Resultats + el vot d'aquest dispositiu, en una sola petició. Els resultats no inclouen cap nom.
    if (fn === "estado") {
      res.status(200).json({ res: filas(blobs.map((b) => b.pathname)), mine: mine.length ? parts(mine[0])[1] : null });
      return;
    }
    if (fn === "quitar_voto") {
      if (mine.length) await del(mine.map((b) => b.url));
      res.status(200).json({ res: filas(others.map((b) => b.pathname)) });
      return;
    }
    if (fn === "votar") {
      const casa = String(body.p_casa || "");
      if (!CASAS.includes(casa)) { res.status(400).json({ error: "casa no valida" }); return; }
      const nomEscrit = neteja(body.nom, 60), n = norma(nomEscrit);
      if (!nomValid(n)) { res.status(400).json({ error: "nom_no_valid" }); return; }
      const nh = sha("nom:" + n);
      // El nom ja ha votat des d'un altre dispositiu?
      const mateixNom = blobs.filter((b) => parts(b)[0] === "v/" + nh);
      if (mateixNom.length && parts(mateixNom[0])[2] !== d) { res.status(409).json({ error: "nom_ja_votat" }); return; }
      // Aquest dispositiu ja ha votat amb un altre nom?
      if (mine.length && parts(mine[0])[0] !== "v/" + nh) { res.status(409).json({ error: "dispositiu_ja_votat" }); return; }
      const i = sha(ipDe(req));
      if (!mine.length && blobs.filter((b) => parts(b)[3] === i).length >= MAX_PER_IP) {
        res.status(429).json({ error: "massa vots des d'aquesta connexio" });
        return;
      }
      const pathname = "v/" + nh + "." + casa + "." + d + "." + i;
      const old = mine.filter((b) => b.pathname !== pathname);
      await Promise.all([
        put(pathname, JSON.stringify({ nom: nomEscrit, t: Date.now() }), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" }),
        old.length ? del(old.map((b) => b.url)) : Promise.resolve()
      ]);
      res.status(200).json({ res: filas(others.map((b) => b.pathname).concat(pathname)) });
      return;
    }
    res.status(400).json({ error: "funcio desconeguda" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "error del servidor" });
  }
};
