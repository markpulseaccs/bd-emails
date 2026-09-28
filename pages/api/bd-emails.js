import { Resend } from "resend";

// Env vars
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const SOCKET_API_KEY = process.env.SOCKET_API_KEY;

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
    const proposals = data.data || [];
    
    const discovery = proposals.filter(p => p.status === "pending" || p.status === "sent");
    const review = proposals.filter(p => p.status === "in_review");
    const signed = proposals.filter(p => ["won", "won_client", "won_internal"].includes(p.status));
    const active = proposals.filter(p => p.status === "active");
    
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const stalled = review.filter(p => new Date(p.created_at) < twoWeeksAgo);
    
    return { discovery: discovery.length, review: review.length, signed: signed.length, active: active.length, stalled: stalled.length, total: proposals.length };
  } catch (err) {
    console.error("Socket error:", err.message);
    return { discovery: 0, review: 0, signed: 0, active: 0, stalled: 0, total: 0 };
  }
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
  const { discovery, review, signed, active, stalled } = await getSocketProposals();
  const legacyStatus = LEGACY_CLIENTS.filter(c => c.status === "pending").length;
  
  const statsHtml = `${statCell("In Discovery", String(discovery), "#1d1a4d")}${statCell("In Review", String(review), "#b45309")}${statCell("Stalled", String(stalled), "#dc2626")}${statCell("Active", String(active), "#047857")}`;
  
  const bodyHtml = `<h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Pipeline Status</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Signed proposals awaiting kickstart: <strong>${signed}</strong></li><li>Proposals in review (⚠️ ${stalled} overdue): <strong>${review}</strong></li><li>New discovery conversations: <strong>${discovery}</strong></li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Legacy Client Outreach</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Pending contact: <strong>${legacyStatus}/16</strong></li><li>Total value at risk: <strong>£326k</strong></li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Today's Actions</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Follow up on ${stalled} stalled proposals</li><li>Contact ${Math.min(3, legacyStatus)} legacy clients</li><li>Coordinate kickstart meetings</li></ul>`;
  
  return buildEmailHtml({ title: "BD Daily Priorities", subtitle: `${new Date().toLocaleDateString("en-GB")}`, logoUrl: "https://pulse-dashboard-7zua.vercel.app/pulse-logo.png", statsHtml, bodyHtml, footerNote: "Source: BD pipeline tracker. Generated automatically." });
}

async function buildWeeklyEmail() {
  const { discovery, review, signed, active, stalled } = await getSocketProposals();
  const legacyContacted = LEGACY_CLIENTS.filter(c => c.status !== "pending").length;
  const conversionRate = discovery + review + signed > 0 ? Math.round((signed / (discovery + review + signed)) * 100) : 0;
  
  const statsHtml = `${statCell("Pipeline", String(discovery + review + signed + active), "#1d1a4d")}${statCell("Conversion %", String(conversionRate) + "%", conversionRate >= 60 ? "#047857" : "#b45309")}${statCell("Legacy Contacted", String(legacyContacted) + "/16", legacyContacted >= 8 ? "#047857" : "#b45309")}${statCell("Stalled", String(stalled), stalled === 0 ? "#047857" : "#dc2626")}`;
  
  const weekOf = new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 1)).toLocaleDateString("en-GB");
  
  const bodyHtml = `<h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Pipeline Movement</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Active discovery: <strong>${discovery}</strong></li><li>Proposals in review: <strong>${review}</strong> (⚠️ ${stalled} stalled >14 days)</li><li>Signed & ready for kickstart: <strong>${signed}</strong></li><li>Active clients delivering: <strong>${active}</strong></li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">KPI Progress</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Proposal → Signature: <strong>${conversionRate}%</strong> (Target: 60%+)</li><li>Signature → Kickstart: Within 10 working days</li><li>Kickstart → Active: ${active} clients progressing (Target: 30 days)</li></ul><h3 style="margin:16px 0 8px; font-size:14px; color:#1d1a4d; border-bottom:2px solid #e2e8f0; padding-bottom:4px;">Legacy Clients</h3><ul style="margin:6px 0; padding-left:20px; font-size:13px; color:#374151; line-height:1.6;"><li>Contacted: <strong>${legacyContacted}/16</strong> (£${LEGACY_CLIENTS.filter(c => c.status !== "pending").reduce((s, c) => s + c.value, 0)}k value)</li><li>Pipeline value: <strong>£326k total</strong></li><li>Target: All contacted by 31 Dec</li></ul>`;
  
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