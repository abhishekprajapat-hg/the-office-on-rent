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
- [ ] Inbox: all / unread / inventory / payments / system, search, date filter
- [ ] Delete requests: approve / reject / cancel (`deleteRequestService`)
- [ ] Inventory requests: pending (approve / reject), my requests
- [ ] Lead status requests and payment requests: approve / reject
- [ ] Leave requests: approve / reject (`reviewLeaveRequest`)
- [ ] User delete requests: review
- [ ] Push notifications on the device (Expo push) + in-app alerts (realtime)

## Wave 4 — Attendance administration (web `modules/attendance`)
- [x] Team day view (`/attendance/daily`): who's in, late, on break, absent _(any past day; filter and search)_
- [x] A member's attendance history (`/attendance/users/:id`)
- [x] Correct a break, start/end a break for someone, set a day's status
- [ ] Violations: list, review
- [ ] Policy: shift, grace, half/full day, week-offs, geofence
- [x] Office locations for geofencing _(further offices and who may check in at each; the main office stays in System settings)_
- [x] Leave balances of others

## Wave 5 — Reports, performance, targets (web `modules/reports`, `performance`, `targets`)
- [x] Performance (mine / team / a user) — `performanceService`
- [ ] Intelligence reports: pipeline, sources, conversion, monthly trend
- [ ] Role leaderboard (`getRoleLeaderboard`)
- [ ] Targets: my targets, assign hierarchy targets
- [ ] Company performance overview (`/leads/performance/overview`)
- [ ] Manager / production / field dashboards' extra panels

## Wave 6 — Team & administration (web `modules/admin`, `/settings`)
- [ ] Team manager: list users, create user, edit, designation, deactivate/delete (with approval), rebalance executives
- [ ] User details: KPIs, attendance, leave, tasks, activity
- [ ] Page access per user (`/access/users/:id/pages`)
- [x] Custom roles: catalogue, create / edit / delete _(and assigning one from a person's page)_
- [ ] Channel-partner inventory access toggle
- [ ] System settings: session timeout, accessibility (high contrast, reduce motion), maintenance
- [ ] Meta Ads / tenant integration (`saasService`)
- [ ] Admin command console (AI assistant, `/assistant`)

## Wave 7 — Finance & salary (web `modules/finance`, `salary`)
- [x] Revenue centre / report (`revenueService`)
- [ ] Financial core: transactions, entries
- [x] My salary; team salaries; set a salary
- [x] Payroll policy; company deductions; employee deductions & rules
- [x] Billing status (Billstack) — view, retry sync, hand-off _(on a lead and a coworking client)_

## Wave 8 — Inventory depth, contacts, projects (web `modules/inventory`)
- [x] Edit property (all fields), status change, reservation _(the fields the add form has; blocked and sold take a lead, sold takes the payment)_
- [ ] Photos, documents, floor plans, video tours (upload)
- [x] Inventory requests: create / update / delete requests for non-admins; my requests _(plus cancelling your own pending delete requests)_
- [x] Property activity log (admin / manager)
- [ ] Bulk upload inventory
- [ ] Owner database & broker database (`/contacts`): list, add, bulk add, identify, blocked leads, delete
- [x] Projects: list, details, create, edit, delete _(unit-by-unit office / shop / showroom lists and photos stay on web)_
- [ ] Public shared-inventory page (works without signing in)

## Wave 9 — Field operations (web `modules/field`)
- [ ] Live location sharing for field executives (`updateMyLiveLocation`)
- [ ] Field ops map for managers (`getFieldExecutiveLocations`)
- [ ] Field dashboard

## Wave 10 — Coworking (web `modules/coworking`)
- [ ] Booking board: floors, cabins, seats (`/coworking/board`)
- [ ] Clients: list, profile, onboarding with KYC document checklist
- [ ] Birthday reminders

## Wave 11 — Chat extras (web `modules/chat`)
- [ ] Group chats and lead rooms
- [ ] Broadcasts (send / receive)
- [ ] Attachments and media; share a property into a chat
- [x] Delete message (me / everyone), clear chat _(everyone: admins, their own messages, as the server allows)_
- [ ] Typing indicator
- [ ] Voice / video calls (WebRTC)
- [ ] Escalations

## Wave 12 — Platform
- [x] File uploads from camera / library / documents (`uploadService`)
- [x] Profile photo change
- [ ] Push notification registration & preferences
- [ ] Legal pages in-app
- [ ] Release build (EAS) for Play Store / App Store / APK
