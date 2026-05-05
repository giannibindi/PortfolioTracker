exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  const { tickers } = event.queryStringParameters || {};
  if (!tickers) return { statusCode: 400, headers, body: JSON.stringify({ error: "Nessun ticker" }) };

  const symbolList = tickers.split(",").map(t => t.trim()).filter(Boolean);
  const prices = {};

  // ── 1. Yahoo Finance v8 ───────────────────────────────────────────────────
  await Promise.all(symbolList.map(async (symbol) => {
    try {
      const res = await fetch(
        `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
        { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json", "Referer": "https://finance.yahoo.com" } }
      );
      if (!res.ok) return;
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice > 0) {
        prices[symbol] = { price: meta.regularMarketPrice, name: meta.longName || meta.shortName || symbol, currency: meta.currency || "USD", source: "yahoo" };
      }
    } catch (e) { console.warn(`Yahoo failed ${symbol}:`, e.message); }
  }));

  // ── 2. Variant suffix fallback (.MI → .F, .AS, .L) ───────────────────────
  const missing = symbolList.filter(s => !prices[s]);
  await Promise.all(missing.map(async (symbol) => {
    const variants = symbol.includes(".")
      ? [symbol.replace(/\.[A-Z]+$/, ".F"), symbol.replace(/\.[A-Z]+$/, ".AS"), symbol.replace(/\.[A-Z]+$/, ".L"), symbol.replace(/\.[A-Z]+$/, "")]
      : [`${symbol}.MI`, `${symbol}.AS`, `${symbol}.F`];
    for (const v of variants) {
      try {
        const res = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(v)}?interval=1d&range=1d`,
          { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json", "Referer": "https://finance.yahoo.com" } }
        );
        if (!res.ok) continue;
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice > 0) {
          prices[symbol] = { price: meta.regularMarketPrice, name: meta.longName || meta.shortName || symbol, currency: meta.currency || "EUR", source: `yahoo_alt:${v}` };
          break;
        }
      } catch (e) { continue; }
    }
  }));

  // ── 3. Mark manual_required for anything still missing ────────────────────
  symbolList.filter(s => !prices[s]).forEach(s => {
    prices[s] = { price: null, name: s, currency: "EUR", source: "manual_required" };
  });

  console.log("Prices:", JSON.stringify(Object.entries(prices).map(([k, v]) => ({ k, p: v.price, src: v.source }))));
  return { statusCode: 200, headers, body: JSON.stringify(prices) };
};
