# The Carevia API. Built on the VPS from the files deploy.sh ships:
# the root package files, every apps/*/package.json (npm ci checks them against the lockfile), apps/api and content/.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
COPY . .
RUN npm ci -w apps/api --include-workspace-root=false --no-audit --no-fund
WORKDIR /srv/apps/api
# Migrations run on every start; seeding is a one-off (see deploy.sh --seed).
CMD ["sh", "-c", "npx prisma migrate deploy && node src/server.js"]
