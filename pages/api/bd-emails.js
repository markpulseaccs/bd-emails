// Env vars
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;
const SOCKET_API_KEY = process.env.SOCKET_API_KEY;
const MS_TENANT_ID = process.env.MS_TENANT_ID;
const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;

// Socket API: get proposals
async function getSocketProposals() {
  try {
    const response = await fetch("https://app.usesocket.com/api/v1/proposals", {
      headers: { Authorization: `Bearer ${SOCKET_API_KEY}` },
    });
    const data = await response.json();
    const pending = data.data?.filter(p => ["pending", "sent", "in_review"].includes(p.status)) || [];
    const signed = data.data?.filter(p => ["won", "won_client", "won_internal", "active"].includes(p.status)) || [];
    return { pending: pending.length, signed: signed.length };
  } catch (err) {
    console.error("Socket error:", err.message);
    return { pending: 0, signed: 0 };
  }
}

// Microsoft Graph token
async function getMicrosoftAccessToken() {
  try {
    console.log("Starting MS auth with tenant:", MS_TENANT_ID?.substring(0, 8));
    const response = await fetch(
      `https://login.microsoftonline.com/${MS_TENANT_ID}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: MS_CLIENT_ID,
          client_secret: MS_CLIENT_SECRET,
          scope: "https://graph.microsoft.com/.default",
          grant_type: "client_credentials",
        }).toString(),
      }
    );
    const data = await response.json();
    console.log("MS response status:", response.status);
    console.log("MS response data:", JSON.stringify(data));
    return data.access_token || null;
  } catch (err) {
    console.error("MS auth error:", err.message);
    return null;
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
  const { pending, signed } = await getSocketProposals();
  const now = new Date().toLocaleString("en-GB");
  return {
    subject: `BD Daily Priorities — ${new Date().toLocaleDateString("en-GB")}`,
    html: `
<h2>Daily Priorities</h2>
<p><strong>Generated:</strong> ${now}</p>
<h3>Pipeline</h3>
<ul>
<li><strong>Pending proposals:</strong> ${pending}</li>
<li><strong>Signed clients:</strong> ${signed}</li>
</ul>
<h3>Today's Focus</h3>
<ul>
<li>Check for new proposal activity</li>
<li>Follow up on stalled proposals</li>
<li>Kickstart coordination calls</li>
</ul>
    `,
  };
}

// Build weekly email
async function buildWeeklyEmail() {
  const { pending, signed } = await getSocketProposals();
  const now = new Date().toLocaleString("en-GB");
  const weekOf = new Date(new Date().setDate(new Date().getDate() - new Date().getDay() + 1)).toLocaleDateString("en-GB");
  return {
    subject: `BD Weekly Summary — Week of ${weekOf}`,
    html: `
<h2>Weekly Summary</h2>
<p><strong>Generated:</strong> ${now}</p>
<h3>Discovery & Proposals</h3>
<ul>
<li><strong>Pending:</strong> ${pending}</li>
<li><strong>Signed:</strong> ${signed}</li>
</ul>
<h3>KPI Progress</h3>
<ul>
<li>Proposal → signature conversion: 60%+</li>
<li>Signature → kickstart: within 10 working days</li>
<li>Kickstart → first service: within 30 days</li>
</ul>
<h3>This Week</h3>
<ul>
<li>Legacy client outreach</li>
<li>Proposal follow-ups</li>
<li>Kickstart coordination</li>
</ul>
    `,
  };
}

// Build monthly email
async function buildMonthlyEmail() {
  const { pending, signed } = await getSocketProposals();
  const now = new Date().toLocaleString("en-GB");
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  return {
    subject: `BD KPI Review — ${month}`,
    html: `
<h2>Monthly KPI Review</h2>
<p><strong>Generated:</strong> ${now}</p>
<h3>Current Metrics</h3>
<ul>
<li><strong>Pending proposals:</strong> ${pending}</li>
<li><strong>Signed clients:</strong> ${signed}</li>
</ul>
<h3>Legacy Client Pipeline</h3>
<p>Total value: £326k</p>
<p>Gills/Sonny (£60k), Whitehead (£60k), Tom Byron (£50k), Tony Maughan (£40k), Craig Lynch (£40k), PB Pub Solutions (£25k), Marc Hardy (£10k), Chaser (£8k), Posithread (£6k), OctoPos (£5.4k), PLRB (£5.1k), Ivy Stockton (£5.8k), Bishop Auckland (£3.84k), Galaxee (£2.94k), Amanda Scrimshaw (£2.4k), Olo Marketing (£1.8k)</p>
<h3>November Gate Review</h3>
<ul>
<li>BD repositioning progress</li>
<li>KPI achievement vs targets</li>
<li>Legacy client contact completion</li>
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