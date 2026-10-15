# Web → mobile feature parity register

Every capability of the web app (`frontend/`), derived from its routes, its
service layer (`frontend/src/services/*.js` — one exported call per server
capability) and the actions on each page. `[x]` = shipped in the mobile app and
tested; `[ ]` = still to build. Work proceeds top to bottom, one wave at a time,
each feature designed → built → tested (typecheck, unit tests, rendered check,
end-to-end against the local backend).

Phone adaptations are allowed (tables → cards, flyouts → sheets); a feature is
ticked when the *capability* is there, not when the pixels match.

---

## Wave 0 — already shipped
- [x] Sign in / sign out (server revoke), session restore, refresh on 401
- [x] Role-based home dashboard (summary, follow-ups, my tasks, pipeline)
- [x] Leads list: search, status chips, follow-ups due, infinite scroll
- [x] Lead details: call / WhatsApp / email / SMS, stage stepper, follow-up, details, team, activity
- [x] Update lead status + next follow-up + note; add lead
- [x] Tasks: for me / created by me / team, open / in progress / done, quick complete
- [x] Task details: status, priority, checklist toggle, linked lead; new task
- [x] Attendance: check in/out with geofence, breaks, month stats, recent days
- [x] Leave: balance, my requests, apply
- [x] Profile view + edit name/phone, theme, legal links
- [x] Inventory list / details / share link / add property (essentials)
- [x] Schedule: month calendar, day agenda, follow-up done / reschedule
- [x] Team chat: conversations, messages, receipts, live delivery, new direct chat

## Wave 1 — Leads, full depth (web `modules/leads`)
- [x] Edit lead basics (name, phone, email, city, company, project, source, temperature) — `PATCH /leads/:id`
- [x] Requirements tab: inventory type, deal, budget, area, furnishing, locations, commercial/residential specifics
- [x] Transfer / assign lead to a teammate (`/leads/:id/assign`), assignment history
- [x] Linked properties: link, select, remove (`/leads/:id/properties…`)
- [x] Property proposals: build from linked properties, share via WhatsApp, previous proposals _(sent as a WhatsApp message with share links; past proposals are not stored by the server)_
- [x] Lead diary: list, add, edit entries (`/leads/:id/diary`) _(list + add; the web's edit calls a route the backend never had, so edit is not offered)_
- [x] Missing-details checklist
- [x] Site visit details (next site visit, site location) _(visit time on Visit Scheduled; managers pin the site from GPS; a field executive's live position is sent when marking Site Visit, as the server requires)_
- [x] Deal closure: payment details & closure documents when CLOSED/REQUESTED _(enforces the server's rules up front: selected property, brokerage received, reference for non-cash, collection date for part-payments; executives' closings go to admin approval)_
- [~] Status-change requests — the web UI never calls this endpoint; approvals of existing requests come in Wave 3
- [x] Delete lead _(admin delete verified end to end; a manager's request is reviewed in the Wave 3 approvals inbox)_
- [x] Advanced filters: source, assignee, date range, follow-up range, temperature, requirement fields _(temperature isn't filterable server-side (web neither))_
- [x] Pipeline / team views for managers _(exact per-person counts from the server, unassigned queue, multi-select bulk reassign)_
- [x] Lead pool _(on web this is the same GET /leads list; covered by the Leads screen + filters)_
- [x] Bulk upload leads (CSV/XLSX) _(the web parser ported verbatim)_
- [x] Follow-up reminder notifications on the device _(local notifications 10 min early, synced on sign-in/foreground/status change, tap opens the lead; needs a device build to observe)_

## Wave 2 — Tasks, full depth (web `modules/tasks`)
- [x] Edit task (title, description, due, priority, assignee, tags)
- [x] Delete task _(admin deletes; others raise an approval request, as the server requires)_
- [x] Add / edit / delete / tick subtasks (title, note, due date) _(subtasks always belong to the task owner on the server)_
- [x] Comments (add / delete, with files)
- [x] Attachments (add from camera / files, view, delete) — `POST /uploads`
- [x] Assign to me; reassign (edit); activity log
- [x] Team view: workload (busy / balanced / available / no tasks), stats, filters (role; priority and tag on the list; a lead's tasks on the lead), sort, per-person tasks
- [x] Overdue view; task stats (`/tasks/stats`, `/tasks/stats/by-user`)

## Wave 3 — Approvals & notifications (web `modules/admin/AdminNotifications.jsx`)
- [x] Inbox: all / unread / inventory / payments / system, search, date filter _(Approvals: type, waiting / decided, date window, search. Notifications: kind and unread, date window, search)_
- [x] Delete requests: approve / reject / cancel (`deleteRequestService`) _(cancel your own from My requests)_
- [x] Inventory requests: pending (approve / reject), my requests
- [x] Lead status requests and payment requests: approve / reject
- [x] Leave requests: approve / reject (`reviewLeaveRequest`)
- [x] User delete requests: review
- [x] Push notifications on the device (Expo push) + in-app alerts (realtime) _(needs a device build to observe)_

## Wave 4 — Attendance administration (web `modules/attendance`)
- [x] Team day view (`/attendance/daily`): who's in, late, on break, absent _(any past day; filter and search)_
- [x] A member's attendance history (`/attendance/users/:id`)
- [x] Correct a break, start/end a break for someone, set a day's status
- [x] Violations: list, review _(History screen; managers see the team's and record a review or excuse)_
- [x] Policy: shift, grace, half/full day, week-offs, geofence _(Admin → Shifts & rules)_
- [x] Office locations for geofencing _(further offices and who may check in at each; the main office stays in System settings)_
- [x] Leave balances of others

## Wave 5 — Reports, performance, targets (web `modules/reports`, `performance`, `targets`)
- [x] Performance (mine / team / a user) — `performanceService`
- [x] Intelligence reports: pipeline, sources, conversion, monthly trend _(week / month / quarter / year / custom range, closed leads counted when they closed as on the web, transfers, six-month trend, executives, lost reasons, CSV export. The web's lead-aging, project-demand and follow-up-risk sections are never mounted, so they are not ported)_
- [x] Role leaderboard (`getRoleLeaderboard`)
- [x] Targets: my targets, assign hierarchy targets
- [~] Company performance overview (`/leads/performance/overview`) — no web screen calls it
- [x] Manager / production / field dashboards' extra panels _(role homes; field panel under Field ops)_

## Wave 6 — Team & administration (web `modules/admin`, `/settings`)
- [x] Team manager: list users, create user, edit, designation, deactivate/delete (with approval), rebalance executives _(rebalance from Lead pool)_
- [x] User details: KPIs, attendance, leave, tasks, activity _(edit details: contact, business category, reporting manager, department, branch, shift, monthly target; at a glance: attendance this month, tasks, target progress, leads, leave balance; links to full attendance, salary and performance)_
- [x] Page access per user (`/access/users/:id/pages`)
- [x] Custom roles: catalogue, create / edit / delete _(and assigning one from a person's page)_
- [x] Channel-partner inventory access toggle _(with brokerage: flat or percentage, notes)_
- [x] System settings: session timeout, accessibility (high contrast, reduce motion), maintenance _(Settings → Display: colour themes from the web's scales, high contrast, reduce motion, sign out when idle; kept per phone like the web keeps them per browser. Maintenance reset is a browser-storage repair with nothing to repair on a phone)_
- [x] Meta Ads / tenant integration (`saasService`)
- [x] Admin command console (AI assistant, `/assistant`) _(answers from `POST /assistant/ask`, which the web console never calls; "take me to …" moves around the app. Fixed the server's inventory answers, which populated a path the schema doesn't have)_

## Wave 7 — Finance & salary (web `modules/finance`, `salary`)
- [x] Revenue centre / report (`revenueService`) _(this month, last month, 3 / 12 months, financial year, custom range; brokerage, payouts, rental and summary CSVs)_
- [x] Financial core: transactions, entries
- [x] My salary; team salaries; set a salary
- [x] Payroll policy; company deductions; employee deductions & rules
- [x] Billing status (Billstack) — view, retry sync, hand-off _(on a lead and a coworking client)_

## Wave 8 — Inventory depth, contacts, projects (web `modules/inventory`)
- [x] Edit property (all fields), status change, reservation _(adds locality, PIN, map pin, built-up area, deposit, agreement, deal type, GST, ownership, revenue model with enterprise rents, papers checklist; the property ID is always made by the server)_
- [x] Photos, documents, floor plans, video tours (upload) _(floor plans from camera, gallery or PDF; documents from a scan or file; video tour links; listed on the property page)_
- [x] Inventory requests: create / update / delete requests for non-admins; my requests _(plus cancelling your own pending delete requests)_
- [x] Property activity log (admin / manager)
- [~] Bulk upload inventory — the server has `/inventory/bulk` but no web screen uses it
- [x] Owner database & broker database (`/contacts`): list, add, bulk add, identify, blocked leads, delete _(import a CSV or Excel sheet with the web's header matching, template; a broker's number is flagged while typing on the lead forms)_
- [x] Projects: list, details, create, edit, delete _(with a commercial project's office / shop / showroom lists — codes, length × breadth area, facing, status, rates — and photos)_
- [x] Share a property into a chat; share link
- [~] Public shared-inventory page (works without signing in) — it is the web page itself; the app's share links and proposals open it

## Wave 9 — Field operations (web `modules/field`)
- [x] Live location sharing for field executives (`updateMyLiveLocation`)
- [x] Field ops map for managers (`getFieldExecutiveLocations`) _(react-native-maps; Android needs GOOGLE_MAPS_ANDROID_API_KEY at build time, otherwise and on web a drawn map. Positions refresh every 30s. Only real pins are drawn: the web's city-guessed positions are left out of a real map)_
- [x] Field dashboard _(workload per field executive, their task queue, dispatch queue of unassigned leads, quick locate, properties with directions)_

## Wave 10 — Coworking (web `modules/coworking`)
- [x] Booking board: floors, cabins, seats (`/coworking/board`) _(the same board document the web uses: wings and floor-plan views, filters, select cabins → onboard, hold, confirm, drop, renew, move, release, block / upkeep, record payment, activity log, CSV export, undo of your own last change; the logic is a tested port of the web reducer)_
- [x] Clients: list, profile, onboarding with KYC document checklist _(directory derived from the board like web; 4-step onboarding and edit; documents upload to the server. Not ported: the web's browser backup / restore, which rescues data held only in one browser, and reading a date of birth out of an uploaded document)_
- [x] Birthday reminders

## Wave 11 — Chat extras (web `modules/chat`)
- [x] Group chats and lead rooms _(a lead's team room from the lead menu, for its manager, executive and field executive)_
- [x] Broadcasts (send / receive)
- [x] Attachments and media; share a property into a chat _(photos and documents)_
- [x] Delete message (me / everyone), clear chat _(everyone: admins, their own messages, as the server allows)_
- [x] Typing indicator _(and seen receipts sent from an open chat; receipt events now read the server's `{ roomId, message }` shape)_
- [ ] Voice / video calls (WebRTC) — left out by decision
- [~] Escalations — only a dashboard subtitle on the web

## Wave 12 — Platform
- [x] File uploads from camera / library / documents (`uploadService`)
- [x] Profile photo change
- [x] Push notification registration & preferences
- [x] Legal pages in-app _(privacy policy and terms, signed in or out, linked from sign-in and Settings)_
- [x] Proposal PDF (expo-print + expo-sharing) _(validity, special note, photos; share the PDF, or send the same summary on WhatsApp or by email)_
- [x] Leads: CSV export, log a call or visit, timeline filter, remaining-payment follow-up, site visit card
- [x] Schedule: a follow-up for any lead, reschedule, clear, add a note, tick tasks done
- [ ] Release build (EAS) for Play Store / App Store / APK _(app version 2.1.0: this release adds native modules, so it needs a new build; over-the-air updates for 2.1.0 never reach 2.0.0 builds)_
