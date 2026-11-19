// Votació anònima del Pas d'Equador, guardada a Vercel Blob (store privat).
// Cada vot és un arxiu buit amb el nom:  v/<hash-dispositiu>.<casa>.<hash-ip>
// Un vot per dispositiu. Tope de vots per IP perquè ningú pugui inundar la votació.
const { put, list, del } = require("@vercel/blob");
const crypto = require("crypto");

const CASAS = ["calgort", "aliberch", "molinou"];
const MAX_PER_IP = 40;
const sha = (s) => crypto.createHash("sha256").update(s + ":equador-uab").digest("hex").slice(0, 32);

// Una sola crida a Blob per llegir tots els vots.
async function totsElsVots() {
  let cursor, out = [];
  do {
    const r = await list({ prefix: "v/", cursor, limit: 1000 });
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

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.status(405).json({ error: "metode no permes" }); return; }
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const fn = body.fn;

    const dev = String(body.p_dev || "");
    if (dev.length < 16 || dev.length > 80) { res.status(400).json({ error: "dispositiu no valid" }); return; }
    const d = sha(dev);
    const blobs = await totsElsVots();
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
      // Escriure i esborrar l'antic a la vegada.
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
