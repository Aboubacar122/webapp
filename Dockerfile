# syntax=docker/dockerfile:1

# ---- Étape 1 : dépendances de production uniquement ----
FROM node:26-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ---- Étape 2 : tests (toutes les dépendances) ----
FROM node:26-alpine AS test
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm test

# ---- Étape 3 : image finale, minimale ----
FROM node:26-alpine AS runtime
ARG APP_VERSION=1.0.0
ENV NODE_ENV=production \
    APP_VERSION=${APP_VERSION}
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node app.js server.js ./
# Dependance voulue envers l etape test (sinon BuildKit saute les tests)
COPY --from=test --chown=node:node /app/package.json ./
# Le runtime n a pas besoin de npm : retire (moins de failles, surface reduite)
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-*
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "server.js"]
