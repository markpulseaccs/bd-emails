import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = "Mark Leighton <mark@pulse-accountants.co.uk>";
const EMAIL_TO = "mark@pulse-accountants.co.uk";

const dailyEmail = {
  subject: `Daily Plan — ${new Date().toISOString().split("T")[0]}`,
  html: `
    <h2>Daily Plan — ${new Date().toISOString().split("T")[0]}</h2>
    
    <h3>🔴 BLOCKERS</h3>
    <ul>
      <li>KPI numbers still blank (waiting for Matt call)</li>
      <li>Crib sheet not received (need to ask in call)</li>
      <li>Whitehead meeting rebooked to Tue 29 Sept (past deadline)</li>
    </ul>
    
    <h3>📌 PRIORITY (TODAY)</h3>
    <ol>
      <li>Call Matt — lock KPI targets (30 min, morning slot)</li>
      <li>Send Sonny Gill proposal</li>
      <li>Email Matt requesting crib sheet</li>
    </ol>
    
    <h3>📞 CALLS/MEETINGS</h3>
    <ul>
      <li>09:00 Team Meeting (30 min)</li>
      <li>10:00 MM / ML — Graeme Coyle (30 min)</li>
      <li>14:30 CSM HSE (60 min)</li>
    </ul>
    
    <h3>📊 PIPELINE MOVES</h3>
    <ul>
      <li>Graeme Coyle (discovery context)</li>
      <li>CSM HSE — check status</li>
      <li>Check new enquiries via Katy</li>
    </ul>
    
    <h3>🚩 ESCALATIONS</h3>
    <p>None yet</p>
    
    <hr />
    <p><small>Daily digest • Manage your time • Hit your targets</small></p>
  `,
};

const weeklyEmail = {
  subject: `Weekly Plan — w/c ${new Date(new Date().setDate(new Date().getDate() - new Date().getDay())).toISOString().split("T")[0]}`,
  html: `
    <h2>Weekly Plan</h2>
    
    <h3>DISCOVERY CALLS BOOKED</h3>
    <p>[Add dates + clients — check calendar]</p>
    
    <h3>PROPOSALS DUE</h3>
    <ul>
      <li>Sonny Gill — due this week</li>
      <li>David Whitehead — due after 29 Sept meeting</li>
    </ul>
    
    <h3>KICKSTARTS SCHEDULED</h3>
    <p>[Check calendar for scheduled kickstart meetings]</p>
    
    <h3>LEGACY CLIENT OUTREACH</h3>
    <p>Running tally: X contacted so far (target: all by 31 Oct)</p>
    
    <h3>📋 ACTIONS</h3>
    <ul>
      <li><strong>Monday 09:00:</strong> Send pipeline summary to Matt + Rachael</li>
      <li><strong>Wed/Thu:</strong> Outreach block (legacy clients + strategic BD)</li>
      <li><strong>Fri 17:00:</strong> Prep for next week (kickstarts booked, hot prospects status)</li>
    </ul>
    
    <h3>🚩 BLOCKERS THIS WEEK</h3>
    <p>[Add any blockers preventing progress]</p>
    
    <hr />
    <p><small>Weekly digest • Track pipeline • Deliver pipeline summary every Monday • Maintain momentum</small></p>
  `,
};

const monthlyEmail = {
  subject: `KPI Review — ${new Date().toLocaleString("en-GB", { month: "long", year: "numeric" })}`,
  html: `
    <h2>KPI Review — ${new Date().toLocaleString("en-GB", { month: "long", year: "numeric" })}</h2>
    
    <h3>SERVICE DISCOVERY MEETINGS</h3>
    <p>Held: [X] | Target: [X per month] | Status: ✓ / ❌</p>
    
    <h3>PROPOSALS ISSUED</h3>
    <p>Issued: [X] | Target: [X per month] | Status: ✓ / ❌</p>
    
    <h3>NEW CLIENTS SIGNED</h3>
    <p>Signed: [X] | Target: [X per month] | Status: ✓ / ❌</p>
    
    <h3>NEW RECURRING FEES (MRR)</h3>
    <p>Signed: £[X] | Target: £[XX per month] | Status: ✓ / ❌</p>
    
    <h3>PROPOSAL → SIGNATURE CONVERSION</h3>
    <p>Rate: [X%] | Target: 60%+ | Status: ✓ / ❌</p>
    
    <h3>LEGACY CLIENT CONVERSIONS</h3>
    <p>Contacted: [X] / Converted: [X] | Target: All contacted by 31 Oct; reviewed to 31 Dec</p>
    
    <h3>NEXT MONTH ACTIONS</h3>
    <p>[What needs to change or improve to hit targets?]</p>
    
    <h3>📅 GATE REVIEW REMINDER</h3>
    <p>In November, Matt will review whether this role works "for you and for the business." Your KPI evidence is your proof point.</p>
    
    <hr />
    <p><small>Monthly KPI review • Track progress • Deliver to targets • Gate review in November</small></p>
  `,
};

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
  switch (emailType) {
    case "weekly":
      email = weeklyEmail;
      break;
    case "monthly":
      email = monthlyEmail;
      break;
    case "daily":
    default:
      email = dailyEmail;
      break;
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