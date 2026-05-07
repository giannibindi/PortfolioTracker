const SUPABASE_URL = process.env.SUPABASE_URL || "https://nelfehxjyrphnlkyjurl.supabase.co";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5lbGZlaHhqeXJwaG5sa3lqdXJsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MTIzODksImV4cCI6MjA5MzQ4ODM4OX0.haowQ9FePugPJQ1cRWviUxf_FlCYq5B7XbHwmZ53u_c";
const GEMINI_KEY = process.env.GEMINI_API_KEY;

async function fetchRssHeadlines(url, maxItems = 5) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < maxItems) {
      const titleMatch = match[1].match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || match[1].match(/<title>(.*?)<\/title>/);
      const descMatch  = match[1].match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || match[1].match(/<description>(.*?)<\/description>/);
      if (titleMatch) items.push({
        title: titleMatch[1].trim(),
        desc: descMatch ? descMatch[1].replace(/<[^>]+>/g,'').trim().slice(0,200) : ''
      });
    }
    return items;
  } catch(e) { return []; }
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const baseUrl = SUPABASE_URL.replace(/\/rest\/v1\/?$/, "").replace(/\/$/, "");
  const body = JSON.parse(event.body || "{}");
  const { user_id, portfolio_summary, force } = body;
  if (!user_id) return { statusCode: 400, headers, body: JSON.stringify({ error: "user_id required" }) };

  if (!force) {
    try {
      const cacheRes = await fetch(
        `${baseUrl}/rest/v1/portfolios?user_id=eq.${encodeURIComponent(user_id)}&select=insights_cache&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } }
      );
      const rows = await cacheRes.json();
      const cache = rows?.[0]?.insights_cache;
      if (cache?.generated_at) {
        const age = Date.now() - new Date(cache.generated_at).getTime();
        if (age < 24 * 60 * 60 * 1000) {
          return { statusCode: 200, headers, body: JSON.stringify({ insights: cache.insights, cached: true }) };
        }
      }
    } catch(e) { console.warn("Cache check failed:", e.message); }
  }

  if (!GEMINI_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY non configurata" }) };

  const tickers = (portfolio_summary || []).map(p => p.ticker).slice(0, 6);

  const [macroNews, marketNews, tickerNews] = await Promise.all([
    fetchRssHeadlines('https://feeds.finance.yahoo.com/rss/2.0/headline?s=%5EGSPC,%5EFTSE&lang=en-US&region=US', 4),
    fetchRssHeadlines('https://feeds.finance.yahoo.com/rss/2.0/headline?s=EURUSD%3DX,GC%3DF,CL%3DF&lang=en-US&region=US', 3),
    fetchRssHeadlines(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${tickers.join(',')}&lang=en-US&region=US`, 5),
  ]);

  const newsContext = [
    macroNews.length  ? `\nMARKET NEWS:\n${macroNews.map(n  => `- ${n.title}: ${n.desc}`).join('\n')}` : '',
    marketNews.length ? `\nCOMMODITY/FX NEWS:\n${marketNews.map(n => `- ${n.title}: ${n.desc}`).join('\n')}` : '',
    tickerNews.length ? `\nPORTFOLIO TICKER NEWS:\n${tickerNews.map(n => `- ${n.title}: ${n.desc}`).join('\n')}` : '',
  ].join('');

  const prompt = `Sei un consulente finanziario esperto. Analizza questo portafoglio e le notizie di mercato recenti per fornire spunti strategici personalizzati in italiano.

PORTAFOGLIO:
${JSON.stringify(portfolio_summary, null, 2)}
${newsContext}

Rispondi ESCLUSIVAMENTE con questo JSON valido (niente testo fuori dal JSON):
{
  "sentiment": "bullish",
  "summary": "Una frase di sintesi del momento (max 120 caratteri)",
  "macro_context": "Contesto macro attuale in 2 righe (max 200 caratteri)",
  "insights": [
    {
      "type": "opportunity",
      "title": "Titolo breve (max 50 caratteri)",
      "body": "Spiegazione concisa e actionable (max 180 caratteri)",
      "tickers": ["TICKER"]
    }
  ]
}

Massimo 4 insights. Sii specifico e concreto basandoti sulle notizie fornite. Sentiment puo essere: bullish, neutral, bearish. Type puo essere: opportunity, risk, rebalance, macro.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } },
        }),
      }
    );
    const data = await geminiRes.json();
    if (!geminiRes.ok) throw new Error(data.error?.message || "Gemini API error");

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("Raw Gemini response:", text.slice(0, 500));
    const clean = text.replace(/```json\n?|```/g, "").trim();
    const jsonStart = clean.indexOf('{'), jsonEnd = clean.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) throw new Error("No JSON found in response: " + clean.slice(0,200));
    const insights = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));

    await fetch(
      `${baseUrl}/rest/v1/portfolios?user_id=eq.${encodeURIComponent(user_id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: "return=minimal" },
        body: JSON.stringify({ insights_cache: { insights, generated_at: new Date().toISOString() } }),
      }
    ).catch(e => console.warn("Cache save failed:", e.message));

    return { statusCode: 200, headers, body: JSON.stringify({ insights, cached: false }) };
  } catch(e) {
    console.error("ai-insights error:", e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
