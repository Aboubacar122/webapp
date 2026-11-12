const app = require("./app");
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  console.log(`Serveur démarré sur le port ${PORT}`);
});

// Arrêt propre : Docker et Kubernetes envoient SIGTERM avant d'arrêter un conteneur
function shutdown(signal) {
  console.log(`${signal} reçu, arrêt propre en cours`);
  server.close(async () => {
    if (app.locals.pool) await app.locals.pool.end().catch(() => {});
    process.exit(0);
  });
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
