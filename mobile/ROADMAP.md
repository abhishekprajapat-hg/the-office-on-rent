# Mobile v2 — rebuild roadmap

A from-zero rebuild of the Office On Rent mobile app (Expo / React Native),
module by module and page by page, using the web app (`frontend/`) as the
functional reference and the same backend (`https://nemnidhi.cloud/api`).

Every page goes through the same three steps before it is ticked:

1. **Design** — the web page it mirrors, what a phone layout keeps, cuts or
   reshapes, and the states (loading, empty, error, no access).
2. **Implement** — screen + its API calls, in light and dark.
3. **Test** — `npm run typecheck`, `npm test` (pure logic), and a rendered
   check of the web export at a 430×932 phone viewport, light and dark.

## Design language

v3 (Claude Design, Oct 2026): white + blue (`#2549d6`), Plus Jakarta Sans,
JetBrains Mono for times and money, outline Ionicons with filled active tabs,
rounded-square avatars and icon tiles, 18px cards with a 1px line border, a
blue hero band on Home and a pill-style tab bar. Tokens live in
`src/theme/tokens.ts`; shared pieces (Segmented, IconTile, ListCard, StatTile,
Ring, Toggle) in `src/ui/Kit.tsx`. Phone adaptations of web: tables → cards,
sidebar → bottom tabs + a "More" grid, flyout filters → horizontal chips and
bottom sheets.

## Modules

### M0 Foundation
- [x] Theme tokens + light/dark/system provider
- [x] API client (bearer token, refresh on 401, timeout, read retry)
- [x] Session storage (same keys as v1, so updating keeps people signed in)
- [x] Auth provider (restore, login, logout with server revoke)
- [x] UI kit: Text, Button, Field, Card, Badge, Avatar, Screen, states
- [x] Navigation: auth stack, role-aware bottom tabs, stacks per tab

### M1 Auth — web `components/auth/Login.jsx`
- [x] Login

### M2 Home — web `DashboardByRole` (Manager / Executive / Field / Production)
- [x] Home dashboard: greeting, attendance strip, lead summary, follow-ups due today, my open tasks

### M3 Leads — web `modules/leads`
- [x] Leads list: search, status chips, infinite scroll, pull to refresh
- [x] Lead details: contact actions, status stepper, details, assignment
- [x] Update status + next follow-up
- [x] Add lead

### M4 Tasks — web `modules/tasks`
- [x] Task list: open / completed, priority, due
- [x] Task details: subtasks, complete
- [x] New task

### M5 Attendance — web `modules/attendance`
- [x] My day: check in / out with location, breaks, worked time
- [x] History (this month)
- [x] Leave: balance, requests, apply

### M6 Profile & More — web `modules/profile`
- [x] More menu (role-aware)
- [x] Profile + appearance (theme) + sign out

### Notes from testing (12 Oct 2026)
- Tested against the local backend + seeded demo DB (admin@test.com, manager@test.com).
- Admins cannot mark personal attendance (server rule), so admins get no Attendance tab; their team view comes with M11.
- A task can only be completed once every checklist item is done (server rule); the UI says so up front.
- Chat realtime uses one shared socket.io connection (src/realtime/socket.ts); screens join room channels for receipts.
- `/auth/me` omits `profileImageUrl`; the app merges it over the stored user instead of replacing it.
- Deep links: `theofficeonrent://leads/<id>`, `/tasks/<id>`, `/attendance/leave`, `/profile` (see src/navigation/linking.ts).

### M7 Inventory — web `modules/inventory/AssetVault.jsx`
- [x] Inventory list (from More): search, status / deal / type filters, photo cards
- [x] Property details: gallery, terms in lakh/crore, key facts, amenities, owner & key contacts, share link, maps
- [x] Add property: essentials (photos, layouts, documents stay on web); channel-partner adds go to approval

### M8 Schedule — web `modules/calendar/MasterSchedule.jsx`
- [x] Month calendar of follow-ups and tasks due (one month fetched at a time), day agenda, mark follow-up done, reschedule

### M9 Team chat — web `modules/chat/TeamChat.jsx`
- [x] Chats list with unread counts, live reordering on new messages
- [x] Conversation: bubbles, day dividers, shared-property cards, sent/delivered/seen ticks, optimistic send with retry, older history on scroll, live incoming messages
- [x] New chat from the contact list
- [ ] Not yet: groups/broadcasts creation, attachments, voice/video calls, typing indicator

### Later modules (same process, in this order)
- [ ] M10 Reports, performance, leaderboard
- [ ] M11 Admin — team, users, roles & page access, settings
- [ ] M12 Finance & salary
- [ ] M13 Coworking — booking board, clients
- [ ] M14 Field ops / live map
- [ ] Push notifications, realtime alerts
- [x] Replace the old `mobile/` app with this one
- [ ] Release: EAS build
