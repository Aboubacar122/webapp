const test = require("node:test");
const assert = require("node:assert");
const app = require("../app");

async function get(path) {
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    return { status: res.status, body: await res.text() };
  } finally {
    server.close();
  }
}

test("GET /health répond ok", async () => {
  const r = await get("/health");
  assert.strictEqual(r.status, 200);
  const body = JSON.parse(r.body);
  assert.strictEqual(body.status, "ok");
  assert.strictEqual(body.database, "not_configured");
});

test("GET /orders/stats sans base répond 503", async () => {
  const r = await get("/orders/stats");
  assert.strictEqual(r.status, 503);
});

test("GET /metrics expose les métriques Prometheus", async () => {
  const r = await get("/metrics");
  assert.strictEqual(r.status, 200);
  assert.match(r.body, /webapp_build_info\{version="1\.0\.0"\} 1/);
  assert.match(r.body, /webapp_database_up -1/);
});

test("GET / affiche le message et la version", async () => {
  const r = await get("/");
  assert.strictEqual(r.status, 200);
  assert.match(r.body, /<h1>Bonjour<\/h1>/);
  assert.match(r.body, /Version 1\.0\.0/);
});
