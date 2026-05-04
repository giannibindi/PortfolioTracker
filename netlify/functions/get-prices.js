exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  const { tickers } = event.queryStringParameters || {};
  if (!tickers) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Nessun ticker fornito" }) };
  }

  const symbolList = tickers.split(",").map((t) => t.trim()).filter(Boolean);
  const prices = {};

  try {
    // Fetch each ticker individually from Yahoo Finance v8 (more reliable from server)
    await Promise.all(
      symbolList.map(async (symbol) => {
        try {
          const url = `https://query2.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
          const res = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
              "Accept": "application/json",
              "Accept-Language": "en-US,en;q=0.9",
              "Referer": "https://finance.yahoo.com",
            },
          });

          if (!res.ok) {
            console.warn(`Yahoo v8 failed for ${symbol}: ${res.status}`);
            return;
          }

          const data = await res.json();
          const meta = data?.chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice) {
            prices[symbol] = {
              price: meta.regularMarketPrice,
              name: meta.longName || meta.shortName || symbol,
              currency: meta.currency || "USD",
            };
          }
        } catch (err) {
          console.warn(`Error fetching ${symbol}:`, err.message);
        }
      })
    );

    // If Yahoo failed entirely, try with finnhub as fallback (free, no key needed for basic quotes)
    const missing = symbolList.filter((s) => !prices[s]);
    if (missing.length > 0) {
      await Promise.all(
        missing.map(async (symbol) => {
          try {
            const res = await fetch(
              `https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=cq7hh49r01qhiiegb5e0cq7hh49r01qhiiegb5eg`,
              { headers: { "Accept": "application/json" } }
            );
            if (!res.ok) return;
            const data = await res.json();
            if (data?.c && data.c > 0) {
              prices[symbol] = {
                price: data.c,
                name: symbol,
                currency: "USD",
              };
            }
          } catch (err) {
            console.warn(`Finnhub fallback failed for ${symbol}:`, err.message);
          }
        })
      );
    }

    return { statusCode: 200, headers, body: JSON.stringify(prices) };
  } catch (err) {
    console.error("get-prices error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
