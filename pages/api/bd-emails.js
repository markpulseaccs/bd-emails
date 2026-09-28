import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);
const EMAIL_FROM = "Mark Leighton <mark@pulse-accountants.co.uk>";
const EMAIL_TO = "mark@pulse-accountants.co.uk";
const SOCKET_API_KEY = process.env.SOCKET_API_KEY;
const MS_TENANT_ID = process.env.MS_TENANT_ID;
const MS_CLIENT_ID = process.env.MS_CLIENT_ID;
const MS_CLIENT_SECRET = process.env.MS_CLIENT_SECRET;

async function getMicrosoftAccessToken() {
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
    return data.access_token || null;
  } catch (err) {
    console.error("MS auth error:", err);
    return null;
  }
}

async function fetchSocketProposals() {
  try {
    const response = await fetch("https://app.usesocket.com/api/v1/proposals", {
      method: "GET",
      headers: { "Authorization": `Bearer ${SOCKET_API_KEY}`, "Accept": "application/json" },
    });
    if (!response.ok) return { pending: 0, signed: 0 };
    const proposals = await response.json();
    const pending = proposals.filter(p => ["pending", "sent", "in_review"].includes(p.status)).length;
    const signed = proposals.filter(p => ["won", "won_client", "won_internal", "active"].includes(p.status)).length;
    return { pending, signed };
  } catch (err) {
    console.error("Socket error:", err);
    return { pending: 0, signed: 0 };
  }
}

async function fetchOutlookCalendar(days = 1) {
  try {
    const token = await getMicrosoftAccessToken();
    if (!token) return [];
    const start = new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + days);