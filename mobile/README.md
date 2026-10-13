# Office On Rent — mobile app (v2)

From-zero rebuild (Oct 2026) of the Expo / React Native app. Same backend, same store
identity (`com.theofficeonrent.crm`, EAS project `cc83e8b0…`) as the previous
app, which it replaced. Progress and the module
plan live in [ROADMAP.md](ROADMAP.md).

## Run

```bash
npm install
npm start            # dev client (needs a dev build on the phone)
npm run start:go     # Expo Go
npm run web          # browser preview
```

The app talks to `https://nemnidhi.cloud/api` unless `EXPO_PUBLIC_API_BASE_URL`
is set (see `.env.example`).

## Check

```bash
npm run typecheck
npm test             # pure logic in src/lib (node:test, no device needed)
```

## Layout

```
src/api         one file per backend module; types.ts holds the shapes
src/auth        session restore, sign in / out
src/theme       tokens (colours, type, spacing) + light/dark provider
src/ui          the component kit every screen is built from
src/components  shared rows and fields (LeadRow, TaskRow, DateTimeField)
src/lib         pure logic — statuses, formatting, attendance maths (tested)
src/navigation  bottom tabs, stack, deep links
src/screens     one folder per module
```
