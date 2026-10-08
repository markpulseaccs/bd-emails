@AGENTS.md

# bd-emails — context for Claude Code

Single Next.js pages-router API route: `pages/api/bd-emails.js`. Deployed on Vercel as **bd-emails** (`https://bd-emails.vercel.app/api/bd-emails`). Sends Mark Leighton's BD planning emails via Resend (from/to mark@pulse-accountants.co.uk; `BD_WEEKLY_CC` env var adds recipients to the Monday email).

Trigger: cron-job.org, daily 07:30 UK time, `POST {"type":"auto"}` with `Authorization: Bearer <CRON_SECRET>`. `auto` = daily every day, plus weekly on Mondays and monthly (with a KPI snapshot) on the 1st. Must respond inside 30s (cron-job.org timeout) — currently ~13s.

Data: everything comes from the pulse-dashboard project, not from Socket directly. `loadBdConfig()` calls `https://pulse-dashboard-7zua.vercel.app/api/cron/bd-config` (Bearer `CALENDAR_FEED_TOKEN`) and receives the legacy bank, targets, resolved kickstarts, first-service results and a slim Socket snapshot; calendar comes from `/api/cron/calendar-feed`. The hardcoded `LEGACY_CLIENTS`/`TARGETS` at the top are only fallbacks. KPI logic mirrors `src/lib/bd-pipeline.ts` in pulse-dashboard — keep the two in step (same conversion definition: % of new-business proposals signed within `conversionDays` of sending).

Emails: Pulse branding (navy #1d1a4d, gradient bar, logo at pulse-dashboard-7zua.vercel.app/pulse-logo.png), UK dates. Daily = today's calendar, generated actions, awaiting-kickstart, pending proposals, KPI tracker MTD. Weekly = last-7-days, signed list, week's meetings, kickstarts, KPI tracker, legacy bank, housekeeping. Monthly = previous month's KPIs vs targets, signed list, November gate checklist.

Test: `Invoke-WebRequest -Uri https://bd-emails.vercel.app/api/bd-emails -Method POST -Headers @{Authorization="Bearer <CRON_SECRET>";"Content-Type"="application/json"} -Body '{"type":"daily"}'`. Owner works in Windows PowerShell — note it truncates pasted lines at ~1,000 chars.
