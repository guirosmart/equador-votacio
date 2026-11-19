// Votació anònima del Pas d'Equador, guardada a Vercel Blob (store privat).
// Cada vot és un arxiu buit amb el nom:  v/<hash-dispositiu>.<casa>.<hash-ip>
// Un vot per dispositiu. Tope de vots per IP perquè ningú pugui inundar la votació.
const { put, list, del } = require("@vercel/blob");
const crypto = require("crypto");

const CASAS = ["calgort", "aliberch", "molinou"];
const MAX_PER_IP = 40;
const sha = (s) => crypto.createHash("sha256").update(s + ":equador-uab").digest("hex").slice(0, 32);

async function totsElsVots() {
  let cursor, out = [];
  do {
    const r = await list({ prefix: "v/", cursor, limit: 1000 });
    out = out.concat(r.blobs);
    cursor = r.hasMore ? r.cursor : undefined;
  } while (cursor);
  return out;
}

function ipDe(req) {
  const xf = String(req.headers["x-forwarded-for"] || req.headers["x-real-ip"] || "");
  return xf.split(",")[0].trim() || "desconeguda";
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "metode no permes" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const fn = body.fn;

    if (fn === "resultados") {
      const n = {};
      (await totsElsVots()).forEach((b) => { const c = b.pathname.split(".")[1]; if (CASAS.includes(c)) n[c] = (n[c] || 0) + 1; });
      res.status(200).json(Object.keys(n).map((c) => ({ casa: c, n: n[c] })));
      return;
    }

    const dev = String(body.p_dev || "");
    if (dev.length < 16 || dev.length > 80) { res.status(400).json({ error: "dispositiu no valid" }); return; }
    const d = sha(dev);
    const blobs = await totsElsVots();
    const mine = blobs.filter((b) => b.pathname.startsWith("v/" + d + "."));

    if (fn === "mi_voto") {
      res.status(200).json(mine.length ? mine[0].pathname.split(".")[1] : null);
      return;
    }
    if (fn === "quitar_voto") {
      if (mine.length) await del(mine.map((b) => b.url));
      res.status(200).json(null);
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
      await put(pathname, "1", { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "text/plain" });
      const old = mine.filter((b) => b.pathname !== pathname);
      if (old.length) await del(old.map((b) => b.url));
      res.status(200).json(null);
      return;
    }
    res.status(400).json({ error: "funcio desconeguda" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "error del servidor" });
  }
};
