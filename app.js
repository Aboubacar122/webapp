const express = require("express");
const os = require("os");
const fs = require("fs");
const { Pool } = require("pg");
const client = require("prom-client");

const app = express();
app.disable("x-powered-by");
const VERSION = process.env.APP_VERSION || "1.0.0";
const MESSAGE = process.env.APP_MESSAGE || "Bonjour";

// Secret lu depuis un fichier monté (NOM_FILE), sinon depuis la variable NOM. Jamais écrit dans l'image.
function readSecret(name) {
  const file = process.env[`${name}_FILE`];
  if (file) {
    try { return fs.readFileSync(file, "utf8").trim(); } catch { return undefined; }
  }
  return process.env[name];
}
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Lien Lab 6 : base PostgreSQL facultative (sans DB_HOST, l'application fonctionne seule)
const pool = process.env.DB_HOST
  ? new Pool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT || 5432),
      database: process.env.DB_NAME || "labdb",
      user: process.env.DB_USER || "webapp",
      password: readSecret("DB_PASSWORD"),
      max: 3,
      connectionTimeoutMillis: 2000,
      idleTimeoutMillis: 10000,
    })
  : null;
if (pool) pool.on("error", () => {}); // une connexion coupée ne doit pas arrêter le processus
app.locals.pool = pool;

async function dbStatus() {
  if (!pool) return "not_configured";
  try {
    const r = await pool.query("SELECT pg_is_in_recovery() AS replica");
    return r.rows[0].replica ? "replica" : "primary";
  } catch {
    return "unreachable";
  }
}

// Lien Lab 5 : métriques Prometheus
const register = new client.Registry();
client.collectDefaultMetrics({ register });
const httpRequests = new client.Counter({
  name: "webapp_http_requests_total", help: "Requêtes HTTP reçues",
  labelNames: ["route", "code"], registers: [register],
});
const httpDuration = new client.Histogram({
  name: "webapp_http_request_duration_seconds", help: "Durée des requêtes HTTP",
  labelNames: ["route"], buckets: [0.005, 0.01, 0.05, 0.1, 0.5, 1, 2], registers: [register],
});
const dbUp = new client.Gauge({
  name: "webapp_database_up", help: "1 = base joignable, 0 = injoignable, -1 = non configurée",
  registers: [register],
});
const dbIsReplica = new client.Gauge({
  name: "webapp_database_is_replica", help: "1 si la base interrogée est un réplica",
  registers: [register],
});
new client.Gauge({
  name: "webapp_build_info", help: "Version de l'application",
  labelNames: ["version"], registers: [register],
}).set({ version: VERSION }, 1);

app.use((req, res, next) => {
  const end = httpDuration.startTimer();
  res.on("finish", () => {
    const route = req.route ? req.route.path : "unmatched";
    httpRequests.inc({ route, code: res.statusCode });
    end({ route });
  });
  next();
});

app.get("/", (req, res) => {
  res.send(
    `<h1>${escapeHtml(MESSAGE)}</h1>` +
    `<p>Version ${escapeHtml(VERSION)} – servie par ${escapeHtml(os.hostname())}</p>`
  );
});

app.get("/health", async (req, res) => {
  res.json({
    status: "ok",
    version: VERSION,
    secretConfigured: Boolean(readSecret("API_KEY")),
    database: await dbStatus(),
  });
});

app.get("/orders/stats", async (req, res) => {
  if (!pool) return res.status(503).json({ error: "database not configured" });
  try {
    const r = await pool.query(
      "SELECT count(*)::int AS total, max(id) AS last_id, max(created_at) AS last_order, " +
      "pg_is_in_recovery() AS replica FROM orders"
    );
    res.json(r.rows[0]);
  } catch {
    res.status(503).json({ error: "database unreachable" });
  }
});

app.get("/metrics", async (req, res) => {
  const s = await dbStatus();
  dbUp.set(s === "not_configured" ? -1 : s === "unreachable" ? 0 : 1);
  dbIsReplica.set(s === "replica" ? 1 : 0);
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

module.exports = app;
