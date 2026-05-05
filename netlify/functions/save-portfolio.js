const SUPABASE_URL = process.env.SUPABASE_URL || "https://nelfehxjyrphnlkyjurl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbGZlaHhqeXJwaG5sa3lqdXJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTIzODksImV4cCI6MjA5MzQ4ODM4OX0.haowQ9FePugPJQ1cRWviUxf_FlCYq5B7XbHwmZ53u_c";

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Metodo non consentito" }) };

  const baseUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const authHeader = event.headers.authorization || "";

  try {
    const { user_id, data } = JSON.parse(event.body);
    if (!user_id || !data) return { statusCode: 400, headers, body: JSON.stringify({ error: "user_id e data obbligatori" }) };

    const reqHeaders = {
      "Content-Type": "application/json",
      "apikey": SUPABASE_KEY,
      "Authorization": authHeader || `Bearer ${SUPABASE_KEY}`,
      "Prefer": "return=minimal",
    };

    // PATCH first (update existing)
    const patchRes = await fetch(
      `${baseUrl}/rest/v1/portfolios?user_id=eq.${encodeURIComponent(user_id)}`,
      { method: "PATCH", headers: reqHeaders, body: JSON.stringify({ data, updated_at: new Date().toISOString() }) }
    );
    if (patchRes.ok) {
      const range = patchRes.headers.get("content-range") || "";
      if (!range.endsWith("/0")) return { statusCode: 200, headers, body: JSON.stringify({ ok: true, method: "patch" }) };
    }

    // INSERT new record
    const postRes = await fetch(`${baseUrl}/rest/v1/portfolios`, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify({ user_id, data, updated_at: new Date().toISOString() }),
    });
    if (!postRes.ok) {
      const errText = await postRes.text();
      throw new Error(`Supabase ${postRes.status}: ${errText}`);
    }
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, method: "insert" }) };
  } catch (err) {
    console.error("save-portfolio error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
