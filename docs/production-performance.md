# Samvid OS Production Performance Checklist

## Frontend Build

- Build with `npm run build` from `frontend/`.
- Keep `VITE_API_BASE_URL=/api/client` for same-origin Nginx deployments.
- Set `VITE_SOCKET_PATH=/socket.io`; set `VITE_SOCKET_URL` only when the Socket.io host is different from the frontend host.
- Vite currently splits large vendor groups into separate chunks for React, maps, spreadsheet export, PDF export, realtime, motion, icons, HTTP, and shared vendor code.
- Serve `frontend/dist` from Nginx, a CDN, or static hosting. Put a CDN in front of the static assets when traffic grows.

## Static Asset Caching

- Cache Vite hashed assets under `/assets/` for one year with `immutable`.
- Keep `index.html` uncached or revalidated so new deployments are picked up immediately.
- Prefer Brotli at the CDN/proxy layer when available. Keep Express compression enabled for API JSON responses.
- If Nginx has the Brotli module installed, enable Brotli for text, CSS, JavaScript, JSON, and SVG. Otherwise use gzip as configured in `deploy/nginx.samvid.conf`.

## Backend Reverse Proxy

- Run Express behind Nginx or another reverse proxy.
- Proxy `/api/` to the backend HTTP port.
- Proxy `/socket.io/` with HTTP/1.1, `Upgrade`, and `Connection` headers.
- Set `TRUST_PROXY=true` when exactly one trusted proxy is in front of Express. Use a numeric value when multiple trusted proxies are chained.
- Keep `CORS_ORIGIN` to exact production origins, for example `https://crm.theofficeonrent.com`. Avoid `*` in production.

## Production Env

Use `backend/.env.example` and `frontend/.env.production.example` as templates. Required production values:

- `NODE_ENV=production`
- `PORT`
- `MONGO_URI`
- `JWT_SECRET`
- `CORS_ORIGIN`
- `TRUST_PROXY`
- `MONGO_MAX_POOL_SIZE`
- `MONGO_MIN_POOL_SIZE`
- `METRICS_BEARER_TOKEN`
- `LOG_LEVEL=info`

Do not commit real `.env` files or secrets.

## MongoDB

- For a single Node process, start with `MONGO_MAX_POOL_SIZE=25` and `MONGO_MIN_POOL_SIZE=2`.
- Increase pool size only after observing queueing, slow queries, or connection saturation.
- Use MongoDB Atlas Performance Advisor or `explain("executionStats")` on slow Leads, Inventory, Dashboard, Reports, and Chat queries.
- In production, keep `MONGO_AUTO_INDEX=false` and apply indexes intentionally during deploy windows.
- Monitor slow queries with `MONGO_SLOW_QUERY_THRESHOLD_MS`.

## Logging And Metrics

- Use `LOG_LEVEL=info` in production; use `warn` for very high traffic if logs become expensive.
- `/api/health` is the lightweight uptime check.
- `/api/metrics` exposes Prometheus metrics only when `METRICS_BEARER_TOKEN` is configured in production.
- Scrape metrics with:

```bash
curl -H "Authorization: Bearer $METRICS_BEARER_TOKEN" https://crm.theofficeonrent.com/api/metrics
```

## PM2 Strategy

- Use PM2 for the current VPS deployment because it is already compatible with the repo and Nginx flow.
- Keep `watch: false`.
- Use `pm2 reload <app-name> --update-env` after env or code changes.
- Use one instance first. Move to cluster mode only after verifying Socket.io sticky sessions at the reverse proxy/load balancer layer.

## Docker Strategy

- Docker is fine for a later migration, but keep frontend static hosting separate from backend runtime.
- If Dockerizing, expose only the backend port internally behind Nginx and mount secrets through environment variables or a secret manager.

## Release Verification

Run these after deployment:

```bash
curl -I https://crm.theofficeonrent.com/
curl https://crm.theofficeonrent.com/api/health
curl -H "Authorization: Bearer $METRICS_BEARER_TOKEN" https://crm.theofficeonrent.com/api/metrics
```

Then verify in the browser:

- Login and session restore.
- Leads list and Inventory list load quickly.
- TeamChat connects once and receives messages.
- Admin notifications arrive without repeated refresh loops.
- Hard refresh after deploy loads the newest frontend.
