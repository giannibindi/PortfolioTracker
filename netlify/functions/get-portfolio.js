const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const { user_id } = event.queryStringParameters || {};
  if (!user_id) return { statusCode: 400, headers, body: JSON.stringify({ error: "user_id obbligatorio" }) };

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/portfolios?user_id=eq.${encodeURIComponent(user_id)}&select=data&limit=1`,
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
