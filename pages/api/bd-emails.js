// Env vars
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const SOCKET_API_KEY = process.env.SOCKET_API_KEY;
const MS_TENANT_ID = process.env.MS_TENANT_ID;
const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;

// Legacy clients to track
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

// Socket API: get detailed proposal data
async function getSocketProposals() {
  try {
    const response = await fetch("https://app.usesocket.com/api/v1/proposals", {
      headers: { Authorization: `Bearer ${SOCKET_API_KEY}` },
    });
    const data = await response.json();
    const proposals = data.data || [];
    
    // Categorize by stage
    const discovery = proposals.filter(p => p.status === "pending" || p.status === "sent");
    const review = proposals.filter(p => p.status === "in_review");
    const signed = proposals.filter(p => ["won", "won_client", "won_internal"].includes(p.status));
    const active = proposals.filter(p => p.status === "active");
    
    // Find stalled (in review >14 days ago)
    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const stalled = review.filter(p => new Date(p.created_at) < twoWeeksAgo);
    
    return {
      discovery: discovery.length,
      review: review.length,
      signed: signed.length,
      active: active.length,
      stalled: stalled.length,
      total: proposals.length,
      proposalsByStatus: { discovery, review, signed, active, stalled }
    };
  } catch (err) {
    console.error("Socket error:", err.message);
    return { discovery: 0, review: 0, signed: 0, active: 0, stalled: 0, total: 0 };
  }
}

// Send email via Resend
async function sendEmail(subject, html) {
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Mark Leighton <mark@pulse-accountants.co.uk>",
        to: "mark@pulse-accountants.co.uk",
        subject,
        html,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error("Resend error:", data);
      return false;
    }
    console.log("Email sent:", data.id);
    return true;
  } catch (err) {
    console.error("Email error:", err.message);
    return false;
  }
}

// Build daily email
async function buildDailyEmail() {
  const { discovery, review, signed, active, stalled } = await getSocketProposals();
  const now = new Date().toLocaleString("en-GB");
  const legacyStatus = LEGACY_CLIENTS.filter(c => c.status === "pending").length;
  
  return {
    subject: `BD Daily Priorities — ${new Date().toLocaleDateString("en-GB")}`,
    html: `
<h2>Daily Priorities — ${new Date().toLocaleDateString("en-GB")}</h2>
<p><strong>Generated:</strong> ${now}</p>

<h3>Pipeline Status</h3>
<ul>
<li><strong>In Discovery:</strong> ${discovery}</li>
<li><strong>In Review:</strong> ${review}</li>
<li><strong>⚠️ Stalled (>14 days):</strong> ${stalled}</li>
<li><strong>Signed (awaiting kickstart):</strong> ${signed}</li>
<li><strong>Active clients:</strong> ${active}</li>
</ul>

<h3>Legacy Client Outreach</h3>
<ul>
<li><strong>Pending contact:</strong> ${legacyStatus}/16</li>
<li><strong>Total value at risk:</strong> £326k</li>
</ul>

<h3>Today's Action Items</h3>
<ul>
<li>Follow up on ${stalled} stalled proposals</li>
<li>Contact ${Math.min(3, legacyStatus)} legacy clients</li>
<li>Check for new discovery inbound</li>
<li>Coordinate kickstart meetings</li>
</ul>
    `,
  };
}

// Build weekly email
async function buildWeeklyEmail() {
  const { discovery, review, signed, active, stalled } = await getSocketProposals();
  const now = new Date().toLocaleString("en-GB");
  const weekOf = new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 1)).toLocaleDateString("en-GB");
  const legacyContacted = LEGACY_CLIENTS.filter(c => c.status !== "pending").length;
  const legacyValue = LEGACY_CLIENTS.reduce((sum, c) => sum + c.value, 0);
  
  return {
    subject: `BD Weekly Summary — Week of ${weekOf}`,
    html: `
<h2>Weekly Summary — Week of ${weekOf}</h2>
<p><strong>Generated:</strong> ${now}</p>

<h3>Pipeline Movement</h3>
<ul>
<li><strong>Discovery:</strong> ${discovery} active conversations</li>
<li><strong>In Review:</strong> ${review} proposals awaiting signature</li>
<li><strong>⚠️ Stalled (>14d):</strong> ${stalled} — <strong>ACTION REQUIRED</strong></li>
<li><strong>Signed:</strong> ${signed} clients ready for kickstart</li>
<li><strong>Active:</strong> ${active} clients in service</li>
</ul>

<h3>Legacy Client Progress</h3>
<ul>
<li><strong>Contacted:</strong> ${legacyContacted}/16</li>
<li><strong>Pipeline value:</strong> £${legacyValue}k</li>
<li><strong>Target:</strong> All by 31 Dec (98 days remaining)</li>
</ul>

<h3>This Week — Focus Areas</h3>
<ul>
<li>Unblock ${stalled} stalled proposals (discovery calls, signature coordination)</li>
<li>Move ${signed} signed clients into kickstart phase</li>
<li>Contact ${5 - legacyContacted} new legacy clients</li>
<li>Track conversion: 60%+ proposal → signature target</li>
</ul>

<h3>KPI Tracking</h3>
<ul>
<li><strong>Proposal → Signature:</strong> ${signed > 0 ? Math.round((signed / (discovery + review + signed)) * 100) : 0}% (Target: 60%+)</li>
<li><strong>Signature → Kickstart:</strong> Within 10 working days</li>
<li><strong>Kickstart → Active:</strong> ${active} clients delivered (Target: 30 days)</li>
</ul>
    `,
  };
}

// Build monthly email
async function buildMonthlyEmail() {
  const { discovery, review, signed, active, stalled, total } = await getSocketProposals();
  const now = new Date().toLocaleString("en-GB");
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  const legacyContacted = LEGACY_CLIENTS.filter(c => c.status !== "pending").length;
  const legacyValue = LEGACY_CLIENTS.reduce((sum, c) => sum + c.value, 0);
  const conversionRate = total > 0 ? Math.round((signed / total) * 100) : 0;
  
  return {
    subject: `BD KPI Review — ${month}`,
    html: `
<h2>Monthly KPI Review — ${month}</h2>
<p><strong>Generated:</strong> ${now}</p>

<h3>Key Metrics</h3>
<ul>
<li><strong>Total Pipeline:</strong> ${total} proposals (${active} active clients)</li>
<li><strong>Conversion Rate:</strong> ${conversionRate}% (Target: 60%+)</li>
<li><strong>Stalled Proposals:</strong> ${stalled} overdue for signature</li>
<li><strong>Ready for Kickstart:</strong> ${signed} signed clients</li>
</ul>

<h3>Onboarding Progress</h3>
<ul>
<li><strong>Discovery → Proposal:</strong> ${discovery} active</li>
<li><strong>Proposal → Signature:</strong> ${review} in review (${stalled} stalled)</li>
<li><strong>Signature → Kickstart:</strong> ${signed} ready (within 10 days target)</li>
<li><strong>Kickstart → Active Service:</strong> ${active} delivering (within 30 days target)</li>
</ul>

<h3>Legacy Client Pipeline (£${legacyValue}k)</h3>
<p><strong>Contacted: ${legacyContacted}/16</strong></p>
<ul>
<li><strong>Active:</strong> Marc Hardy (£10k)</li>
<li><strong>Proposal Sent:</strong> David Whitehead (£60k), OctoPos (£5.4k)</li>
<li><strong>Contacted:</strong> Gills/Sonny (£60k), Tom Byron (£50k), Tony Maughan (£40k)</li>
<li><strong>Pending Contact (£${legacyValue - 231.4}k):</strong> Craig Lynch, PB Pub Solutions, Chaser, Posithread, PLRB, Ivy Stockton, Bishop Auckland, Galaxee, Amanda Scrimshaw, Olo Marketing</li>
</ul>

<h3>November Gate Review Readiness</h3>
<ul>
<li>✓ BD repositioning ownership</li>
<li>✓ Onboarding process visibility (this email)</li>
<li>${conversionRate >= 60 ? "✓" : "⚠️"} Conversion rate 60%+ target (currently ${conversionRate}%)</li>
<li>${legacyContacted === 16 ? "✓" : "⚠️"} Legacy client contact completion (${legacyContacted}/16)</li>
<li>⏳ First service delivery tracking (${active} in progress)</li>
</ul>

<h3>Actions for Next Month</h3>
<ul>
<li>Resolve ${stalled} stalled proposals</li>
<li>Move ${signed} signed clients to active kickstart</li>
<li>Contact remaining ${16 - legacyContacted} legacy clients</li>
<li>Track time-to-kickstart and time-to-active metrics</li>
</ul>
    `,
  };
}

// Main handler
export default async function handler(req, res) {
  // CORS + auth check
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const authHeader = req.headers.authorization;
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { type } = req.body;
  let email;

  try {
    if (type === "daily") {
      email = await buildDailyEmail();
    } else if (type === "weekly") {
      email = await buildWeeklyEmail();
    } else if (type === "monthly") {
      email = await buildMonthlyEmail();
    } else {
      return res.status(400).json({ error: "Invalid type" });
    }

    const sent = await sendEmail(email.subject, email.html);
    return res.status(sent ? 200 : 500).json({ sent, subject: email.subject });
  } catch (err) {
    console.error("Handler error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}