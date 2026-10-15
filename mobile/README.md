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

The app talks to `https://crm.theofficeonrent.com/api` unless `EXPO_PUBLIC_API_BASE_URL`
is set (see `.env.example`).

The Field ops map uses Google Maps on Android, which needs a key baked into the
build: set `GOOGLE_MAPS_ANDROID_API_KEY` as an EAS secret (or in the shell for a
local build); `app.config.js` passes it on. Without it the screen draws its own
map. iOS uses Apple Maps and needs no key.

Version 2.1.0 added native modules (`expo-print`, `expo-sharing`,
`react-native-maps`), so it needs a new build; with `runtimeVersion` set to the
app version, 2.1.0 updates never reach 2.0.0 installs.

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
