# webapp

Application Node.js conteneurisée (Lab 7) : Dockerfile multi-étapes, tests exécutés pendant la construction, utilisateur non root, test de santé, analyse Trivy, image publiée sur GitHub Container Registry.

```bash
docker pull ghcr.io/aboubacar122/webapp:1.1.0
docker run -d -p 8080:3000 --read-only --cap-drop ALL ghcr.io/aboubacar122/webapp:1.1.0
curl localhost:8080/health
```

| Route | Rôle |
|---|---|
| `/` | Message, version et nom du conteneur qui répond |
| `/health` | État de l'application et de la base (`replica`, `primary`, `unreachable`, `not_configured`) |
| `/orders/stats` | Statistiques de la table `orders` (PostgreSQL, lecture seule) |
| `/metrics` | Métriques Prometheus |

Configuration par variables d'environnement : `APP_MESSAGE`, `DB_HOST`, `DB_NAME`, `DB_USER`. Les secrets se passent par fichier monté en lecture seule : `API_KEY_FILE`, `DB_PASSWORD_FILE` (jamais dans l'image).

Résultats mesurés : image 264 Mo contre 1,81 Go pour une image naïve (−85 %) ; 0 vulnérabilité HIGH/CRITICAL (Trivy 0.76.2) contre 434.

## Lab 8 – Kubernetes (k3s)

Manifestes et résultats dans [`k8s/`](k8s/README.md) : 3 nœuds, 0 requête en échec pendant les mises à jour grâce à `preStop`, lien base (Lab 6) et supervision (Lab 5).
