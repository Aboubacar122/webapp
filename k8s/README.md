# Lab 8 – Kubernetes (k3s) : déploiement sans interruption de la webapp

Cluster k3s v1.37.2 de 3 nœuds (kub01 serveur 192.168.184.80, kub02 .81, kub03 .82) qui fait tourner
l'image `ghcr.io/aboubacar122/webapp` du Lab 7, branchée sur le réplica PostgreSQL du Lab 6 et supervisée
par le Prometheus/Grafana du Lab 5.

```
navigateur ──> traefik (Ingress webapp.lab.local, sur chaque nœud)
                 └─> Service webapp :80 ─> 3 pods webapp :3000 (1 par nœud de préférence)
                                            ├─> pg-02 192.168.184.61:5432 (réplica, rôle webapp_k8s en lecture seule)
mon-01 Prometheus ──https:6443──> API k3s (proxy) ─> /metrics de chaque pod
```

## Fichiers

| Fichier | Rôle |
|---|---|
| `namespace.yaml` | Namespace `webapp` avec Pod Security Admission **restricted** (refuse tout pod privilégié/root) |
| `configmap.yaml` | `APP_MESSAGE` + paramètres de la base (hôte, port, base, utilisateur – pas de mot de passe) |
| `deployment.yaml` | 3 copies, RollingUpdate maxUnavailable 0 / maxSurge 1, sondes readiness/liveness, limites CPU/mémoire, non-root (uid 1000), seccomp RuntimeDefault, système de fichiers en lecture seule, aucune capacité Linux, pas de jeton de compte de service, **preStop 10 s**, Secrets montés en fichiers |
| `service.yaml` / `ingress.yaml` | ClusterIP 80 -> 3000 ; Ingress traefik `webapp.lab.local` |
| `pdb.yaml` | PodDisruptionBudget : au moins 2 pods pendant un drain |
| `monitoring-rbac.yaml` | Compte `monitoring/prometheus-externe` : lister les pods de `webapp` et lire leur `/metrics`, rien d'autre |
| `../monitoring/` | Job Prometheus `webapp-k8s`, règle `WebappK8sReplicasLow`, tableau Grafana |

## Déployer

Les Secrets ne sont **jamais dans Git**. Ils sont créés depuis des fichiers aléatoires, puis les fichiers sont détruits :

```bash
kubectl apply -f k8s/namespace.yaml
( umask 077; head -c 48 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' > ~/api_key )
kubectl -n webapp create secret generic webapp-secret --from-file=API_KEY=$HOME/api_key && shred -u ~/api_key
# webapp-db : DB_PASSWORD (mot de passe du rôle webapp_k8s, dont seule l'empreinte SCRAM est envoyée à PostgreSQL)
kubectl apply --dry-run=server -f k8s/ && kubectl apply -f k8s/
kubectl -n webapp rollout status deploy/webapp
```

## Résultats mesurés

| Test | Résultat |
|---|---|
| Suppression d'un pod | remplaçant prêt en 7 s |
| 5 copies puis 3 | répartition 2/2/1, retour à 3 |
| Drain de kub02 | pod évacué, PDB respecté, 6 × 200 pendant la maintenance |
| Pod privilégié | refusé : `violates PodSecurity "restricted:latest"` |
| Mise à jour 1.0.0 -> 1.1.0, réglages de l'énoncé seuls | **5 échecs / 1868** requêtes (2 × 502, 3 sans réponse) |
| Même mise à jour avec `preStop` 10 s | **0 échec / 283** |
| Retour arrière + image 9.9.9 inexistante + annulation | **0 échec / 762** ; pod en ImagePullBackOff, 3 anciens pods servent toujours |
| Lien Lab 6 | `/health` database **replica** ; `/orders/stats` 1882 commandes, dernier id 1932 |
| Lien Lab 5 | 3 pods lus par Prometheus via l'API, 15 règles d'alerte, tableau Grafana |

## Pourquoi `preStop` ?

À l'arrêt d'un pod, Kubernetes envoie SIGTERM **et** retire le pod de traefik en même temps. Pendant une fraction de
seconde, traefik envoie encore des requêtes à un pod qui s'arrête. La pause de 10 s laisse traefik retirer le pod
avant que l'application ne reçoive le signal.

## Sécurité

- Pods non-root, sans élévation de privilèges ni capacités, système de fichiers en lecture seule, seccomp.
- Secrets montés en fichiers 0440 (jamais en variables d'environnement), chiffrement des Secrets au repos activé (`secrets-encryption`).
- Kubeconfig en 600 sur kub01 seulement ; jeton d'adhésion jamais affiché ; API 6443 ouverte aux 3 nœuds et à mon-01 seulement (ufw).
- Base : rôle dédié en lecture seule, accès limité à .80/.81/.82 (pg_hba + ufw).
- Prometheus : droits RBAC minimaux, jeton limité dans le temps (720 h), 403 sur `kube-system` et sur les Secrets.
