# Two stages: Node builds, nginx serves. Nothing from the build stage — no
# Node, no node_modules, no source — reaches the running container.

# ── Build ────────────────────────────────────────────────────────────
FROM node:24-alpine AS build
WORKDIR /app

# Dependencies first, so a source-only change reuses this layer.
COPY package*.json ./

# `npm ci` and not `npm install`: it installs exactly what the lockfile says and
# fails if the two have drifted apart, which is the point of having a lockfile.
RUN npm ci

COPY . .

# The two public Supabase values.
#
# They are build-time arguments rather than runtime environment, because Vite
# inlines `import.meta.env.VITE_*` into the bundle — by the time the container
# runs, there is no process left to read an environment variable. That is also
# why they must be public: the anon key is designed to be, and every protection
# behind it is Row Level Security on the server, never secrecy here.
#
# The service_role key must NEVER appear in this file or in Dokploy's build
# arguments for this app. It bypasses RLS entirely.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY

# `npm run build` is `tsc -b && vite build`, so a type error fails the image
# rather than shipping.
RUN npm run build

# ── Serve ────────────────────────────────────────────────────────────
FROM nginx:1.27-alpine AS serve

# Replaces the default site, which has no SPA fallback and would 404 on every
# route the router owns.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

# A container that answers is not the same as a container that serves the app.
# This asks for the actual page.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q --spider http://localhost/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
