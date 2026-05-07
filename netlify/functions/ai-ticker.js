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
      const pubMatch   = match[1].match(/<pubDate>(.*?)<\/pubDate>/);
      if (titleMatch) items.push({
        title: titleMatch[1].trim(),
        desc: descMatch ? descMatch[1].replace(/<[^>]+>/g,'').trim().slice(0,250) : '',
        date: pubMatch ? pubMatch[1].trim() : ''
      });
    }
    return items;
  } catch(e) { return []; }
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const { ticker, nome, tipo, settore, avgPrice, current, qty } = JSON.parse(event.body || "{}");
  if (!ticker) return { statusCode: 400, headers, body: JSON.stringify({ error: "ticker required" }) };
  if (!GEMINI_KEY) return { statusCode: 500, headers, body: JSON.stringify({ error: "GEMINI_API_KEY non configurata" }) };

  const pl = ((current - avgPrice) / avgPrice * 100).toFixed(2);

  // Fetch live news for this ticker from Yahoo Finance RSS
  const news = await fetchRssHeadlines(
    `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(ticker)}&lang=en-US&region=US`, 5
  );

  // Also try base ticker without exchange suffix for better news coverage
  const baseTicker = ticker.replace(/\.[A-Z]+$/, '');
  let extraNews = [];
  if (baseTicker !== ticker) {
    extraNews = await fetchRssHeadlines(
      `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(baseTicker)}&lang=en-US&region=US`, 3
    );
  }
  const allNews = [...news, ...extraNews].slice(0, 5);

  const newsContext = allNews.length
    ? `\nNOTIZIE RECENTI (da Yahoo Finance):\n${allNews.map(n => `- [${n.date}] ${n.title}: ${n.desc}`).join('\n')}`
    : '\nNessuna notizia recente trovata via RSS.';

  const prompt = `Sei un analista finanziario esperto. Analizza il titolo ${ticker} (${nome}) per un investitore italiano.

POSIZIONE:
- Ticker: ${ticker} | Nome: ${nome} | Tipo: ${tipo} | Settore: ${settore}
- Prezzo medio acquisto: €${avgPrice} | Prezzo attuale: €${current}
- Quantità: ${qty} | P&L: ${pl}%
${newsContext}

Rispondi ESCLUSIVAMENTE con questo JSON valido (niente testo fuori):
{
  "news": [
    {
      "title": "Titolo notizia (max 80 caratteri)",
      "summary": "Sintesi in italiano (max 150 caratteri)",
      "sentiment": "positive",
      "date": "data leggibile"
    }
  ],
  "events": [
    {
      "type": "dividend",
      "label": "Etichetta evento (max 40 caratteri)",
      "date": "data o Data TBD",
      "detail": "Dettaglio (max 100 caratteri)"
    }
  ],
  "analysis": {
    "trend": "bullish",
    "summary": "Analisi sintetica in italiano (max 280 caratteri)",
    "consensus": "Buy"
  }
}

Massimo 3 notizie e 3 eventi. Traduci i titoli delle notizie in italiano. sentiment puo essere: positive, negative, neutral. type puo essere: dividend, earnings, split, other. trend puo essere: bullish, neutral, bearish. consensus puo essere: Buy, Hold, Sell, N/D. Se non hai dati certi su eventi futuri, metti type other con detail appropriato. Non inventare date specifiche.`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
        }),
      }
    );
    const data = await geminiRes.json();
    if (!geminiRes.ok) throw new Error(data.error?.message || "Gemini error");

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const clean = text.replace(/```json|```/g, "").trim();
    const jsonStart = clean.indexOf('{'), jsonEnd = clean.lastIndexOf('}');
    const result = JSON.parse(clean.slice(jsonStart, jsonEnd + 1));

    return { statusCode: 200, headers, body: JSON.stringify(result) };
  } catch(e) {
    console.error("ai-ticker error:", e.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: e.message }) };
  }
};
