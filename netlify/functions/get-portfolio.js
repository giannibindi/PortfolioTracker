const SUPABASE_URL = process.env.SUPABASE_URL || "https://nelfehxjyrphnlkyjurl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbGZlaHhqeXJwaG5sa3lqdXJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTIzODksImV4cCI6MjA5MzQ4ODM4OX0.haowQ9FePugPJQ1cRWviUxf_FlCYq5B7XbHwmZ53u_c";

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const { user_id } = event.queryStringParameters || {};
  if (!user_id) return { statusCode: 400, headers, body: JSON.stringify({ error: "user_id obbligatorio" }) };

  // Strip trailing slash and /rest/v1 if accidentally included
  const baseUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");

  try {
    const res = await fetch(
      `${baseUrl}/rest/v1/portfolios?user_id=eq.${encodeURIComponent(user_id)}&select=data&limit=1`,
      {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        },
      }
    );

    if (!res.ok) throw new Error(`Supabase error: ${res.status}`);

    const rows = await res.json();
    if (!rows.length) return { statusCode: 200, headers, body: JSON.stringify({ data: null }) };

    return { statusCode: 200, headers, body: JSON.stringify({ data: rows[0].data }) };
  } catch (err) {
    console.error("get-portfolio error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
