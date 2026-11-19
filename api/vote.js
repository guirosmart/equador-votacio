// Votació anònima + bústia de propostes del Pas d'Equador, guardades a Vercel Blob (store privat).
// Vots:       arxiu buit amb el nom  v/<hash-dispositiu>.<casa>.<hash-ip>   (un vot per dispositiu, tope per IP)
// Propostes:  arxiu JSON amb el nom  s/<marca-de-temps>.<hash-dispositiu>.<aleatori>.json
const { put, list, del, get } = require("@vercel/blob");
const crypto = require("crypto");

const CASAS = ["calgort", "aliberch", "molinou"];
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

// Vots per casa a partir dels noms dels arxius.
function filas(pathnames) {
  const n = {};
  pathnames.forEach((p) => { const c = p.split(".")[1]; if (CASAS.includes(c)) n[c] = (n[c] || 0) + 1; });
  return Object.keys(n).map((c) => ({ casa: c, n: n[c] }));
}

function ipDe(req) {
  const xf = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "");
  return xf.split(",")[0].trim() || "desconeguda";
}

const neteja = (s, max) => String(s || "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);

async function llegirIdea(b) {
  try {
    const r = await get(b.pathname, { access: "private" });
    if (!r) return null;
    const o = JSON.parse(await new Response(r.stream).text());
    return { id: b.pathname, tipus: o.tipus, text: o.text, nom: o.nom || "", t: o.t };
  } catch (e) { return null; }
}

function claueCorrecta(k) {
  const real = process.env.ADMIN_KEY || "";
  const a = Buffer.from(String(k || "")), b = Buffer.from(real);
  return real.length >= 16 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

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
      if (!claueCorrecta(body.key)) { res.status(403).json({ error: "no autoritzat" }); return; }
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

    // ---------- Votació ----------
    const dev = String(body.p_dev || "");
    if (dev.length < 16 || dev.length > 80) { res.status(400).json({ error: "dispositiu no valid" }); return; }
    const d = sha(dev);
    const blobs = await llistar("v/");
    const mine = blobs.filter((b) => b.pathname.startsWith("v/" + d + "."));
    const others = blobs.filter((b) => !b.pathname.startsWith("v/" + d + "."));

    // Resultats + el vot d'aquest dispositiu, en una sola petició.
    if (fn === "estado") {
      res.status(200).json({ res: filas(blobs.map((b) => b.pathname)), mine: mine.length ? mine[0].pathname.split(".")[1] : null });
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
      const i = sha(ipDe(req));
      if (!mine.length && blobs.filter((b) => b.pathname.endsWith("." + i)).length >= MAX_PER_IP) {
        res.status(429).json({ error: "massa vots des d'aquesta connexio" });
        return;
      }
      const pathname = "v/" + d + "." + casa + "." + i;
      const old = mine.filter((b) => b.pathname !== pathname);
      await Promise.all([
        put(pathname, "1", { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "text/plain" }),
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
