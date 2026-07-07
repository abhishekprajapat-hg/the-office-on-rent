# Single-Client Architecture

This backend is configured for one dedicated client installation.

## Runtime Model

- One active client company record is used as the internal ownership boundary.
- Users, leads, inventory, tasks, attendance, chat, and settings remain scoped by `companyId`.
- Public routes, login, and app navigation do not use tenant slugs, subdomains, or custom-domain tenant matching.
- Platform-level company management, plan management, subscriptions, and tenant analytics are not exposed.

## Bootstrap

Create the client admin and company:

```bash
npm run seed:admin
```

The seed reads these values from `.env`:

- `CLIENT_COMPANY_NAME`
- `CLIENT_COMPANY_SLUG`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`
- `ADMIN_PHONE`

## Compatibility

The `/api/client/saas/tenant/settings` and `/api/client/saas/tenant/meta` endpoints are retained for existing admin settings and Meta Ads screens. In this build, those routes refer to the single client company.
