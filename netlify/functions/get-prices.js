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

  const symbols = tickers.split(",").map((t) => t.trim()).join(",");

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}&fields=regularMarketPrice,shortName,currency`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });

    if (!res.ok) throw new Error(`Yahoo Finance error: ${res.status}`);

    const data = await res.json();
    const quotes = data?.quoteResponse?.result || [];

    const prices = {};
    quotes.forEach((q) => {
      prices[q.symbol] = {
        price: q.regularMarketPrice ?? null,
        name: q.shortName ?? q.symbol,
        currency: q.currency ?? "EUR",
      };
    });

    return { statusCode: 200, headers, body: JSON.stringify(prices) };
  } catch (err) {
    console.error("get-prices error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
