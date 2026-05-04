const SUPABASE_URL = process.env.SUPABASE_URL || "https://nelfehxjyrphnlkyjurl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbGZlaHhqeXJwaG5sa3lqdXJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTIzODksImV4cCI6MjA5MzQ4ODM4OX0.haowQ9FePugPJQ1cRWviUxf_FlCYq5B7XbHwmZ53u_c";

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Metodo non consentito" }) };

  // Strip trailing slash and /rest/v1 if accidentally included
  const baseUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");

  try {
    const { user_id, data } = JSON.parse(event.body);
    if (!user_id || !data) return { statusCode: 400, headers, body: JSON.stringify({ error: "user_id e data sono obbligatori" }) };

    console.log("Saving to:", `${baseUrl}/rest/v1/portfolios`);

    const res = await fetch(`${baseUrl}/rest/v1/portfolios`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify({
        user_id,
        data,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("Supabase error:", res.status, errText);
      throw new Error(`Supabase ${res.status}: ${errText}`);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("save-portfolio error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
