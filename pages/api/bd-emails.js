import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = "Mark Leighton <mark@pulse-accountants.co.uk>";
const EMAIL_TO = "mark@pulse-accountants.co.uk";
const SOCKET_API_KEY = process.env.SOCKET_API_KEY;
const MS_TENANT_ID = process.env.MS_TENANT_ID;
const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;

// Get Microsoft Graph access token
async function getMicrosoftAccessToken() {
  try {
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
    if (!data.access_token) {
      console.error("No access token:", data);
      return null;
    }
    return data.access_token;
  } catch (err) {
    console.error("Microsoft auth error:", err);
    return null;
  }
}

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
    const accessToken = await getMicrosoftAccessToken();
    if (!accessToken) {
      console.error("Failed to get Microsoft access token");
      return [];
    }

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + daysAhead);

    const response = await fetch(
      `https://graph.microsoft.com/v1.0/me/calendarview?startDateTime=${startDate.toISOString()}&endDateTime=${endDate.toISOString()}`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      console.error("Graph API error:", response.status);
      return [];
    }

    const data = await response.json();
    console.log("Calendar events returned:", data.value?.length || 0);
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