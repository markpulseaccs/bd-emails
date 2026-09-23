import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = "Mark Leighton <mark@pulse-accountants.co.uk>";
const EMAIL_TO = "mark@pulse-accountants.co.uk";
const SOCKET_API_KEY = process.env.SOCKET_API_KEY;
const MS_ACCESS_TOKEN = process.env.MS_ACCESS_TOKEN;

// Fetch proposals from Socket API
async function fetchSocketProposals() {
  try {
    const response = await fetch("https://app.usesocket.com/api/v1/proposals", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${SOCKET_API_KEY}`,
      "Accept": "application/json",
      },
    });

   if (!response.ok) {
      console.error("Socket API error:", response.status);
      return { pending: 0, signed: 0, proposals: [] };
    }

    const proposals = await response.json();
    const pendingStatuses = ["pending", "sent", "in_review"];
    const signedStatuses = ["won", "won_client", "won_internal", "active"];
    const pending = proposals.filter(p => pendingStatuses.includes(p.status)).length;
    const signed = proposals.filter(p => signedStatuses.includes(p.status)).length;

    return { pending, signed, proposals };
  } catch (err) {
    console.error("Socket fetch error:", err);
    return { pending: 0, signed: 0, proposals: [] };
  }
}

// Fetch Outlook calendar events
async function fetchOutlookCalendar(daysAhead = 1) {
  try {
    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startDate.toISOString()}&endDateTime=${endDate.toISOString()}`,
      {
        headers: {
          "Authorization": `Bearer ${MS_ACCESS_TOKEN}`,
        },
      }
    );

    const data = await response.json();
    return data.value || [];
  } catch (err) {
    console.error("Outlook fetch error:", err);
    return [];
  }
}

// Build daily email with live data
async function buildDailyEmail() {
  const today = new Date().toISOString().split("T")[0];
  const [socket, events] = await Promise.all([
    fetchSocketProposals(),
    fetchOutlookCalendar(1),
  ]);

  const eventsList = events
    .map(e => `<li>${e.start.dateTime.split("T")[1].slice(0, 5)} — ${e.subject}</li>`)
    .join("");

  return {
    subject: `Daily Plan — ${today}`,
    html: `
      <h2>Daily Plan — ${today}</h2>
      
      <h3>📊 TODAY'S METRICS</h3>
      <ul>
        <li>Proposals pending: ${socket.pending}</li>
        <li>Proposals signed: ${socket.signed}</li>
      </ul>
      
      <h3>📞 TODAY'S CALLS</h3>
      <ul>${eventsList || "<li>No meetings scheduled</li>"}</ul>
      
      <h3>🔴 BLOCKERS</h3>
      <ul>
        <li>KPI numbers still blank (waiting for Matt call)</li>
        <li>Crib sheet not received (need to ask in call)</li>
      </ul>
      
      <h3>📌 PRIORITY (TODAY)</h3>
      <ol>
        <li>Call Matt — lock KPI targets</li>
        <li>Send proposals (${socket.pending} pending)</li>
        <li>Email Matt requesting crib sheet</li>
      </ol>
      
      <hr />
      <p><small>Daily digest • Manage your time • Hit your targets</small></p>
    `,
  };
}

// Build weekly email
async function buildWeeklyEmail() {
  const [socket, events] = await Promise.all([
    fetchSocketProposals(),
    fetchOutlookCalendar(7),
  ]);

  const eventsList = events
    .slice(0, 10)
    .map(e => `<li>${e.start.dateTime.split("T")[0]} — ${e.subject}</li>`)
    .join("");

  return {
    subject: `Weekly Plan — w/c ${new Date().toISOString().split("T")[0]}`,
    html: `
      <h2>Weekly Plan</h2>
      
      <h3>📊 PIPELINE STATUS</h3>
      <ul>
        <li>Pending proposals: ${socket.pending}</li>
        <li>Signed this week: ${socket.signed}</li>
      </ul>
      
      <h3>📅 THIS WEEK'S MEETINGS</h3>
      <ul>${eventsList || "<li>No meetings scheduled</li>"}</ul>
      
      <h3>📋 ACTIONS</h3>
      <ul>
        <li><strong>Monday 09:00:</strong> Send pipeline summary to Matt + Rachael</li>
        <li><strong>Wed/Thu:</strong> Outreach block (legacy clients)</li>
        <li><strong>Fri 17:00:</strong> Prep for next week</li>
      </ul>
      
      <hr />
      <p><small>Weekly digest • Track pipeline • Maintain momentum</small></p>
    `,
  };
}

// Build monthly email
async function buildMonthlyEmail() {
  const socket = await fetchSocketProposals();

  return {
    subject: `KPI Review — ${new Date().toLocaleString("en-GB", { month: "long", year: "numeric" })}`,
    html: `
      <h2>KPI Review</h2>
      
      <h3>📊 PROPOSAL METRICS</h3>
      <ul>
        <li>Pending: ${socket.pending}</li>
        <li>Signed: ${socket.signed}</li>
      </ul>
      
      <h3>📅 GATE REVIEW REMINDER</h3>
      <p>In November, Matt will review whether this role works "for you and for the business." Your KPI evidence is your proof point.</p>
      
      <hr />
      <p><small>Monthly KPI review • Track progress • Deliver to targets</small></p>
    `,
  };
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (!authHeader || authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  let emailType = "daily";
  try {
    const body = req.body;
    emailType = body.type || "daily";
  } catch (e) {
    // ignore
  }

  let email;
  try {
    switch (emailType) {
      case "weekly":
        email = await buildWeeklyEmail();
        break;
      case "monthly":
        email = await buildMonthlyEmail();
        break;
      case "daily":
      default:
        email = await buildDailyEmail();
        break;
    }
  } catch (err) {
    console.error("Email build error:", err);
    return res.status(500).json({ error: "Failed to build email" });
  }

  try {
    const { data, error } = await resend.emails.send({
      from: EMAIL_FROM,
      to: [EMAIL_TO],
      subject: email.subject,
      html: email.html,
    });

    if (error) {
      console.error("Resend error:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({
      success: true,
      type: emailType,
      messageId: data?.id,
      sentTo: EMAIL_TO,
    });
  } catch (err) {
    console.error("Send error:", err);
    return res.status(500).json({ error: err.message });
  }
}
