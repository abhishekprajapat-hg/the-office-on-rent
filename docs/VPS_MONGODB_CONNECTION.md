# VPS MongoDB Connection

This project reads MongoDB only from `process.env.MONGO_URI`. Both local development and production can point at the same VPS-hosted MongoDB, but local writes will affect production data when you do that.

## Recommended Local Mode: SSH Tunnel

Keep MongoDB bound to `127.0.0.1` on the VPS and tunnel into it from your machine:

```bash
ssh -L 27018:127.0.0.1:27017 root@YOUR_VPS_IP
```

Then set local `backend/.env`:

```env
NODE_ENV=development
PORT=5000
MONGO_URI=mongodb://office_app:STRONG_PASSWORD@127.0.0.1:27018/the_office_on_rent?authSource=the_office_on_rent
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
TRUST_PROXY=false
```

Start the backend after the tunnel is open:

```bash
cd backend
npm run db:test-connection
npm run dev
```

## Direct Remote URI Mode

Direct remote MongoDB access is not recommended because it usually requires exposing MongoDB networking beyond the VPS. If you use it, restrict access at the firewall to trusted IPs only, require authentication, and use TLS where possible.

Example shape only:

```env
MONGO_URI=mongodb://office_app:STRONG_PASSWORD@PRIVATE_OR_RESTRICTED_HOST:27017/the_office_on_rent?authSource=the_office_on_rent
```

## Production VPS Configuration

On the VPS, keep MongoDB listening on loopback:

```env
NODE_ENV=production
PORT=5100
MONGO_URI=mongodb://office_app:STRONG_PASSWORD@127.0.0.1:27017/the_office_on_rent?authSource=the_office_on_rent
JWT_SECRET=replace-with-a-long-random-secret
CORS_ORIGIN=https://crm.theofficeonrent.com
TRUST_PROXY=1
MONGO_AUTO_INDEX=false
```

The backend can use the same database name as local tunnel mode because both URIs point to the same VPS database.

## Why Port 27017 Should Stay Private

MongoDB port `27017` should not be publicly exposed. Public exposure increases brute-force, credential stuffing, data exfiltration, and accidental destructive-write risk. The safer pattern is:

- MongoDB binds to `127.0.0.1` on the VPS.
- Nginx exposes only web traffic, such as `80` and `443`.
- Developers use SSH tunneling for local access.
- VPS firewall blocks inbound `27017`.

## Seed And Migration Safety

Seeder and backfill scripts are guarded because local development may point at the shared production database. If the target database looks shared or production-like, seed scripts stop unless this variable is explicitly set:

```env
ALLOW_SHARED_DB_SEED=true
```

Use that override only when you have confirmed the target and taken a backup.

Guarded scripts include:

```bash
npm run seed:admin
npm run seed:companies:backfill
npm run seed:leads:backfill-company
npm run seed:leads
npm run seed:inventory
npm run seed:inventory:titles
npm run migrate:company
```

## Backup Recommendation

Before any local testing against the shared VPS database, take a backup on the VPS. Prefer a proper MongoDB dump from the VPS host, stored outside the app directory and protected with strict permissions.

Do not run destructive seeders, import scripts, or ad hoc cleanup commands against the shared DB without a fresh backup.
