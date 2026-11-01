# Jyotisha AI Admin Panel

The admin panel lets you change the app's settings from a web page instead of editing the server's `.env` file and rebuilding. It lives at `https://YOUR-DOMAIN/admin`. This document describes what it does, how it is protected, and how it connects to the app and the Android build.

## Executive summary

- One password-protected page, `/admin`, for the person who runs the app. There are no user accounts and no database; the app stores no personal data, and the panel keeps it that way.
- Every setting that used to live in `.env` can be changed here, and changes take effect at once with no restart and no new Android release: ad switches and ad unit IDs, free AI questions, AI provider and API keys, request limits, announcement and maintenance notices, contact e-mail and developer name.
- The Android app asks the server for its ad and notice settings each time it opens (`/api/birth-readiness`), so a panel change reaches phones the next time the app starts.
- Secrets are write-only: after saving, an API key is shown only as its last four characters.
- Every change is written to a change log (who, when, which setting, old value, new value, with keys masked).
- The panel is **off** unless `ADMIN_PASSWORD` (12 or more characters) is set on the server.

## Authentication and layout

- Sign-in is one shared admin password (`ADMIN_PASSWORD` in the server `.env`). There is no username.
- A successful sign-in sets a signed cookie, valid for 2 hours: `HttpOnly`, `SameSite=Strict`, and `Secure` behind HTTPS. Changing the password signs everyone out.
- The page has a header with **Sign out**, and tabs, one per group of settings, plus a Dashboard and a Change log.
- Phone-friendly: the tabs wrap and every field is a full-width control.

## Route map

| Area | Route | Purpose |
| --- | --- | --- |
| Page | `/admin` | The panel (sign-in form, then tabs). Marked `noindex`. |
| Script | `/admin.js` | The panel's front end. |
| Sign in | `POST /api/admin/login` | Checks the password and sets the session cookie. |
| Sign out | `POST /api/admin/logout` | Clears the cookie. |
| State | `GET /api/admin/state` | Settings (secrets masked), change log, daily counters, live status. |
| Save | `POST /api/admin/save` | Saves or reverts one or more settings, all or nothing. |
| AI check | `POST /api/admin/test-ai` | Sends one tiny question to the chosen AI provider to confirm the key works. |

All of these return 404 when no admin password is set.

## Modules (tabs)

### Dashboard
- Tiles: visitors today, page opens, AI questions, APK downloads.
- "What the app is told right now": whether Android ads, the rewarded ads, the full-screen ad, website ads, the AI chat and a notice are on, and whether the ads are Google test ads or your own units.
- A **Test the AI connection** button.
- A 14-day table of daily totals (visitors, opens, Panchang, calendar, Kundli, AI questions, APK downloads, blocked requests).
- Counters are totals only. "Visitors" is the count of different one-way codes seen that day; the code is built from the network address with a random salt that is kept only in memory, and is discarded at the end of the day. No address, birth detail or question is stored.

### Android app ads
- Master switch, always-test-ads switch, banner / rewarded / interstitial unit IDs (checked against the AdMob format), the rewarded "generate a Kundli" ad, the rewarded "more AI questions" ad, free questions per day, and extra questions per ad.
- Empty unit IDs use Google's test ads, so nothing can be broken by a half-finished setup.

### Website ads
- The Google AdSense publisher ID. Empty means no ads on the website (the installed app never loads AdSense).

### AI chat
- Provider (automatic, Gemini, Anthropic, or offline answers only), model names, and the limits: AI questions per day for the whole site (protects your bill), per visitor per day, and per visitor per minute.

### API keys
- Gemini and Anthropic keys. Write-only; the stored value is never sent back to the browser, to the change log, or to the page.

### Announcement
- A banner shown at the top of the app and website, an optional https link, an optional "hide after" date, and a separate maintenance notice that takes priority.

### Site details
- Support e-mail (privacy page and the "report this answer" link) and the developer name on the privacy page.

### Change log
- The last 60 changes, newest first: time (UTC), setting, set or revert, old value, new value.

## How the modules connect

```
Admin panel (/admin)
   │  save
   ▼
admin-data/settings.json  ──►  value precedence:  panel  >  server .env  >  built-in default
   │                                   │
   │                                   ├─► /api/birth-readiness ──► Android app + website
   │                                   │      (ads, free questions, notice, contact)
   │                                   ├─► AI assistant (provider, model, keys)
   │                                   └─► request limits (live, no restart)
   ▼
admin-data/audit.jsonl   (change log)       admin-data/stats.json   (daily totals)
```

Each setting keeps the name of its environment variable (`JYOTISHA_APP_ADS`, `GEMINI_API_KEY`, and so on). The `.env` file is still the starting point; the panel simply overrides it. **Use server value** on a field removes the override and hands control back to `.env`.

## Where the data lives

- `admin-data/` (inside the container: `/data`, a Docker named volume called `admin_data`), so it survives restarts and rebuilds. Files are written with owner-only permissions.
- Back it up if you care about the change log and saved keys; losing it only means the app falls back to `.env`.

## Technology and security observations

| Control | Behavior |
| --- | --- |
| Off by default | No admin password, no panel: every admin route answers 404. A password shorter than 12 characters also keeps it off. |
| Password check | Constant-time comparison of hashes; wrong guesses are delayed and each address gets a limited number of attempts per 15 minutes (then 429). |
| Session | Signed token, 2 hours, `HttpOnly`, `SameSite=Strict`, `Secure` over HTTPS; tied to the password. |
| CSRF | Changes are POST with JSON, need a custom `X-Admin` header, and pass the same-origin check; the cookie is `SameSite=Strict`. |
| Framing and caching | `X-Frame-Options: DENY`, `Cache-Control: no-store`, `noindex` on every admin response. |
| Secrets | Write-only, shown as the last four characters, never in the change log, stored in a file readable only by the app user. |
| Validation | Every value is checked against its type and format (ad unit IDs, numbers within range, https links, real dates) before anything is saved; one bad value saves nothing. |
| Audit trail | Each change is recorded with time, setting, old and new value (keys masked). |
| Privacy | Counters are daily totals; no personal data, no per-user records. |
| Transport | The site is HTTPS behind Caddy with HSTS; the panel adds nothing to the public pages' content-security policy. |

Limitations to know about: there is one shared password (no per-person accounts or two-factor sign-in), and the key file on the server is not encrypted at rest, so protect server access and take care of backups. If you later add more admins, move sign-in to per-person accounts with a second factor.

## Switching it on

1. In the server `.env` add a line `ADMIN_PASSWORD=` followed by a long password of your own (never share it).
2. Update the server with the usual command (`git pull`, then `docker compose -f deploy/digitalocean/docker-compose.yml --env-file .env up -d --build`).
3. Open `https://YOUR-DOMAIN/admin`, sign in, and use the tabs.

After that the `.env` file only needs to hold `DOMAIN`, `CONTACT_EMAIL` and `ADMIN_PASSWORD`; everything else is managed in the panel.
