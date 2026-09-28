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