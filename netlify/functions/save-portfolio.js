const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
  if (event.httpMethod !== "POST") return { statusCode: 405, headers, body: JSON.stringify({ error: "Metodo non consentito" }) };

  try {
    const { user_id, data } = JSON.parse(event.body);
    if (!user_id || !data) return { statusCode: 400, headers, body: JSON.stringify({ error: "user_id e data sono obbligatori" }) };

    // Upsert: inserisce o aggiorna se user_id esiste già
    const res = await fetch(`${SUPABASE_URL}/rest/v1/portfolios?on_conflict=user_id`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SUPABASE_KEY,
        "Authorization": `Bearer ${SUPABASE_KEY}`,
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({ user_id, data, updated_at: new Date().toISOString() }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error("save-portfolio error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
