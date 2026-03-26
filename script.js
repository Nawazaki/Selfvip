// ========== التحقق من وجود المكتبات ==========
if (typeof LightweightCharts === 'undefined') {
  console.error("LightweightCharts is not loaded. Chart will not work.");
  // عرض رسالة في مكان الرسم البياني
  const chartContainer = document.getElementById('chartContainer');
  if (chartContainer) {
    chartContainer.innerHTML = '<div class="text-red-400 text-center p-4">⚠️ Chart library failed to load. Please check your internet connection and refresh.</div>';
  }
  // منع محاولة استخدام المكتبة لاحقًا
  window.LightweightCharts = null;
}

// ========== المتغيرات العامة ==========
window.appData = {
  currentMarketData: null,
  currentCandles: { h1: [] },
  currentSymbol: "BTCUSDT",
  currentMarket: "crypto",
  ws: null,
  chart: null,
  candleSeries: null
};

// ========== دوال مساعدة ==========
function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
function nowStamp() {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;
}
function safe(v, fallback = "N/A") {
  return (v === null || v === undefined || v === "") ? fallback : v;
}
function extractJson(text, retries = 2) {
  for (let i = 0; i < retries; i++) {
    try { return JSON.parse(text); } catch(e) {}
    const match = text.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch(e2) {}
    }
    text = text.replace(/```json|```/g, '');
  }
  throw new Error("AI did not return valid JSON.");
}

// ========== جلب البيانات من Binance ==========
async function fetchLivePriceOnly(market, symbol) {
  if (market === "crypto") {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    if (!res.ok) throw new Error(`Binance error: ${symbol} not found.`);
    const data = await res.json();
    return parseFloat(data.price).toFixed(2);
  } else {
    // بيانات وهمية للأسهم/الفوركس
    console.warn(`Using mock data for ${market}.`);
    return (Math.random() * 500 + 50).toFixed(2);
  }
}

async function fetchCandlesMultiTF(market, symbol, limit) {
  if (market === "crypto") {
    const intervals = ["15m", "1h", "4h", "1d"];
    const requests = intervals.map(interval =>
      fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`)
        .then(res => res.ok ? res.json() : Promise.reject(`Binance ${interval} failed`))
        .then(data => data.map(c => ({
          open: parseFloat(c[1]), high: parseFloat(c[2]),
          low: parseFloat(c[3]), close: parseFloat(c[4]), volume: parseFloat(c[5])
        })))
    );
    const [m15, h1, h4, d1] = await Promise.all(requests);
    return { m15, h1, h4, d1 };
  } else {
    // بيانات وهمية
    const generateMock = () => Array.from({ length: limit }, () => ({
      open: Math.random() * 200 + 100,
      high: Math.random() * 210 + 100,
      low: Math.random() * 190 + 100,
      close: Math.random() * 200 + 100,
      volume: Math.random() * 10000
    }));
    return { m15: generateMock(), h1: generateMock(), h4: generateMock(), d1: generateMock() };
  }
}

function summarizeCandles(candles) {
  if (!candles.length) return { lastClose: "N/A", high: "N/A", low: "N/A", avgClose: "N/A", candlesText: "No data" };
  const last = candles[candles.length - 1];
  const highs = candles.map(c => c.high);
  const lows = candles.map(c => c.low);
  const closes = candles.map(c => c.close);
  return {
    lastClose: last.close.toFixed(2),
    high: Math.max(...highs).toFixed(2),
    low: Math.min(...lows).toFixed(2),
    avgClose: (closes.reduce((a, b) => a + b, 0) / closes.length).toFixed(2),
    candlesText: candles.slice(-5).map((c, i) =>
      `C${i+1}: O:${c.open.toFixed(2)} H:${c.high.toFixed(2)} L:${c.low.toFixed(2)} C:${c.close.toFixed(2)}`
    ).join("\n")
  };
}

async function loadFullMarketData(updateChart = true) {
  const market = document.getElementById("marketType").value;
  const symbol = document.getElementById("symbolInput").value.toUpperCase();
  const limit = parseInt(document.getElementById("candleLimit").value) || 40;
  window.appData.currentMarket = market;
  window.appData.currentSymbol = symbol;

  const priceBtn = document.getElementById("fetchPriceBtn");
  const ohlcBtn = document.getElementById("fetchOhlcBtn");
  priceBtn.disabled = true; ohlcBtn.disabled = true;
  priceBtn.innerText = "Fetching..."; ohlcBtn.innerText = "Loading TF...";

  try {
    const price = await fetchLivePriceOnly(market, symbol);
    const { m15, h1, h4, d1 } = await fetchCandlesMultiTF(market, symbol, limit);
    if (updateChart && h1.length) {
      window.appData.currentCandles.h1 = h1;
      updateChartWithData(h1);
    }
    const s15 = summarizeCandles(m15);
    const s1h = summarizeCandles(h1);
    const s4h = summarizeCandles(h4);
    const s1d = summarizeCandles(d1);
    const analysisText = `[MARKET DATA - ${symbol}]
Market: ${market.toUpperCase()}
Live Price: $${price}

[M15]
Last Close: ${s15.lastClose} | High: ${s15.high} | Low: ${s15.low} | Avg Close: ${s15.avgClose}
${s15.candlesText}

[H1]
Last Close: ${s1h.lastClose} | High: ${s1h.high} | Low: ${s1h.low} | Avg Close: ${s1h.avgClose}
${s1h.candlesText}

[H4]
Last Close: ${s4h.lastClose} | High: ${s4h.high} | Low: ${s4h.low} | Avg Close: ${s4h.avgClose}
${s4h.candlesText}

[D1]
Last Close: ${s1d.lastClose} | High: ${s1d.high} | Low: ${s1d.low} | Avg Close: ${s1d.avgClose}

[ANALYSIS REQUEST]
Analyze order blocks, liquidity sweeps, BOS/CHoCH, bias, invalidation, and educational entry zones.`;
    document.getElementById("marketDataInput").value = analysisText;
    window.appData.currentMarketData = analysisText;
    document.getElementById("livePriceDisplay").innerHTML = `${symbol} $${price}`;
  } catch (err) {
    console.error(err);
    alert(`Error loading data: ${err.message}`);
    document.getElementById("marketDataInput").value = `Error: ${err.message}`;
  } finally {
    priceBtn.disabled = false; ohlcBtn.disabled = false;
    priceBtn.innerText = "Get Live Price"; ohlcBtn.innerText = "Load Multi-TF";
  }
}

function updateChartWithData(candles) {
  // التحقق من وجود المكتبة
  if (typeof LightweightCharts === 'undefined' || LightweightCharts === null) {
    console.warn("Cannot update chart: LightweightCharts not loaded");
    const container = document.getElementById('chartContainer');
    if (container && !container.innerHTML.includes('Chart library failed')) {
      container.innerHTML = '<div class="text-red-400 text-center p-4">⚠️ Chart library missing. Cannot display chart.</div>';
    }
    return;
  }

  const container = document.getElementById("chartContainer");
  if (!window.appData.chart) {
    window.appData.chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 280,
      layout: { background: { color: '#0f172a' }, textColor: '#cbd5e1' },
      grid: { vertLines: { color: '#1e293b' }, horzLines: { color: '#1e293b' } }
    });
    window.appData.candleSeries = window.appData.chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444', borderVisible: false,
      wickUpColor: '#22c55e', wickDownColor: '#ef4444'
    });
  }
  const chartData = candles.map((c, i) => ({
    time: new Date(Date.now() - (candles.length - i) * 3600000).toISOString().split('T')[0],
    open: c.open, high: c.high, low: c.low, close: c.close
  }));
  window.appData.candleSeries.setData(chartData);
  window.appData.chart.timeScale().fitContent();
}

// ========== AI Analysis ==========
async function callAIModel(model, prompt) {
  if (model === "puter") {
    const response = await puter.ai.chat(prompt);
    const text = typeof response === "string" ? response : (response?.message?.content || response?.text || JSON.stringify(response));
    return text;
  } else {
    // محاكاة لنماذج أخرى (يمكن استبدالها بطلب حقيقي إلى خادم وسيط)
    console.warn(`Using simulation for ${model}. Implement proxy for production.`);
    const fallback = await puter.ai.chat(prompt);
    return (typeof fallback === "string" ? fallback : (fallback?.message?.content || JSON.stringify(fallback))) +
      `\n\n[Note: ${model} simulation via proxy not configured. Using fallback AI.]`;
  }
}

async function analyzeMarket() {
  let inputData = document.getElementById("marketDataInput").value.trim();
  if (!inputData) {
    alert("No market data. Please use 'One-Click Analyze' or load data first.");
    return;
  }
  const symbol = document.getElementById("symbolInput").value.toUpperCase();
  const model = document.getElementById("aiModelSelect").value;
  const btn = document.getElementById("generateBtn");
  const btnText = document.getElementById("btnText");
  const loader = document.getElementById("btnLoader");
  const dashboard = document.getElementById("outputDashboard");
  const timestampSpan = document.getElementById("timestamp");

  btn.disabled = true;
  btnText.innerText = "Processing...";
  loader.classList.remove("hidden");
  dashboard.innerHTML = `<div class="flex flex-col items-center justify-center h-full text-blue-400 animate-pulse">
    <div class="h-10 w-10 border-4 border-t-blue-500 border-slate-700 rounded-full animate-spin mb-4"></div>
    <p>${model.toUpperCase()} engine analyzing ${symbol} data...</p>
  </div>`;

  const prompt = `You are a professional Smart Money Concepts trader. Analyze ${symbol} based ONLY on the data below. Return ONLY valid JSON with exactly this structure, no extra text.
{
  "bias": { "status": "bullish/bearish/neutral", "strength": "weak/moderate/strong", "reason": "string" },
  "timeframes": { "M15": "string", "H1": "string", "H4": "string", "D1": "string" },
  "order_blocks": [ { "zone": "price range", "type": "demand or supply", "timeframe": "string", "strength": "string", "reason": "string" } ],
  "liquidity": { "bsl": "string", "ssl": "string", "sweep": "string" },
  "trade_plan": { "entry": "string", "tp": "string", "sl": "string", "buy_scenario": "string", "sell_scenario": "string" }
}
Market data:
${inputData}`;

  try {
    const aiResponse = await callAIModel(model, prompt);
    const aiData = extractJson(aiResponse, 3);
    if (!aiData.bias || !aiData.trade_plan) throw new Error("Incomplete AI data format.");
    renderDashboard(aiData, symbol);
    timestampSpan.innerText = `Last analysis: ${nowStamp()} (${model})`;
  } catch (err) {
    console.error(err);
    dashboard.innerHTML = `<div class="p-6 bg-red-900/30 border border-red-500/50 rounded-xl text-red-300">
      <h4 class="font-bold mb-2">AI Error</h4>
      <p class="text-sm font-mono">${escapeHtml(err.message)}</p>
    </div>`;
  } finally {
    btn.disabled = false;
    btnText.innerText = "Run AI Analysis";
    loader.classList.add("hidden");
  }
}

function renderDashboard(data, symbol) {
  const dashboard = document.getElementById("outputDashboard");
  const biasStatus = safe(data?.bias?.status, "Neutral");
  const biasStrength = safe(data?.bias?.strength, "moderate");
  const biasColor = biasStatus.toLowerCase().includes("bullish") ? "from-emerald-500 to-cyan-400" :
                    biasStatus.toLowerCase().includes("bearish") ? "from-rose-500 to-orange-400" :
                    "from-yellow-500 to-amber-400";
  const obsHtml = (data.order_blocks || []).map(ob => {
    const isDemand = String(ob.type || "").toLowerCase().includes("demand");
    const outerClass = isDemand ? "bg-emerald-900/20 border-emerald-500/30" : "bg-rose-900/20 border-rose-500/30";
    const badgeClass = isDemand ? "bg-emerald-500/20 text-emerald-400" : "bg-rose-500/20 text-rose-400";
    return `<div class="p-4 rounded-xl border ${outerClass}">
      <div class="flex justify-between"><span class="text-sm font-mono">${escapeHtml(safe(ob.timeframe))}</span>
      <span class="text-xs uppercase ${badgeClass} px-2 py-1 rounded-md">${escapeHtml(safe(ob.type))}</span></div>
      <h4 class="text-xl font-black font-mono my-2">${escapeHtml(safe(ob.zone))}</h4>
      <p class="text-xs">${escapeHtml(safe(ob.reason))}</p>
    </div>`;
  }).join("") || "<div class='text-slate-500'>No order blocks identified.</div>";
  dashboard.innerHTML = `
    <div class="space-y-5">
      <h2 class="text-2xl font-black text-center uppercase">${escapeHtml(symbol)} SMC Analysis</h2>
      <div class="bg-slate-800/50 border p-5 rounded-2xl">
        <h3 class="text-xs font-bold uppercase">Institutional Bias</h3>
        <div class="text-3xl font-black bg-gradient-to-r ${biasColor} bg-clip-text text-transparent">${escapeHtml(biasStatus)}</div>
        <div>Strength: ${escapeHtml(biasStrength)}</div>
        <p class="mt-2">${escapeHtml(safe(data?.bias?.reason))}</p>
      </div>
      <div><h3 class="text-xs font-bold uppercase mb-3">Order Blocks</h3><div class="grid md:grid-cols-2 gap-3">${obsHtml}</div></div>
      <div><h3 class="text-xs font-bold uppercase mb-2">Trade Plan</h3>
        <div class="grid grid-cols-2 gap-3">
          <div class="bg-slate-800/40 p-3 rounded"><span class="text-slate-400 text-xs">Entry</span><div class="font-bold">${escapeHtml(safe(data?.trade_plan?.entry))}</div></div>
          <div class="bg-slate-800/40 p-3 rounded"><span class="text-slate-400 text-xs">TP</span><div class="font-bold">${escapeHtml(safe(data?.trade_plan?.tp))}</div></div>
          <div class="bg-slate-800/40 p-3 rounded"><span class="text-slate-400 text-xs">SL</span><div class="font-bold">${escapeHtml(safe(data?.trade_plan?.sl))}</div></div>
          <div class="bg-slate-800/40 p-3 rounded col-span-2"><span class="text-slate-400 text-xs">Scenarios</span>
            <div class="text-xs">Buy: ${escapeHtml(safe(data?.trade_plan?.buy_scenario))}<br>Sell: ${escapeHtml(safe(data?.trade_plan?.sell_scenario))}</div>
          </div>
        </div>
      </div>
    </div>`;
}

// ========== WebSocket ==========
let wsActive = false;
function initWebSocket(symbol) {
  if (window.appData.ws) window.appData.ws.close();
  if (!wsActive) return;
  const stream = `wss://stream.binance.com:9443/ws/${symbol.toLowerCase()}@trade`;
  const ws = new WebSocket(stream);
  ws.onopen = () => document.getElementById("wsStatus").innerText = `WebSocket live for ${symbol}`;
  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const price = parseFloat(data.p).toFixed(2);
    document.getElementById("livePriceDisplay").innerHTML = `${symbol} $${price} (live)`;
  };
  ws.onerror = () => document.getElementById("wsStatus").innerText = "WS error (crypto only)";
  ws.onclose = () => document.getElementById("wsStatus").innerText = "WebSocket closed";
  window.appData.ws = ws;
}

// ========== Export ==========
function exportAsText() {
  const analysisDiv = document.getElementById("outputDashboard").innerText;
  const blob = new Blob([analysisDiv], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `selfvip_analysis_${nowStamp()}.txt`;
  a.click();
  URL.revokeObjectURL(a.href);
}
async function exportAsImage() {
  const node = document.getElementById("outputDashboard");
  if (!node) return;
  try {
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#0f172a' });
    const link = document.createElement('a');
    link.download = `selfvip_signal_${nowStamp()}.png`;
    link.href = canvas.toDataURL();
    link.click();
  } catch (e) { alert("Image export failed: " + e.message); }
}

// ========== Event Listeners ==========
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("fetchPriceBtn").addEventListener("click", async () => {
    const market = document.getElementById("marketType").value;
    const symbol = document.getElementById("symbolInput").value.toUpperCase();
    try {
      const price = await fetchLivePriceOnly(market, symbol);
      document.getElementById("livePriceDisplay").innerHTML = `${symbol} $${price}`;
      alert(`Live ${symbol}: $${price}`);
    } catch (e) { alert(e.message); }
  });
  document.getElementById("fetchOhlcBtn").addEventListener("click", () => loadFullMarketData(true));
  document.getElementById("oneClickAnalyzeBtn").addEventListener("click", async () => {
    await loadFullMarketData(true);
    setTimeout(() => analyzeMarket(), 500);
  });
  document.getElementById("generateBtn").addEventListener("click", analyzeMarket);
  document.getElementById("exportTextBtn").addEventListener("click", exportAsText);
  document.getElementById("exportImageBtn").addEventListener("click", exportAsImage);
  document.getElementById("wsToggle").addEventListener("change", (e) => {
    wsActive = e.target.checked;
    if (wsActive && document.getElementById("marketType").value === "crypto") {
      initWebSocket(document.getElementById("symbolInput").value.toUpperCase());
    } else if (!wsActive && window.appData.ws) {
      window.appData.ws.close();
      document.getElementById("wsStatus").innerText = "WebSocket disabled";
    } else if (wsActive && document.getElementById("marketType").value !== "crypto") {
      alert("WebSocket live prices only supported for crypto markets.");
      e.target.checked = false;
      wsActive = false;
    }
  });
  window.addEventListener("resize", () => {
    if (window.appData.chart) window.appData.chart.resize(document.getElementById("chartContainer").clientWidth, 280);
  });
  loadFullMarketData(true);
});
