import { Resend } from "resend";

// Env vars
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const SOCKET_API_KEY = process.env.SOCKET_API_KEY;
const MS_TENANT_ID = process.env.MS_TENANT_ID;
const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;
const CALENDAR_MAILBOX = "mark@pulse-accountants.co.uk";

// Legacy clients
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

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function statCell(label, value, color) {
  return `<td align="center" style="padding:8px 6px; background:#f8fafc; border-radius:8px;"><div style="font-size:22px; font-weight:700; color:${color}; line-height:1;">${value}</div><div style="font-size:10px; text-transform:uppercase; color:#64748b; margin-top:4px; letter-spacing:0.05em;">${escapeHtml(label)}</div></td>`;
}

function buildEmailHtml(opts) {
  const statsSection = opts.statsHtml ? `<tr><td style="padding:18px 24px;"><table cellpadding="0" cellspacing="0" style="width:100%;"><tr>${opts.statsHtml}</tr></table></td></tr>` : "";
  
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${escapeHtml(opts.title)}</title></head><body style="margin:0; background:#f1f5f9; font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;"><table cellpadding="0" cellspacing="0" style="width:100%; background:#f1f5f9; padding:16px 0;"><tr><td align="center"><table cellpadding="0" cellspacing="0" style="width:680px; max-width:96%; background:#fff; border-radius:12px; overflow:hidden;"><tr><td style="background:#1d1a4d; padding:0;"><div style="height:4px; background:linear-gradient(90deg,#2dd4bf 0%,#22d3ee 50%,#e879f9 100%);"></div><div style="padding:18px 24px;"><table cellpadding="0" cellspacing="0" style="width:100%;"><tr><td style="width:48px; vertical-align:middle;"><img src="${opts.logoUrl}" alt="Pulse" width="40" height="40" style="display:block; border-radius:8px; border:0;" /></td><td style="vertical-align:middle; padding-left:14px;"><h1 style="margin:0; font-size:18px; color:#fff;">${escapeHtml(opts.title)}</h1><p style="margin:4px 0 0; font-size:12px; color:#a5b4fc;">${escapeHtml(opts.subtitle)}</p></td></tr></table></div></td></tr>${statsSection}<tr><td style="padding:6px 24px 0;">${opts.bodyHtml}</td></tr><tr><td style="padding:10px 24px 4px;"></td></tr><tr><td style="background:#f8fafc; padding:12px 24px; font-size:11px; color:#94a3b8;">${escapeHtml(opts.footerNote)}</td></tr></table></td></tr></table></body></html>`;
}

async function getSocketProposals() {
  try {
    const response = await fetch("https://app.usesocket.com/api/v1/proposals", {
      headers: { Authorization: `Bearer ${SOCKET_API_KEY}` },
    });
    const data = await response.json();
    
    let proposals = [];
    if (Array.isArray(data)) {
      proposals = data;
    } else if (data && typeof data === "object") {
      const arrKey = Object.keys(data).find(k => Array.isArray(data[k]));
      proposals = arrKey ? data[arrKey] : [];
    }
    
    
    proposals = proposals.filter(p => !p.isHistorical);

    const discovery = proposals.filter(p => {
      const s = (p.status || "").toUpperCase();
      return s === "PENDING" || s === "SENT";
    });
    const review = proposals.filter(p => (p.status || "").toUpperCase() === "IN_REVIEW");
    const signed = proposals.filter(p => ["WON", "WON_CLIENT", "WON_INTERNAL"].includes((p.status || "").toUpperCase()));
    const active = proposals.filter(p => (p.status || "").toUpperCase() === "ACTIVE");
    
    

    const now = new Date();
    const getDate = p => new Date(p.lastSentAt || p.createdAt || now);
    const getName = p => {
      const primary = p.primaryClient || (p.clients || []).find(c => c.isPrimary) || (p.clients || [])[0];
      return (primary && primary.name) || p.title || "Unnamed";
    };
    const personName = x => {
      if (!x) return "";
      if (typeof x === "string") return x;
      return x.name || x.fullName || x.displayName || [x.firstName, x.lastName].filter(Boolean).join(" ") || x.email || "";
    };
    // Author/owner only exists on the single-proposal endpoint, so fetch detail for each pending proposal in batches.
    const ownerById = {};
    const fetchDetail = async p => {
      try {
        const r = await fetch(`https://app.usesocket.com/api/v1/proposals/${p.id}`, { headers: { Authorization: `Bearer ${SOCKET_API_KEY}` } });
        if (!r.ok) return;
        const j = await r.json();
        const d = j.data || j;
        ownerById[p.id] = personName(d.creator) || personName(d.owner) || personName(d.assignedTo) || personName(d.assignee) || "";
        if (!ownerById[p.id] && !ownerById.__logged) {
          ownerById.__logged = true;
          console.log("Owner unresolved; detail people:", JSON.stringify({ creator: d.creator, owner: d.owner, assignedTo: d.assignedTo }).substring(0, 500));
        }
      } catch (e) { /* ignore */ }
    };
    for (let i = 0; i < discovery.length; i += 10) {
      await Promise.all(discovery.slice(i, i + 10).map(fetchDetail));
    }
    const getOwner = p => ownerById[p.id] || "—";
    const daysOld = p => Math.floor((now - getDate(p)) / (24 * 60 * 60 * 1000));

    const pendingList = discovery
      .map(p => ({ name: getName(p), owner: getOwner(p), days: daysOld(p), monthly: p.recurringPrice || p.price || 0, oneOff: p.oneOffPrice || 0, alignment: p.alignmentFee || 0 }))
      .sort((a, b) => b.days - a.days);

    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const stalled = [...review, ...discovery].filter(p => getDate(p) < twoWeeksAgo);
    const recentlySigned = signed.filter(p => p.wonDate && new Date(p.wonDate) >= thirtyDaysAgo);
    
    return { discovery: discovery.length, review: review.length, signed: recentlySigned.length, signedAllTime: signed.length, active: active.length, stalled: stalled.length, total: proposals.length, pendingList };
  } catch (err) {
    console.error("Socket error:", err.message);
    return { discovery: 0, review: 0, signed: 0, signedAllTime: 0, active: 0, stalled: 0, total: 0, pendingList: [] };
  }
}

function pendingTable(list) {
  if (!list || list.length === 0) return `<p style="font-size:13px; color:#64748b; margin:6px 0;">No pending proposals.</p>`;
  const rows = list.map(p => {
    const color = p.days > 30 ? "#dc2626" : p.days > 14 ? "#b45309" : "#047857";
    const parts = [];
    if (p.monthly) parts.push(`£${Number(p.monthly).toLocaleString("en-GB")}/mo`);
    if (p.oneOff) parts.push(`£${Number(p.oneOff).toLocaleString("en-GB")} one-off`);
    if (p.alignment) parts.push(`£${Number(p.alignment).toLocaleString("en-GB")} alignment`);
    const value = parts.length ? parts.join(" + ") : "—";
    return `<tr><td style="padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#374151;">${escapeHtml(p.name)}</td><td style="padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#64748b;">${escapeHtml(p.owner)}</td><td style="padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#374151; text-align:right;">${value}</td><td style="padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; font-weight:700; color:${color}; text-align:right;">${p.days}d</td></tr>`;
  }).join("");
  return `<table cellpadding="0" cellspacing="0" style="width:100%; margin:6px 0; border-collapse:collapse;"><tr><th style="text-align:left; padding:5px 8px; font-size:11px; color:#64748b; border-bottom:2px solid #e2e8f0;">Client</th><th style="text-align:left; padding:5px 8px; font-size:11px; color:#64748b; border-bottom:2px solid #e2e8f0;">Owner</th><th style="text-align:right; padding:5px 8px; font-size:11px; color:#64748b; border-bottom:2px solid #e2e8f0;">Value</th><th style="text-align:right; padding:5px 8px; font-size:11px; color:#64748b; border-bottom:2px solid #e2e8f0;">Age</th></tr>${rows}</table>`;
}

async function getMicrosoftAccessToken() {
  if (!MS_TENANT_ID || !MS_CLIENT_ID || !MS_CLIENT_SECRET) return null;
  try {
    const response = await fetch(`https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MS_CLIENT_ID,
        client_secret: MS_CLIENT_SECRET,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }).toString(),
    });
    const data = await response.json();
    if (!data.access_token) console.error("MS auth failed:", data.error, data.error_description);
    return data.access_token || null;
  } catch (err) {
    console.error("MS auth error:", err.message);
    return null;
  }
}

async function getCalendarEvents(days = 1) {
  try {
    const token = await getMicrosoftAccessToken();
    if (!token) return [];
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(CALENDAR_MAILBOX)}/calendarView?startDateTime=${start.toISOString()}&endDateTime=${end.toISOString()}&$orderby=start/dateTime&$top=50&$select=subject,start,end,location,isAllDay,isCancelled,organizer`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="Europe/London"' },
    });
    if (!res.ok) {
      const body = await res.text();
      console.error("Graph calendar error:", res.status, body.substring(0, 300));
      return [];
    }
    const data = await res.json();
    return (data.value || []).filter(e => !e.isCancelled);
  } catch (err) {
    console.error("Calendar error:", err.message);
    return [];
  }
}

function calendarTable(events, showDay) {
  if (!events || events.length === 0) return `<p style="font-size:13px; color:#64748b; margin:6px 0;">No meetings scheduled.</p>`;
  const fmtTime = iso => {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  };
  const fmtDay = iso => new Date(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  const rows = events.map(e => {
    const when = e.isAllDay ? "All day" : `${fmtTime(e.start.dateTime)}–${fmtTime(e.end.dateTime)}`;
    const day = showDay ? `<td style="padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#64748b; white-space:nowrap;">${fmtDay(e.start.dateTime)}</td>` : "";
    const loc = e.location && e.location.displayName ? escapeHtml(e.location.displayName) : "";
    return `<tr>${day}<td style="padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#1d1a4d; font-weight:700; white-space:nowrap;">${when}</td><td style="padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#374151;">${escapeHtml(e.subject || "(no subject)")}</td><td style="padding:5px 8px; border-bottom:1px solid #e2e8f0; font-size:12px; color:#64748b;">${loc}</td></tr>`;
  }).join("");
  const dayHead = showDay ? `<th style="text-align:left; padding:5px 8px; font-size:11px; color:#64748b; border-bottom:2px solid #e2e8f0;">Day</th>` : "";
  return `<table cellpadding="0" cellspacing="0" style="width:100%; margin:6px 0; border-collapse:collapse;"><tr>${dayHead}<th style="text-align:left; padding:5px 8px; font-size:11px; color:#64748b; border-bottom:2px solid #e2e8f0;">Time</th><th style="text-align:left; padding:5px 8px; font-size:11px; color:#64748b; border-bottom:2px solid #e2e8f0;">Meeting</th><th style="text-align:left; padding:5px 8px; font-size:11px; color:#64748b; border-bottom:2px solid #e2e8f0;">Where</th></tr>${rows}</table>`;
}

async function sendEmail(subject, html) {
  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: "Mark Leighton <mark@pulse-accountants.co.uk>",
      to: "mark@pulse-accountants.co.uk",
      subject,
      html,
    });
    if (error) {
      console.error("Resend error:", error);
      return false;
    }
    console.log("Email sent:", data.id);
    return true;
  } catch (err) {
    console.error("Email error:", err.message);
    return false;
  }
}

async function buildDailyEmail() {
  const [{ discovery, review, signed, active, stalled, pendingList }, events] = await Promise.all([getSocketProposals(), getCalendarEvents(1)]);
  const legacyStatus = LEGACY_CLIENTS.filter(c => c.status === "pending").length;
  
  const statsHtml = `${statCell("In Discovery", String(discovery), "#1d1a4d")}${statCell("In Review", String(review), "#b45309")}${statCell("Stalled", String(stalled), "#dc2626")}${statCell("Active", String(active), "#047857")}`;
  
  const bodyHtml = `<h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Today's Calendar (${events.length})</h3>${calendarTable(events, false)}<h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Pipeline Status</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Signed in last 30 days (awaiting kickstart): <strong>${signed}</strong></li><li>Proposals in review (⚠️ ${stalled} overdue): <strong>${review}</strong></li><li>New discovery conversations: <strong>${discovery}</strong></li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Pending Proposals (${pendingList.length}) — oldest first</h3>${pendingTable(pendingList)}<h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Legacy Client Outreach</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Pending contact: <strong>${legacyStatus}/16</strong></li><li>Total value at risk: <strong>£326k</strong></li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Today's Actions</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Follow up on ${stalled} stalled proposals</li><li>Contact ${Math.min(3, legacyStatus)} legacy clients</li><li>Coordinate kickstart meetings</li></ul>`;
  
  return buildEmailHtml({ title: "BD Daily Priorities", subtitle: `${new Date().toLocaleDateString("en-GB")}`, logoUrl: "https://pulse-dashboard-7zua.vercel.app/pulse-logo.png", statsHtml, bodyHtml, footerNote: "Source: BD pipeline tracker. Generated automatically." });
}

async function buildWeeklyEmail() {
  const [{ discovery, review, signed, active, stalled }, events] = await Promise.all([getSocketProposals(), getCalendarEvents(7)]);
  const legacyContacted = LEGACY_CLIENTS.filter(c => c.status !== "pending").length;
  const conversionRate = discovery + review + signed > 0 ? Math.round((signed / (discovery + review + signed)) * 100) : 0;
  
  const statsHtml = `${statCell("Pipeline", String(discovery + review + signed + active), "#1d1a4d")}${statCell("Conversion %", String(conversionRate) + "%", conversionRate >= 60 ? "#047857" : "#b45309")}${statCell("Legacy Contacted", String(legacyContacted) + "/16", legacyContacted >= 8 ? "#047857" : "#b45309")}${statCell("Stalled", String(stalled), stalled === 0 ? "#047857" : "#dc2626")}`;
  
  const weekOf = new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 1)).toLocaleDateString("en-GB");
  
  const bodyHtml = `<h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">This Week's Meetings (${events.length})</h3>${calendarTable(events, true)}<h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Pipeline Movement</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Active discovery: <strong>${discovery}</strong></li><li>Proposals in review: <strong>${review}</strong> (⚠️ ${stalled} stalled >14 days)</li><li>Signed & ready for kickstart: <strong>${signed}</strong></li><li>Active clients delivering: <strong>${active}</strong></li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">KPI Progress</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Proposal → Signature: <strong>${conversionRate}%</strong> (Target: 60%+)</li><li>Signature → Kickstart: Within 10 working days</li><li>Kickstart → Active: ${active} clients progressing (Target: 30 days)</li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Legacy Clients</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Contacted: <strong>${legacyContacted}/16</strong> (£${LEGACY_CLIENTS.filter(c => c.status !== "pending").reduce((s, c) => s + c.value, 0)}k value)</li><li>Pipeline value: <strong>£326k total</strong></li><li>Target: All contacted by 31 Dec</li></ul>`;
  
  return buildEmailHtml({ title: "BD Weekly Summary", subtitle: `Week of ${weekOf}`, logoUrl: "https://pulse-dashboard-7zua.vercel.app/pulse-logo.png", statsHtml, bodyHtml, footerNote: "Source: BD pipeline tracker. Generated automatically." });
}

async function buildMonthlyEmail() {
  const { discovery, review, signed, active, stalled, total } = await getSocketProposals();
  const legacyContacted = LEGACY_CLIENTS.filter(c => c.status !== "pending").length;
  const conversionRate = total > 0 ? Math.round((signed / total) * 100) : 0;
  
  const statsHtml = `${statCell("Total Pipeline", String(total), "#1d1a4d")}${statCell("Active Clients", String(active), "#047857")}${statCell("Conversion %", String(conversionRate) + "%", conversionRate >= 60 ? "#047857" : "#b45309")}${statCell("Legacy %", String(legacyContacted) + "/16", legacyContacted >= 8 ? "#047857" : "#b45309")}`;
  
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  
  const bodyHtml = `<h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Onboarding Pipeline</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Discovery → Proposal: <strong>${discovery}</strong> active</li><li>Proposal → Signature: <strong>${review}</strong> in review (${stalled} stalled)</li><li>Signature → Kickstart: <strong>${signed}</strong> ready</li><li>Kickstart → Active Service: <strong>${active}</strong> delivering</li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">KPI Metrics</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Proposal → Signature: <strong>${conversionRate}%</strong> (Target: 60%+) ${conversionRate >= 60 ? "✓" : "⚠️"}</li><li>Signature → Kickstart: Within 10 working days</li><li>Kickstart → Active: ${active} clients (Target: 30 days)</li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Legacy Client Pipeline (£326k)</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Contacted: <strong>${legacyContacted}/16</strong> (${Math.round((legacyContacted / 16) * 100)}%)</li><li>Active/Proposal stage: Marc Hardy, David Whitehead, OctoPos</li><li>Pending: Craig Lynch, PB Pub, Chaser, +8 others</li><li>Target: All by 31 Dec</li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">November Gate Review</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>${conversionRate >= 60 ? "✓" : "⚠️"} Conversion rate 60%+ (${conversionRate}%)</li><li>${legacyContacted === 16 ? "✓" : "⚠️"} Legacy client completion (${legacyContacted}/16)</li><li>⏳ First service delivery tracking (${active} active)</li></ul>`;
  
  return buildEmailHtml({ title: "BD KPI Review", subtitle: month, logoUrl: "https://pulse-dashboard-7zua.vercel.app/pulse-logo.png", statsHtml, bodyHtml, footerNote: "Source: BD pipeline tracker. Generated automatically." });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { type } = req.body;
  let html;

  try {
    if (type === "daily") {
      html = await buildDailyEmail();
    } else if (type === "weekly") {
      html = await buildWeeklyEmail();
    } else if (type === "monthly") {
      html = await buildMonthlyEmail();
    } else {
      return res.status(400).json({ error: "Invalid type" });
    }

    const sent = await sendEmail(
      type === "daily" ? `BD Daily Priorities — ${new Date().toLocaleDateString("en-GB")}` :
      type === "weekly" ? `BD Weekly Summary — Week of ${new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 1)).toLocaleDateString("en-GB")}` :
      `BD KPI Review — ${new Date().toLocaleString("en-GB", { month: "long", year: "numeric" })}`,
      html
    );
    return res.status(sent ? 200 : 500).json({ sent });
  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}
