// Votació + bústia de propostes del Pas d'Equador, guardades a Vercel Blob (store privat).
//
// El pla gratuït de Blob només inclou 2.000 operacions "avançades" (llistar, pujar) i 10.000 de "simples" (llegir)
// al mes, i si se superen el Blob deixa de funcionar durant 30 dies. Per això tot viu en pocs arxius JSON petits:
//   data/votes.json   { v: { <hash-nom>: { casa, d: <hash-dispositiu>, i: <hash-ip>, nom, t } } }
//   data/ideas.json   { list: [ { id, tipus, text, nom, t, d } ] }          (la més nova, primer)
//   data/roster.json  { noms: [...] }                                       (llista de la classe, només l'organitzador)
// Llegir = 1 operació simple. Escriure = 1 lectura + 1 pujada, amb control de concurrència (ifMatch/ETag) i reintents.
//
// Regles de vot: un vot per nom, un nom només des d'un dispositiu, un dispositiu només amb un nom, tope de vots per IP.
const { put, get } = require("@vercel/blob");
const crypto = require("crypto");

const CASAS = ["aliberch", "molinou"];
const TIPUS = ["aporto", "idea", "altres"];
const MAX_PER_IP = 40;
const MAX_IDEES_PER_DISPOSITIU = 8;
const MAX_IDEES = 300;
const VOTES = "data/votes.json", IDEAS = "data/ideas.json", ROSTER = "data/roster.json", COTXES = "data/cotxes.json";
const MAX_COTXES = 150, MAX_COTXES_PER_DISPOSITIU = 3;
const FI_COTXES = Date.UTC(2027, 1, 2); // els anuncis desapareixen passat el 31/01/2027
const vuitCotxes = () => ({ list: [] });
const MAX_COMENTARIS = 40;
const pubCotxe = (x, d12) => ({ id: x.id, tipus: x.tipus, nom: x.nom, des: x.des, hora: x.hora, places: x.places, tornada: x.tornada, nota: x.nota, ple: !!x.ple, t: x.t, meu: x.d === d12, comentaris: (x.c || []).map((c) => ({ id: c.id, nom: c.nom, text: c.text, t: c.t, meu: c.d === d12 })) });
const sha = (s) => crypto.createHash("sha256").update(s + ":equador-uab").digest("hex").slice(0, 32);

// ---------- Emmagatzematge ----------
const cache = {}; // memòria de la instància, per no llegir el Blob a cada petició
const CACHE_MS = 6000;

async function llegir(path, fresc) {
  const c = cache[path];
  if (!fresc && c && Date.now() - c.t < CACHE_MS) return c;
  const r = await get(path, { access: "private", useCache: false });
  let obj = null, etag = null;
  if (r && r.statusCode === 200) { obj = JSON.parse(await new Response(r.stream).text()); etag = String(r.blob.etag).replace(/^W\//, ""); }  // get() dona un ETag "dèbil" (W/"..."); put() espera el fort
  cache[path] = { obj, etag, t: Date.now() };
  return cache[path];
}

// Llegeix, aplica el canvi i desa només si ningú més ha escrit mentrestant (si no, ho torna a provar).
async function actualitza(path, buit, canvi) {
  for (let intent = 0; intent < 30; intent++) {
    const { obj, etag } = await llegir(path, true);
    const base = obj || buit();
    const retorn = canvi(base);
    const opts = { access: "private", addRandomSuffix: false, contentType: "application/json" };
    if (etag) opts.ifMatch = etag;
    try {
      await put(path, JSON.stringify(base), opts);
      delete cache[path];
      return retorn;
    } catch (e) {
      if (/precondition|already exists|etag|conflict|412|409/i.test(String(e && (e.message || e.name)))) { await new Promise((r) => setTimeout(r, 40 + Math.random() * (150 + intent * 60))); continue; }
      throw e;
    }
  }
  const err = new Error("conflicte"); err.http = 503; err.codi = "ocupat"; throw err;
}
const falla = (http, codi) => { const e = new Error(codi); e.http = http; e.codi = codi; return e; };

// ---------- Utilitats ----------
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

function filas(v) {
  const n = {};
  Object.keys(v).forEach((k) => { const c = v[k].casa; if (CASAS.includes(c)) n[c] = (n[c] || 0) + 1; });
  return Object.keys(n).map((c) => ({ casa: c, n: n[c] }));
}

function ipDe(req) {
  const xf = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "");
  return xf.split(",")[0].trim() || "desconeguda";
}

function claueCorrecta(k) {
  const real = String(process.env.ADMIN_KEY || "").trim().toLowerCase();
  const a = Buffer.from(String(k || "").trim().toLowerCase()), b = Buffer.from(real);
  return real.length >= 6 && a.length === b.length && crypto.timingSafeEqual(a, b);
}
const esperaSiFalla = () => new Promise((r) => setTimeout(r, 1200));

const vuitVots = () => ({ v: {} });
const vuitIdees = () => ({ list: [] });

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "metode no permes" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const fn = body.fn;

    // ---------- Bústia de propostes ----------
    if (fn === "ideas_llistar") {
      const { obj } = await llegir(IDEAS);
      const idees = ((obj && obj.list) || []).slice(0, 100).map((x) => ({ id: x.id, tipus: x.tipus, text: x.text, nom: x.nom, t: x.t }));
      res.status(200).json({ idees });
      return;
    }
    if (fn === "idea_nova") {
      const dev = String(body.p_dev || "");
      if (dev.length < 16 || dev.length > 80) { res.status(400).json({ error: "dispositiu no valid" }); return; }
      const text = neteja(body.text, 400), nom = neteja(body.nom, 40), tipus = String(body.tipus || "");
      if (text.length < 3) { res.status(400).json({ error: "missatge massa curt" }); return; }
      if (!TIPUS.includes(tipus)) { res.status(400).json({ error: "tipus no valid" }); return; }
      const d12 = sha(dev).slice(0, 12);
      const t = Date.now();
      const idea = { id: String(t) + crypto.randomBytes(3).toString("hex"), tipus, text, nom, t, d: d12 };
      await actualitza(IDEAS, vuitIdees, (b) => {
        if (b.list.length >= MAX_IDEES || b.list.filter((x) => x.d === d12).length >= MAX_IDEES_PER_DISPOSITIU) throw falla(429, "massa propostes");
        b.list.unshift(idea);
      });
      res.status(200).json({ idea: { id: idea.id, tipus, text, nom, t } });
      return;
    }

    // ---------- Tauler de cotxes ----------
    if (typeof fn === "string" && fn.indexOf("cotxe") === 0) {
      const dev = String(body.p_dev || "");
      if (dev.length < 16 || dev.length > 80) { res.status(400).json({ error: "dispositiu no valid" }); return; }
      const d12 = sha(dev).slice(0, 12);
      if (fn === "cotxes_llistar") {
        const { obj } = await llegir(COTXES);
        const llista = Date.now() > FI_COTXES ? [] : ((obj && obj.list) || []);
        res.status(200).json({ cotxes: llista.slice(0, 150).map((x) => pubCotxe(x, d12)) });
        return;
      }
      if (fn === "cotxe_nou") {
        const tipus = String(body.tipus || "");
        if (tipus !== "ofereix" && tipus !== "busca") { res.status(400).json({ error: "tipus no valid" }); return; }
        const nom = neteja(body.nom, 40), des = neteja(body.des, 40), hora = neteja(body.hora, 20), nota = neteja(body.nota, 160);
        const places = Math.max(1, Math.min(8, parseInt(body.places, 10) || 1));
        if (nom.length < 2) { res.status(400).json({ error: "nom_curt" }); return; }
        if (des.length < 2) { res.status(400).json({ error: "origen_curt" }); return; }
        const t = Date.now();
        const x = { id: String(t) + crypto.randomBytes(3).toString("hex"), tipus, nom, des, hora, places, tornada: body.tornada === true || body.tornada === "si", nota, ple: false, t, d: d12, c: [] };
        await actualitza(COTXES, vuitCotxes, (b) => {
          if (b.list.length >= MAX_COTXES || b.list.filter((y) => y.d === d12).length >= MAX_COTXES_PER_DISPOSITIU) throw falla(429, "massa anuncis");
          b.list.unshift(x);
        });
        res.status(200).json({ cotxe: pubCotxe(x, d12) });
        return;
      }
      if (fn === "cotxe_comentar") {
        const id = String(body.id || "");
        const nom = neteja(body.nom, 30), text = neteja(body.text, 240);
        if (nom.length < 2) { res.status(400).json({ error: "nom_curt" }); return; }
        if (text.length < 2) { res.status(400).json({ error: "text_curt" }); return; }
        const t = Date.now(), cid = String(t) + crypto.randomBytes(3).toString("hex");
        const r = await actualitza(COTXES, vuitCotxes, (b) => {
          const x = b.list.filter((y) => y.id === id)[0];
          if (!x) throw falla(404, "no trobat");
          x.c = x.c || [];
          if (x.c.length >= MAX_COMENTARIS) throw falla(429, "massa comentaris");
          x.c.push({ id: cid, nom, text, t, d: d12 });
          return pubCotxe(x, d12);
        });
        res.status(200).json({ cotxe: r });
        return;
      }
      if (fn === "cotxe_comentari_esborrar") {
        const id = String(body.id || ""), cid = String(body.cid || "");
        const r = await actualitza(COTXES, vuitCotxes, (b) => {
          const x = b.list.filter((y) => y.id === id)[0];
          if (!x) throw falla(404, "no trobat");
          const c = (x.c || []).filter((q) => q.id === cid)[0];
          if (!c) return pubCotxe(x, d12);
          if (c.d !== d12 && x.d !== d12) throw falla(403, "no es teu");
          x.c = x.c.filter((q) => q.id !== cid);
          return pubCotxe(x, d12);
        });
        res.status(200).json({ cotxe: r });
        return;
      }
      if (fn === "cotxe_ple" || fn === "cotxe_esborrar") {
        const id = String(body.id || "");
        if (!/^[0-9]{10,}[0-9a-f]{6}$/.test(id)) { res.status(400).json({ error: "id no valid" }); return; }
        await actualitza(COTXES, vuitCotxes, (b) => {
          const x = b.list.filter((y) => y.id === id)[0];
          if (!x) return;
          if (x.d !== d12) throw falla(403, "no es teu");
          if (fn === "cotxe_ple") x.ple = !x.ple; else b.list = b.list.filter((y) => y.id !== id);
        });
        res.status(200).json({ ok: true });
        return;
      }
      res.status(400).json({ error: "funcio desconeguda" });
      return;
    }

    // ---------- Organitzador (necessita la clau) ----------
    if ((typeof fn === "string" && fn.indexOf("admin_") === 0) || fn === "idea_esborrar") {
      if (!claueCorrecta(body.key)) { await esperaSiFalla(); res.status(403).json({ error: "no autoritzat" }); return; }

      if (fn === "admin_votants") {
        const { obj } = await llegir(VOTES);
        const v = (obj && obj.v) || {};
        const votants = Object.keys(v).map((k) => ({ id: k, nom: v[k].nom || "(sense nom)", t: v[k].t || 0, ip: v[k].i })).sort((a, b) => a.t - b.t);
        // Vots que surten de la mateixa connexió (no és prova de frau: la wifi de la uni la comparteix tothom). Es marquen amb una lletra, sense mostrar l'IP.
        const perIp = {};
        votants.forEach((x) => { perIp[x.ip] = (perIp[x.ip] || 0) + 1; });
        const lletres = {}; let nl = 0;
        votants.forEach((x) => {
          if (perIp[x.ip] > 1) { if (!lletres[x.ip]) lletres[x.ip] = String.fromCharCode(65 + (nl++ % 26)); x.xarxa = lletres[x.ip]; x.xarxaN = perIp[x.ip]; }
          delete x.ip;
        });
        const rost = (await llegir(ROSTER)).obj;
        const noms = rost && Array.isArray(rost.noms) ? rost.noms : [];
        let falten = [], senseCoincidencia = [];
        if (noms.length) {
          falten = noms.filter((n) => !votants.some((x) => coincideix(n, x.nom)));
          senseCoincidencia = votants.filter((x) => !noms.some((n) => coincideix(n, x.nom))).map((x) => x.id);
        }
        res.status(200).json({ votants, noms, falten, senseCoincidencia });
        return;
      }
      if (fn === "admin_roster_desar") {
        const noms = (Array.isArray(body.noms) ? body.noms : []).map((n) => neteja(n, 80)).filter((n) => n.length >= 3).slice(0, 400);
        await put(ROSTER, JSON.stringify({ noms }), { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
        delete cache[ROSTER];
        res.status(200).json({ ok: true, n: noms.length });
        return;
      }
      if (fn === "admin_esborrar_vot") {
        const id = String(body.id || "");
        if (!/^[0-9a-f]{32}$/.test(id)) { res.status(400).json({ error: "id no valid" }); return; }
        await actualitza(VOTES, vuitVots, (b) => { delete b.v[id]; });
        res.status(200).json({ ok: true });
        return;
      }
      if (fn === "admin_cotxe_comentari_esborrar") {
        const id = String(body.id || ""), cid = String(body.cid || "");
        await actualitza(COTXES, vuitCotxes, (b) => { const x = b.list.filter((y) => y.id === id)[0]; if (x) x.c = (x.c || []).filter((q) => q.id !== cid); });
        res.status(200).json({ ok: true });
        return;
      }
      if (fn === "admin_cotxe_esborrar") {
        const id = String(body.id || "");
        if (!/^[0-9]{10,}[0-9a-f]{6}$/.test(id)) { res.status(400).json({ error: "id no valid" }); return; }
        await actualitza(COTXES, vuitCotxes, (b) => { b.list = b.list.filter((y) => y.id !== id); });
        res.status(200).json({ ok: true });
        return;
      }
      if (fn === "idea_esborrar") {
        const id = String(body.id || "");
        if (!/^[0-9]{10,}[0-9a-f]{6}$/.test(id)) { res.status(400).json({ error: "id no valid" }); return; }
        await actualitza(IDEAS, vuitIdees, (b) => { b.list = b.list.filter((x) => x.id !== id); });
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

    // Resultats + el vot d'aquest dispositiu, en una sola petició. Els resultats no inclouen cap nom.
    if (fn === "estado") {
      const { obj } = await llegir(VOTES);
      const v = (obj && obj.v) || {};
      const meu = Object.keys(v).filter((k) => v[k].d === d)[0];
      res.status(200).json({ res: filas(v), mine: meu ? v[meu].casa : null });
      return;
    }
    if (fn === "quitar_voto") {
      const r = await actualitza(VOTES, vuitVots, (b) => {
        Object.keys(b.v).forEach((k) => { if (b.v[k].d === d) delete b.v[k]; });
        return filas(b.v);
      });
      res.status(200).json({ res: r });
      return;
    }
    if (fn === "votar") {
      const casa = String(body.p_casa || "");
      if (!CASAS.includes(casa)) { res.status(400).json({ error: "casa no valida" }); return; }
      const nomEscrit = neteja(body.nom, 60), n = norma(nomEscrit);
      if (!nomValid(n)) { res.status(400).json({ error: "nom_no_valid" }); return; }
      const nh = sha("nom:" + n);
      const i = sha(ipDe(req));
      const r = await actualitza(VOTES, vuitVots, (b) => {
        const meu = Object.keys(b.v).filter((k) => b.v[k].d === d)[0];
        if (b.v[nh] && b.v[nh].d !== d) throw falla(409, "nom_ja_votat");           // aquest nom ja ha votat des d'un altre dispositiu
        if (meu && meu !== nh) throw falla(409, "dispositiu_ja_votat");             // aquest dispositiu ja ha votat amb un altre nom
        if (!meu && Object.keys(b.v).filter((k) => b.v[k].i === i).length >= MAX_PER_IP) throw falla(429, "massa vots des d'aquesta connexio");
        b.v[nh] = { casa, d, i, nom: nomEscrit, t: (b.v[nh] && b.v[nh].t) || Date.now() };
        return filas(b.v);
      });
      res.status(200).json({ res: r });
      return;
    }
    res.status(400).json({ error: "funcio desconeguda" });
  } catch (e) {
    if (e && e.http) { res.status(e.http).json({ error: e.codi || "error" }); return; }
    console.error(e);
    res.status(500).json({ error: "error del servidor" });
  }
};
