import { Resend } from "resend";

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const SOCKET_API_KEY = process.env.SOCKET_API_KEY;
const MS_TENANT_ID = process.env.MS_TENANT_ID;
const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const CALENDAR_MAILBOX = "mark@pulse-accountants.co.uk";
const CALENDAR_FEED_URL = process.env.CALENDAR_FEED_URL || "https://pulse-dashboard-7zua.vercel.app/api/cron/calendar-feed";
const CALENDAR_FEED_TOKEN = process.env.CALENDAR_FEED_TOKEN;
const LOGO_URL = "https://pulse-dashboard-7zua.vercel.app/pulse-logo.png";

// ---------------------------------------------------------------------------
// KPI targets — fill in once agreed with Matt. null = "TBC" in the email.
// ---------------------------------------------------------------------------
const TARGETS = {
  discoveryMeetingsPerMonth: null,   // e.g. 12
  proposalsIssuedPerMonth: null,     // e.g. 10
  newClientsPerMonth: null,          // e.g. 6
  mrrSignedPerMonth: null,           // e.g. 5000 (£)
  conversionPct: 60,                 // proposal -> signature
  kickstartWorkingDays: 10,          // signature -> kickstart
  firstServiceDays: 30,              // kickstart -> first service
  legacyDeadline: "2026-10-31",      // all legacy clients contacted by
};

// Legacy client bank (update status as you go: pending | contacted | proposal_sent | active | declined)
const LEGACY_CLIENTS = [
  { name: "Gills/Sonny Gill", value: 60, status: "contacted" },
  { name: "David Whitehead", value: 60, status: "proposal_sent" },
  { name: "Tom Byron", value: 50, status: "contacted" },
  { name: "Tony Maughan", value: 40, status: "contacted" },
  { name: "Craig Lynch", value: 40, status: "pending" },
  { name: "PB Pub Solutions", value: 25, status: "pending" },
  { name: "Marc Hardy", value: 10, status: "active" },
  { name: "Chaser Communications", value: 8, status: "pending" },
  { name: "Posithread/Simon Williamson", value: 6, status: "pending" },
  { name: "OctoPos", value: 5.4, status: "proposal_sent" },
  { name: "PLRB Ltd", value: 5.1, status: "pending" },
  { name: "Ivy Stockton", value: 5.8, status: "pending" },
  { name: "Bishop Auckland Pub Co", value: 3.84, status: "pending" },
  { name: "Galaxee Global", value: 2.94, status: "pending" },
  { name: "Amanda Scrimshaw", value: 2.4, status: "pending" },
  { name: "Olo Marketing", value: 1.8, status: "pending" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const DAY = 24 * 60 * 60 * 1000;
const now = () => new Date();
const startOfMonth = () => { const d = now(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const startOfWeek = () => { const d = now(); const day = (d.getDay() + 6) % 7; const s = new Date(d); s.setDate(d.getDate() - day); s.setHours(0, 0, 0, 0); return s; };
const daysAgo = n => new Date(now().getTime() - n * DAY);
const daysSince = iso => Math.floor((now() - new Date(iso)) / DAY);
const fmtDate = iso => iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
const gbp = n => `£${Math.round(Number(n) || 0).toLocaleString("en-GB")}`;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : 0);
const tgt = v => (v == null ? "TBC" : String(v));

function workingDaysBetween(from, to) {
  let count = 0;
  const d = new Date(from); d.setHours(0, 0, 0, 0);
  const end = new Date(to); end.setHours(0, 0, 0, 0);
  while (d < end) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) count++;
  }
  return count;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

const C = { navy: "#1d1a4d", green: "#047857", amber: "#b45309", red: "#dc2626", grey: "#64748b" };
const ragColor = (ok, warn) => (ok ? C.green : warn ? C.amber : C.red);

function statCell(label, value, color) {
  return `<td align="center" style="padding:8px 6px; background:#f8fafc; border-radius:8px;"><div style="font-size:22px; font-weight:700; color:${color}; line-height:1;">${value}</div><div style="font-size:10px; text-transform:uppercase; color:${C.grey}; margin-top:4px; letter-spacing:0.05em;">${escapeHtml(label)}</div></td>`;
}
function h3(t) {
  return `<h3 style="margin:16px 0 8px; font-size:14px; color:${C.navy}; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">${escapeHtml(t)}</h3>`;
}
function ul(items) {
  return `<ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;">${items.map(i => `<li>${i}</li>`).join("")}</ul>`;
}
function muted(t) {
  return `<p style="font-size:13px; color:${C.grey}; margin:6px 0;">${escapeHtml(t)}</p>`;
}
function table(headers, rows) {
  const th = headers.map(h => `<th style="text-align:${h.right ? "right" : "left"}; padding:5px 8px; font-size:11px; color:${C.grey}; border-bottom:2px solid #e2e8f0;">${escapeHtml(h.label)}</th>`).join("");
  const tr = rows.map(r => `<tr>${r.map((c, i) => `<td style="padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:${c.color || "#374151"}; ${headers[i].right ? "text-align:right;" : ""} ${c.bold ? "font-weight:700;" : ""} ${c.nowrap ? "white-space:nowrap;" : ""}">${c.html ? c.html : escapeHtml(c.text)}</td>`).join("")}</tr>`).join("");
  return `<table cellpadding="0" cellspacing="0" style="width:100%; margin:6px 0; border-collapse:collapse;"><tr>${th}</tr>${tr}</table>`;
}
function kpiRow(label, actual, target, ok, warn) {
  const color = target === "TBC" ? C.navy : ragColor(ok, warn);
  const mark = target === "TBC" ? "" : ok ? " ✓" : warn ? " ⚠️" : " ✗";
  return `<tr><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:13px; color:#374151;">${escapeHtml(label)}</td><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:13px; font-weight:700; color:${color}; text-align:right; white-space:nowrap;">${escapeHtml(actual)}${mark}</td><td style="padding:6px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:${C.grey}; text-align:right; white-space:nowrap;">${escapeHtml(target)}</td></tr>`;
}
function kpiTable(rows) {
  return `<table cellpadding="0" cellspacing="0" style="width:100%; margin:6px 0; border-collapse:collapse;"><tr><th style="text-align:left; padding:5px 8px; font-size:11px; color:${C.grey}; border-bottom:2px solid #e2e8f0;">KPI</th><th style="text-align:right; padding:5px 8px; font-size:11px; color:${C.grey}; border-bottom:2px solid #e2e8f0;">Actual</th><th style="text-align:right; padding:5px 8px; font-size:11px; color:${C.grey}; border-bottom:2px solid #e2e8f0;">Target</th></tr>${rows.join("")}</table>`;
}

function buildEmailHtml(opts) {
  const statsSection = opts.statsHtml ? `<tr><td style="padding:18px 24px;"><table cellpadding="0" cellspacing="0" style="width:100%;"><tr>${opts.statsHtml}</tr></table></td></tr>` : "";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title></head><body style="margin:0; background:#f1f5f9; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><table cellpadding="0" cellspacing="0" style="width:100%; background:#f1f5f9; padding:16px 0;"><tr><td align="center"><table cellpadding="0" cellspacing="0" style="width:680px; max-width:96%; background:#fff; border-radius:12px; overflow:hidden;"><tr><td style="background:${C.navy}; padding:0;"><div style="height:4px; background:linear-gradient(90deg,#2dd4bf 0%,#22d3ee 50%,#e879f9 100%);"></div><div style="padding:18px 24px;"><table cellpadding="0" cellspacing="0" style="width:100%;"><tr><td style="width:48px; vertical-align:middle;"><img src="${LOGO_URL}" alt="Pulse" width="40" height="40" style="display:block; border-radius:8px; border:0;" /></td><td style="vertical-align:middle; padding-left:14px;"><h1 style="margin:0; font-size:18px; color:#fff;">${escapeHtml(opts.title)}</h1><p style="margin:4px 0 0; font-size:12px; color:#a5b4fc;">${escapeHtml(opts.subtitle)}</p></td></tr></table></div></td></tr>${statsSection}<tr><td style="padding:6px 24px 0;">${opts.bodyHtml}</td></tr><tr><td style="padding:10px 24px 4px;"></td></tr><tr><td style="background:#f8fafc; padding:12px 24px; font-size:11px; color:#94a3b8;">${escapeHtml(opts.footerNote)}</td></tr></table></td></tr></table></body></html>`;
}

// ---------------------------------------------------------------------------
// Socket
// ---------------------------------------------------------------------------
const personName = x => {
  if (!x) return "";
  if (typeof x === "string") return x;
  return x.name || x.fullName || x.displayName || [x.firstName, x.lastName].filter(Boolean).join(" ") || x.email || "";
};
const clientName = p => {
  const primary = p.primaryClient || (p.clients || []).find(c => c.isPrimary) || (p.clients || [])[0];
  return (primary && primary.name) || p.title || "Unnamed";
};
const monthly = p => Number(p.recurringPrice || p.price || 0);
const sentDate = p => p.lastSentAt || p.createdAt;

// Socket dates arrive as ISO, "2026-09-24 11:33:34", or "24th September 2026"
function parseSocketDate(v) {
  if (!v) return null;
  let t = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(t)) t = t.replace(" ", "T") + "Z";
  t = t.replace(/(\d+)(st|nd|rd|th)\b/, "$1");
  const d = new Date(t);
  return isNaN(d) ? null : d.toISOString();
}

async function fetchWithRetry(url, opts, tries = 3) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(url, opts);
    if (r.status !== 429 && r.status < 500) return r;
    await new Promise(res => setTimeout(res, 400 * (i + 1)));
  }
  return fetch(url, opts);
}

const WON = ["WON", "WON_CLIENT", "WON_INTERNAL"];
const LOST = ["DECLINED", "REJECTED", "LOST", "EXPIRED", "CANCELLED", "ARCHIVED", "WITHDRAWN"];

async function getSocketData() {
  const empty = { pending: [], won: [], active: [], lost: [], all: [], ownerById: {} };
  if (!SOCKET_API_KEY) { console.error("SOCKET_API_KEY missing"); return empty; }
  try {
    const response = await fetch("https://app.usesocket.com/api/v1/proposals", { headers: { Authorization: `Bearer ${SOCKET_API_KEY}` } });
    if (!response.ok) { console.error("Socket error:", response.status); return empty; }
    const data = await response.json();
    let all = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
    all = all.filter(p => !p.isHistorical);

    const st = p => String(p.status || "").toUpperCase();
    const pending = all.filter(p => ["PENDING", "SENT", "IN_REVIEW"].includes(st(p)));
    const won = all.filter(p => WON.includes(st(p)));
    const active = all.filter(p => st(p) === "ACTIVE");
    const lost = all.filter(p => LOST.includes(st(p)));

    // one-off visibility of any statuses we're not classifying
    const known = new Set(["PENDING", "SENT", "IN_REVIEW", "ACTIVE", "DRAFT", "CLOSED", ...WON, ...LOST]); // CLOSED = completed engagement, not a pipeline outcome
    const other = {};
    all.forEach(p => { const s = st(p); if (!known.has(s)) other[s] = (other[s] || 0) + 1; });
    if (Object.keys(other).length) console.log("Unclassified Socket statuses:", JSON.stringify(other));

    // owner + signature date live on the detail endpoint only — fetch for pending + recently-sent won
    const recentWon = won.filter(p => sentDate(p) && new Date(sentDate(p)) >= daysAgo(120));
    const needDetail = [...pending, ...recentWon];
    const ownerById = {};
    const signedById = {};
    let loggedWon = false;
    const fetchDetail = async p => {
      try {
        const r = await fetchWithRetry(`https://app.usesocket.com/api/v1/proposals/${p.id}`, { headers: { Authorization: `Bearer ${SOCKET_API_KEY}`, Accept: "application/json" } });
        if (!r.ok) { if (!ownerById.__f) { ownerById.__f = 1; console.log("Detail fetch failed:", r.status); } return; }
        const j = await r.json();
        const d = j.data || j;
        ownerById[p.id] = personName(d.creator) || personName(d.owner) || personName(d.assignedTo) || personName(d.assignee) || "";
        const sig = d.signature || {};
        const raw = d.wonDate || d.approvedAt || d.acceptedAt || sig.dateTime || sig.signedAt || sig.acceptedAt || sig.createdAt || sig.date || null;
        const signedAt = parseSocketDate(raw);
        if (signedAt) signedById[p.id] = signedAt;
        if (WON.includes(String(d.status || "").toUpperCase()) && !loggedWon) {
          loggedWon = true;
          console.log("Won detail sample:", JSON.stringify({ n: d.proposalNumber, wonDate: d.wonDate, approvedAt: d.approvedAt, acceptedAt: d.acceptedAt, signature: d.signature, updatedAt: d.updatedAt, actualStart: d.actualStart, plannedStart: d.plannedStart }).substring(0, 600));
        }
      } catch (e) { /* ignore */ }
    };
    for (let i = 0; i < needDetail.length; i += 3) await Promise.all(needDetail.slice(i, i + 3).map(fetchDetail));
    // attach resolved signature date; fall back to updatedAt for won proposals with nothing better
    won.forEach(p => { p._signedAt = signedById[p.id] || p.wonDate || (recentWon.includes(p) ? p.updatedAt : null) || null; });
    console.log(`Socket: ${all.length} live, ${pending.length} pending, ${won.length} won (${recentWon.length} recent), ${active.length} active, ${lost.length} lost; owners ${Object.keys(ownerById).filter(k => k !== "__f" && ownerById[k]).length}/${needDetail.length}, signed dates ${won.filter(p => p._signedAt).length}`);

    return { pending, won, active, lost, all, ownerById };
  } catch (err) {
    console.error("Socket error:", err.message);
    return empty;
  }
}

function computeKpis(sd, events, periodStart, label) {
  const inPeriod = iso => iso && new Date(iso) >= periodStart;
  const owner = p => sd.ownerById[p.id] || "—";

  // 1. discovery / kickstart meetings held (calendar, subject match)
  const isDiscovery = e => /discovery/i.test(e.subject || "");
  const isKickstart = e => /kick\s?-?start|onboard/i.test(e.subject || "");
  const pastEvents = events.filter(e => new Date(e.start.dateTime) < now() && new Date(e.start.dateTime) >= periodStart && !e.isCancelled);
  const discoveryMeetings = pastEvents.filter(isDiscovery);
  const kickstartMeetings = pastEvents.filter(isKickstart);

  // 2. proposals issued + turnaround (created -> sent)
  const issued = sd.all.filter(p => inPeriod(p.lastSentAt));
  const turnarounds = issued.filter(p => p.createdAt && p.lastSentAt).map(p => (new Date(p.lastSentAt) - new Date(p.createdAt)) / DAY);
  const avgTurnaround = turnarounds.length ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length) : null;

  // 3/4. signed in period, new clients, MRR
  const signedAt = p => p._signedAt || p.wonDate || null;
  const signed = sd.won.filter(p => inPeriod(signedAt(p)));
  const newClients = signed.filter(p => p.isNewClient);
  const mrr = signed.reduce((s, p) => s + monthly(p), 0);
  const daysToSign = signed.filter(p => signedAt(p) && sentDate(p)).map(p => (new Date(signedAt(p)) - new Date(sentDate(p))) / DAY);
  const avgDaysToSign = daysToSign.length ? Math.round(daysToSign.reduce((a, b) => a + b, 0) / daysToSign.length) : null;

  // 5. conversion — proposals sent in the last 90 days that have closed either way
  const window = daysAgo(90);
  const closedWon = sd.won.filter(p => sentDate(p) && new Date(sentDate(p)) >= window).length;
  const closedLost = sd.lost.filter(p => sentDate(p) && new Date(sentDate(p)) >= window).length;
  const conversion = closedWon + closedLost > 0 ? pct(closedWon, closedWon + closedLost) : null;

  // 6. signature -> kickstart. Socket's actualStart is the service start date, not the kickstart
  //    meeting, so we look for a calendar event with "kickstart" + the client's name.
  const norm = t => String(t || "").toLowerCase().replace(/\b(ltd|limited|llp|plc|co|company|the|and|&)\b/g, " ").replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 2);
  const kickEvents = events.filter(e => isKickstart(e) && !e.isCancelled);
  const findKickstart = p => {
    const words = norm(clientName(p));
    if (!words.length) return null;
    return kickEvents.find(e => { const subj = norm(e.subject).join(" "); return words.some(w => subj.includes(w)); }) || null;
  };
  const recentWon = sd.won.filter(p => signedAt(p) && new Date(signedAt(p)) >= daysAgo(90));
  const kickstartRows = recentWon.map(p => {
    const ev = findKickstart(p);
    const evDate = ev ? new Date(ev.start.dateTime) : null;
    const held = evDate && evDate < now();
    return { name: clientName(p), owner: owner(p), won: signedAt(p), wd: workingDaysBetween(signedAt(p), now()), monthly: monthly(p), kickstart: evDate, held, wdToKick: evDate ? workingDaysBetween(signedAt(p), evDate) : null };
  });
  const awaitingKickstart = kickstartRows.filter(r => !r.held).sort((a, b) => b.wd - a.wd);
  const kickstartOverdue = awaitingKickstart.filter(r => !r.kickstart && r.wd > TARGETS.kickstartWorkingDays);
  const kickstartedInPeriod = kickstartRows.filter(r => r.held && inPeriod(r.kickstart.toISOString()));
  const kickstartWds = kickstartedInPeriod.map(r => r.wdToKick);
  const avgKickstartWd = kickstartWds.length ? Math.round(kickstartWds.reduce((a, b) => a + b, 0) / kickstartWds.length) : null;

  // 7. kickstart -> first service: watchlist of kickstarts held in the last 30 days (delivery tracked in Karbon)
  const firstServiceWatch = kickstartRows
    .filter(r => r.held && daysSince(r.kickstart.toISOString()) <= TARGETS.firstServiceDays)
    .map(r => ({ name: r.name, started: r.kickstart, days: daysSince(r.kickstart.toISOString()) }))
    .sort((a, b) => b.days - a.days);

  // pending list
  const pendingList = sd.pending
    .map(p => ({ name: clientName(p), owner: owner(p), days: daysSince(sentDate(p)), monthly: monthly(p), oneOff: Number(p.oneOffPrice || 0), alignment: Number(p.alignmentFee || 0) }))
    .sort((a, b) => b.days - a.days);
  const stalled = pendingList.filter(p => p.days > 14);

  // 8. legacy
  const legacyContacted = LEGACY_CLIENTS.filter(c => c.status !== "pending");
  const legacyPending = LEGACY_CLIENTS.filter(c => c.status === "pending");
  const legacyDaysLeft = Math.ceil((new Date(TARGETS.legacyDeadline) - now()) / DAY);

  return { label, discoveryMeetings, kickstartMeetings, issued, avgTurnaround, signed, newClients, mrr, avgDaysToSign, conversion, closedWon, closedLost, awaitingKickstart, kickstartOverdue, avgKickstartWd, firstServiceWatch, pendingList, stalled, legacyContacted, legacyPending, legacyDaysLeft };
}

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------
async function getMicrosoftAccessToken() {
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) return null;
  try {
    const response = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: MS_CLIENT_ID, client_secret: MS_CLIENT_SECRET, scope: "https://graph.microsoft.com/.default", grant_type: "client_credentials" }).toString(),
    });
    const data = await response.json();
    return data.access_token || null;
  } catch (err) { return null; }
}

async function getCalendarEvents(daysAhead = 1, daysBack = 0) {
  if (CALENDAR_FEED_TOKEN) {
    try {
      const res = await fetch(`${CALENDAR_FEED_URL}?days=${daysAhead}&from=${daysBack}&email=${encodeURIComponent(CALENDAR_MAILBOX)}`, { headers: { Authorization: `Bearer ${CALENDAR_FEED_TOKEN}` } });
      if (res.ok) {
        const data = await res.json();
        return (data.value || []).filter(e => !e.isCancelled);
      }
      console.error("Calendar feed error:", res.status, (await res.text()).substring(0, 200));
    } catch (err) { console.error("Calendar feed error:", err.message); }
  }
  try {
    const token = await getMicrosoftAccessToken();
    if (!token) return [];
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - daysBack);
    const end = new Date(); end.setHours(0, 0, 0, 0); end.setDate(end.getDate() + daysAhead);
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(CALENDAR_MAILBOX)}/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$orderby=start/dateTime&$top=250&$select=subject,start,end,location,isAllDay,isCancelled,organizer,attendees`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="Europe/London"' } });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.value || []).filter(e => !e.isCancelled);
  } catch (err) { console.error("Calendar error:", err.message); return []; }
}

function calendarTable(events, showDay) {
  if (!events.length) return muted("No meetings scheduled.");
  const t = iso => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const d = iso => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const headers = [...(showDay ? [{ label: "Day" }] : []), { label: "Time" }, { label: "Meeting" }, { label: "Where" }];
  const rows = events.map(e => [
    ...(showDay ? [{ text: d(e.start.dateTime), color: C.grey, nowrap: true }] : []),
    { text: e.isAllDay ? "All day" : `${t(e.start.dateTime)}–${t(e.end.dateTime)}`, color: C.navy, bold: true, nowrap: true },
    { text: e.subject || "(no subject)" },
    { text: (e.location && e.location.displayName) || "", color: C.grey },
  ]);
  return table(headers, rows);
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------
function kickstartTable(list) {
  if (!list.length) return muted("Nothing awaiting kickstart.");
  return table(
    [{ label: "Client" }, { label: "Owner" }, { label: "Signed" }, { label: "MRR", right: true }, { label: "Kickstart" }, { label: "Working days", right: true }],
    list.map(k => [
      { text: k.name },
      { text: k.owner, color: C.grey },
      { text: fmtDate(k.won), nowrap: true },
      { text: gbp(k.monthly) },
      { text: k.kickstart ? `Booked ${fmtDate(k.kickstart)}` : "Not booked", color: k.kickstart ? C.green : C.red, bold: !k.kickstart, nowrap: true },
      { text: `${k.wd}`, bold: true, color: k.kickstart ? C.green : k.wd > TARGETS.kickstartWorkingDays ? C.red : k.wd > 7 ? C.amber : C.green },
    ])
  );
}
function pendingTable(list, cap) {
  if (!list.length) return muted("No pending proposals.");
  const shown = cap ? list.slice(0, cap) : list;
  const html = table(
    [{ label: "Client" }, { label: "Owner" }, { label: "Value", right: true }, { label: "Age", right: true }],
    shown.map(p => {
      const parts = [];
      if (p.monthly) parts.push(`${gbp(p.monthly)}/mo`);
      if (p.oneOff) parts.push(`${gbp(p.oneOff)} one-off`);
      if (p.alignment) parts.push(`${gbp(p.alignment)} alignment`);
      return [
        { text: p.name },
        { text: p.owner, color: C.grey },
        { text: parts.join(" + ") || "—", nowrap: true },
        { text: `${p.days}d`, bold: true, color: p.days > 30 ? C.red : p.days > 14 ? C.amber : C.green },
      ];
    })
  );
  return html + (cap && list.length > cap ? muted(`…and ${list.length - cap} more.`) : "");
}
function legacyTable() {
  const badge = s => ({ pending: [C.red, "Not contacted"], contacted: [C.amber, "Contacted"], proposal_sent: [C.amber, "Proposal sent"], active: [C.green, "Active"], declined: [C.grey, "Declined"] }[s] || [C.grey, s]);
  return table(
    [{ label: "Client" }, { label: "Value", right: true }, { label: "Status" }],
    LEGACY_CLIENTS.map(c => { const [color, text] = badge(c.status); return [{ text: c.name }, { text: `£${c.value}k`, nowrap: true }, { text, color, bold: true }]; })
  );
}
function kpiSection(k, periodName) {
  const T = TARGETS;
  const rows = [
    kpiRow(`Discovery meetings held (${periodName})`, String(k.discoveryMeetings.length), tgt(T.discoveryMeetingsPerMonth), T.discoveryMeetingsPerMonth == null || k.discoveryMeetings.length >= T.discoveryMeetingsPerMonth, k.discoveryMeetings.length >= (T.discoveryMeetingsPerMonth || 0) * 0.6),
    kpiRow(`Proposals issued (${periodName})`, `${k.issued.length}${k.avgTurnaround != null ? ` · avg ${k.avgTurnaround}d to send` : ""}`, tgt(T.proposalsIssuedPerMonth), T.proposalsIssuedPerMonth == null || k.issued.length >= T.proposalsIssuedPerMonth, k.issued.length >= (T.proposalsIssuedPerMonth || 0) * 0.6),
    kpiRow(`New clients signed (${periodName})`, String(k.newClients.length), tgt(T.newClientsPerMonth), T.newClientsPerMonth == null || k.newClients.length >= T.newClientsPerMonth, k.newClients.length >= (T.newClientsPerMonth || 0) * 0.6),
    kpiRow(`New recurring fees signed (${periodName})`, `${gbp(k.mrr)}/mo`, T.mrrSignedPerMonth == null ? "TBC" : `${gbp(T.mrrSignedPerMonth)}/mo`, T.mrrSignedPerMonth == null || k.mrr >= T.mrrSignedPerMonth, k.mrr >= (T.mrrSignedPerMonth || 0) * 0.6),
    kpiRow("Proposal → signature conversion (90d)", k.conversion == null ? "n/a" : `${k.conversion}% (${k.closedWon}W / ${k.closedLost}L)`, `${T.conversionPct}%+`, k.conversion == null || k.conversion >= T.conversionPct, (k.conversion || 0) >= T.conversionPct - 10),
    kpiRow("Signature → kickstart", `${k.kickstartOverdue.length} overdue of ${k.awaitingKickstart.length}${k.avgKickstartWd != null ? ` · avg ${k.avgKickstartWd} wd` : ""}`, `≤ ${T.kickstartWorkingDays} working days`, k.kickstartOverdue.length === 0, k.kickstartOverdue.length <= 2),
    kpiRow("Kickstart → first service", `${k.firstServiceWatch.length} in first ${T.firstServiceDays}d (track in Karbon)`, `≤ ${T.firstServiceDays} days`, true, true),
    kpiRow("Legacy clients contacted", `${k.legacyContacted.length}/${LEGACY_CLIENTS.length} · ${k.legacyDaysLeft}d left`, `All by ${fmtDate(T.legacyDeadline)}`, k.legacyPending.length === 0, k.legacyContacted.length >= LEGACY_CLIENTS.length * 0.6),
  ];
  return kpiTable(rows);
}
function actionsSection(k, todaysEvents) {
  const items = [];
  const names = list => list.map(x => escapeHtml(x.name)).join(", ");
  if (k.kickstartOverdue.length) items.push(`<strong style="color:${C.red}">Book kickstart</strong> for ${names(k.kickstartOverdue)} — over ${TARGETS.kickstartWorkingDays} working days since signature, nothing in the diary`);
  const unbooked = k.awaitingKickstart.filter(x => !x.kickstart && x.wd <= TARGETS.kickstartWorkingDays);
  if (unbooked.length) items.push(`<strong>Book kickstart</strong> for ${names(unbooked)} — signed recently, not yet in the diary`);
  const fresh = k.pendingList.filter(p => p.days >= 3 && p.days <= 14);
  if (fresh.length) items.push(`<strong>Chase</strong> ${names(fresh)} — proposal sent 3–14 days ago, follow up before it stalls`);
  if (k.stalled.length) items.push(`<strong>Close out</strong> ${k.stalled.length} stalled proposals (&gt;14d) — chase once more or mark declined/expired in Socket so the pipeline reflects live opportunities`);
  if (k.legacyPending.length) items.push(`<strong>Legacy outreach</strong> — ${k.legacyPending.length} not yet contacted, ${k.legacyDaysLeft} days to ${fmtDate(TARGETS.legacyDeadline)}: ${names(k.legacyPending)}`);
  const kickToday = (todaysEvents || []).filter(e => /kick\s?-?start|discovery/i.test(e.subject || ""));
  if (kickToday.length) items.push(`<strong>Today's BD meetings:</strong> ${kickToday.map(e => escapeHtml(e.subject)).join("; ")} — book the kickstart live in the meeting, don't defer`);
  if (!items.length) items.push("Pipeline clean — use the time for discovery outreach.");
  return ul(items);
}

// ---------------------------------------------------------------------------
// Emails
// ---------------------------------------------------------------------------
async function buildDailyEmail() {
  const daysBack = Math.max(Math.floor((now() - startOfMonth()) / DAY) + 1, 60);
  const [sd, events] = await Promise.all([getSocketData(), getCalendarEvents(21, daysBack)]);
  const today = events.filter(e => { const s = new Date(e.start.dateTime); const t0 = new Date(); t0.setHours(0, 0, 0, 0); const t1 = new Date(t0); t1.setDate(t1.getDate() + 1); return s >= t0 && s < t1; });
  const k = computeKpis(sd, events, startOfMonth(), "MTD");

  const statsHtml =
    statCell("Awaiting kickstart", String(k.awaitingKickstart.length), k.kickstartOverdue.length ? C.red : C.navy) +
    statCell("Kickstart overdue", String(k.kickstartOverdue.length), k.kickstartOverdue.length ? C.red : C.green) +
    statCell("Pending proposals", String(k.pendingList.length), C.navy) +
    statCell("Signed MTD", String(k.signed.length), k.signed.length ? C.green : C.amber);

  const bodyHtml =
    h3(`Today's Calendar (${today.length})`) + calendarTable(today, false) +
    h3("Today's Actions") + actionsSection(k, today) +
    h3(`Awaiting Kickstart (${k.awaitingKickstart.length}) — signature → kickstart target ${TARGETS.kickstartWorkingDays} working days`) + kickstartTable(k.awaitingKickstart) +
    h3(`Pending Proposals (${k.pendingList.length}) — oldest first`) + pendingTable(k.pendingList) +
    h3("KPI Tracker — month to date") + kpiSection(k, "MTD");

  return { subject: `BD Daily — ${now().toLocaleDateString("en-GB")}`, html: buildEmailHtml({ title: "BD Daily Priorities", subtitle: now().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" }), statsHtml, bodyHtml, footerNote: "Sources: Socket (proposals), Outlook (calendar). Generated automatically." }) };
}

async function buildWeeklyEmail() {
  const monthBack = Math.floor((now() - startOfMonth()) / DAY) + 1;
  const [sd, events] = await Promise.all([getSocketData(), getCalendarEvents(21, Math.max(monthBack, 60))]);
  const weekEnd = new Date(startOfWeek()); weekEnd.setDate(weekEnd.getDate() + 7);
  const week = events.filter(e => { const s = new Date(e.start.dateTime); return s >= startOfWeek() && s < weekEnd; });
  const kw = computeKpis(sd, events, daysAgo(7), "last 7d");
  const km = computeKpis(sd, events, startOfMonth(), "MTD");

  const statsHtml =
    statCell("Signed last 7d", String(kw.signed.length), kw.signed.length ? C.green : C.amber) +
    statCell("MRR signed 7d", `${gbp(kw.mrr)}`, kw.mrr ? C.green : C.amber) +
    statCell("Conversion 90d", kw.conversion == null ? "n/a" : `${kw.conversion}%`, kw.conversion == null ? C.navy : kw.conversion >= TARGETS.conversionPct ? C.green : C.amber) +
    statCell("Kickstart overdue", String(kw.kickstartOverdue.length), kw.kickstartOverdue.length ? C.red : C.green);

  const bodyHtml =
    h3("Last 7 days") + ul([
      `Discovery meetings held: <strong>${kw.discoveryMeetings.length}</strong> · kickstart meetings: <strong>${kw.kickstartMeetings.length}</strong>`,
      `Proposals issued: <strong>${kw.issued.length}</strong>${kw.avgTurnaround != null ? ` (avg ${kw.avgTurnaround}d from creation to send)` : ""}`,
      `Signed: <strong>${kw.signed.length}</strong> (${kw.newClients.length} new clients, ${gbp(kw.mrr)}/mo recurring)${kw.avgDaysToSign != null ? ` · avg ${kw.avgDaysToSign}d proposal→signature` : ""}`,
      `Kickstarts held: <strong>${kw.kickstartMeetings.length}</strong> · still awaiting kickstart: <strong>${kw.awaitingKickstart.length}</strong> (${kw.kickstartOverdue.length} overdue)`,
    ]) +
    h3(`This Week's Meetings (${week.length})`) + calendarTable(week, true) +
    h3(`Awaiting Kickstart (${km.awaitingKickstart.length})`) + kickstartTable(km.awaitingKickstart) +
    h3("KPI Tracker — month to date") + kpiSection(km, "MTD") +
    h3(`Legacy Client Bank — ${km.legacyContacted.length}/${LEGACY_CLIENTS.length} contacted, ${km.legacyDaysLeft} days to ${fmtDate(TARGETS.legacyDeadline)}`) + legacyTable() +
    h3("Monday housekeeping") + ul([
      "Send pipeline summary to management (forward this email or lift the KPI table)",
      "Update Socket: mark stalled proposals declined/expired, set actualStart on kickstarted clients",
      "Update legacy client statuses in the tracker",
    ]);

  return { subject: `BD Weekly — w/c ${startOfWeek().toLocaleDateString("en-GB")}`, html: buildEmailHtml({ title: "BD Weekly Summary", subtitle: `Week commencing ${startOfWeek().toLocaleDateString("en-GB", { day: "numeric", month: "long" })}`, statsHtml, bodyHtml, footerNote: "Sources: Socket (proposals), Outlook (calendar). Generated automatically." }) };
}

async function buildMonthlyEmail() {
  // runs on the 1st: report the month just finished
  const d = now();
  const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  const daysBack = Math.floor((d - prevStart) / DAY) + 1;
  const [sd, events] = await Promise.all([getSocketData(), getCalendarEvents(21, Math.min(daysBack, 62))]);
  const k = computeKpis(sd, events, prevStart, "month");
  const monthName = prevStart.toLocaleString("en-GB", { month: "long", year: "numeric" });

  const statsHtml =
    statCell("Signed", String(k.signed.length), C.navy) +
    statCell("MRR signed", gbp(k.mrr), C.green) +
    statCell("Conversion 90d", k.conversion == null ? "n/a" : `${k.conversion}%`, k.conversion == null ? C.navy : k.conversion >= TARGETS.conversionPct ? C.green : C.amber) +
    statCell("Active clients", String(sd.active.length), C.navy);

  const bodyHtml =
    h3(`KPI Review — ${monthName}`) + kpiSection(k, "month") +
    h3("Pipeline at month end") + ul([
      `Pending proposals: <strong>${k.pendingList.length}</strong> (${k.stalled.length} stalled &gt;14d)`,
      `Awaiting kickstart: <strong>${k.awaitingKickstart.length}</strong> (${k.kickstartOverdue.length} overdue)`,
      `Active clients: <strong>${sd.active.length}</strong>`,
    ]) +
    h3(`Legacy Client Bank — ${k.legacyContacted.length}/${LEGACY_CLIENTS.length} contacted`) + legacyTable() +
    h3("November gate review — evidence checklist") + ul([
      `${k.conversion != null && k.conversion >= TARGETS.conversionPct ? "✓" : "⚠️"} Conversion ≥ ${TARGETS.conversionPct}% (${k.conversion == null ? "n/a" : k.conversion + "%"})`,
      `${k.kickstartOverdue.length === 0 ? "✓" : "⚠️"} All kickstarts within ${TARGETS.kickstartWorkingDays} working days (${k.kickstartOverdue.length} overdue)`,
      `${k.legacyPending.length === 0 ? "✓" : "⚠️"} Legacy bank fully contacted (${k.legacyContacted.length}/${LEGACY_CLIENTS.length})`,
      `⏳ First-service delivery ≤ ${TARGETS.firstServiceDays}d — evidence from Karbon`,
      `⏳ Pipeline updated weekly — evidence from Monday summaries`,
    ]);

  return { subject: `BD KPI Review — ${monthName}`, html: buildEmailHtml({ title: "BD Monthly KPI Review", subtitle: monthName, statsHtml, bodyHtml, footerNote: "Sources: Socket (proposals), Outlook (calendar). Generated automatically." }) };
}

// ---------------------------------------------------------------------------
// Send + handler
// ---------------------------------------------------------------------------
async function sendEmail(subject, html) {
  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({ from: "Mark Leighton <mark@pulse-accountants.co.uk>", to: "mark@pulse-accountants.co.uk", subject, html });
    if (error) { console.error("Resend error:", error); return false; }
    console.log("Email sent:", data.id);
    return true;
  } catch (err) { console.error("Email error:", err.message); return false; }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "POST only" });
  if (req.headers.authorization !== `Bearer ${CRON_SECRET}`) return res.status(401).json({ error: "Unauthorized" });
  const { type } = req.body || {};
  try {
    // "auto": daily every day, plus weekly on Mondays and monthly on the 1st — one scheduler job covers all three
    let types = [type];
    if (type === "auto") {
      const d = now();
      types = ["daily"];
      if (d.getDay() === 1) types.push("weekly");
      if (d.getDate() === 1) types.push("monthly");
    }
    const builders = { daily: buildDailyEmail, weekly: buildWeeklyEmail, monthly: buildMonthlyEmail };
    if (!types.every(t => builders[t])) return res.status(400).json({ error: "Invalid type" });
    const results = {};
    for (const t of types) {
      const email = await builders[t]();
      results[t] = await sendEmail(email.subject, email.html);
    }
    const ok = Object.values(results).every(Boolean);
    return res.status(ok ? 200 : 500).json({ sent: ok, results });
  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
