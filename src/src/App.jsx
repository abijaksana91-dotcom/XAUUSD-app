hereimport { useState, useCallback } from "react";

// ---------- Indicator math ----------
function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function rsi(closes, period = 14) {
  if (closes.length < period + 1) return null;
  let gains = 0,
    losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period,
    avgLoss = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function macd(closes) {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine.slice(-Math.min(macdLine.length, 100)), 9);
  const hist = macdLine[macdLine.length - 1] - signalLine[signalLine.length - 1];
  return {
    macd: macdLine[macdLine.length - 1],
    signal: signalLine[signalLine.length - 1],
    hist,
  };
}

function atr(candles, period = 14) {
  if (candles.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high,
      l = candles[i].low,
      pc = candles[i - 1].close;
    trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
  }
  const recent = trs.slice(-period);
  return recent.reduce((a, b) => a + b, 0) / recent.length;
}

function computeIndicators(candles) {
  const closes = candles.map((c) => c.close);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, Math.min(50, closes.length - 1));
  return {
    lastClose: closes[closes.length - 1],
    ema20: ema20[ema20.length - 1],
    ema50: ema50[ema50.length - 1],
    rsi14: rsi(closes, 14),
    macd: macd(closes),
    atr14: atr(candles, 14),
    high24: Math.max(...candles.slice(-24).map((c) => c.high)),
    low24: Math.min(...candles.slice(-24).map((c) => c.low)),
  };
}

// ---------- TwelveData fetch ----------
async function fetchCandles(apiKey, interval) {
  const url = `https://api.twelvedata.com/time_series?symbol=XAU/USD&interval=${interval}&outputsize=100&apikey=${apiKey}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status === "error" || !data.values) {
    throw new Error(data.message || "Gagal mengambil data. Cek API key TwelveData.");
  }
  return data.values
    .map((v) => ({
      time: v.datetime,
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .reverse();
}

// ---------- Claude call for narrative ----------
async function getAnalysisNarrative(anthropicKey, h1, h4) {
  const prompt = `Kamu adalah analis trading profesional untuk XAUUSD (emas). Berdasarkan data indikator teknikal berikut, berikan analisa singkat dan setup trading. Jawab HANYA dalam format JSON valid, tanpa markdown, tanpa penjelasan tambahan, dengan struktur persis:
{
  "bias": "bullish" | "bearish" | "netral",
  "confidence": "tinggi" | "sedang" | "rendah",
  "ringkasan": "1-2 kalimat kondisi pasar saat ini",
  "entry_area": "range harga entry yang disarankan",
  "invalidasi": "level harga stop loss / invalidasi setup",
  "target": "level harga target/take profit",
  "catatan_risiko": "1 kalimat peringatan risiko relevan"
}

Data H1 (1 jam): harga terakhir ${h1.lastClose.toFixed(2)}, EMA20 ${h1.ema20.toFixed(2)}, EMA50 ${h1.ema50.toFixed(2)}, RSI14 ${h1.rsi14?.toFixed(1)}, MACD histogram ${h1.macd.hist.toFixed(3)}, ATR14 ${h1.atr14?.toFixed(2)}, high24 ${h1.high24.toFixed(2)}, low24 ${h1.low24.toFixed(2)}.

Data H4 (4 jam): harga terakhir ${h4.lastClose.toFixed(2)}, EMA20 ${h4.ema20.toFixed(2)}, EMA50 ${h4.ema50.toFixed(2)}, RSI14 ${h4.rsi14?.toFixed(1)}, MACD histogram ${h4.macd.hist.toFixed(3)}, ATR14 ${h4.atr14?.toFixed(2)}.

Gunakan H4 untuk bias arah utama, H1 untuk timing entry. Pertimbangkan risk/reward yang wajar berdasarkan ATR.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await response.json();
  if (data.error) throw new Error(data.error.message || "Gagal memanggil Claude API.");
  const text = data.content.map((b) => b.text || "").join("");
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

// ---------- UI ----------
const biasColor = {
  bullish: { fg: "#4ADE80", bg: "rgba(74,222,128,0.08)", border: "rgba(74,222,128,0.35)" },
  bearish: { fg: "#F87171", bg: "rgba(248,113,113,0.08)", border: "rgba(248,113,113,0.35)" },
  netral: { fg: "#94A3B8", bg: "rgba(148,163,184,0.08)", border: "rgba(148,163,184,0.35)" },
};

function Stat({ label, value, mono = true }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5B6478" }}>
        {label}
      </span>
      <span style={{ fontSize: 14, fontFamily: mono ? "'IBM Plex Mono', monospace" : "inherit", color: "#DDE3F0" }}>
        {value}
      </span>
    </div>
  );
}

export default function App() {
  const [apiKey, setApiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [result, setResult] = useState(null);

  const runAnalysis = useCallback(async () => {
    if (!apiKey.trim()) {
      setStatus("error");
      setErrorMsg("Masukkan API key TwelveData dulu.");
      return;
    }
    setStatus("loading");
    setErrorMsg("");
    try {
      const [c1h, c4h] = await Promise.all([
        fetchCandles(apiKey.trim(), "1h"),
        fetchCandles(apiKey.trim(), "4h"),
      ]);
      const h1 = computeIndicators(c1h);
      const h4 = computeIndicators(c4h);

      let narrative = null;
      if (anthropicKey.trim()) {
        narrative = await getAnalysisNarrative(anthropicKey.trim(), h1, h4);
      }

      setResult({ h1, h4, narrative, timestamp: new Date() });
      setStatus("done");
    } catch (err) {
      setStatus("error");
      setErrorMsg(err.message || "Terjadi kesalahan.");
    }
  }, [apiKey, anthropicKey]);

  const bias = result?.narrative?.bias || "netral";
  const colors = biasColor[bias] || biasColor.netral;

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0B0D12",
        color: "#DDE3F0",
        fontFamily: "'Inter', 'Segoe UI', sans-serif",
        padding: "32px 20px 60px",
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; }
        button:focus-visible, input:focus-visible { outline: 2px solid #C9A227; outline-offset: 2px; }
        @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }
        .pulse { animation: pulse 1.4s ease-in-out infinite; }
        @keyframes pulse { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }
        .fade-in { animation: fadeIn 0.5s ease-out; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>

      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ marginBottom: 28, display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: "0.18em", color: "#C9A227", textTransform: "uppercase", marginBottom: 4 }}>
              Terminal Analisa
            </div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, letterSpacing: "-0.01em" }}>
              XAU/USD <span style={{ color: "#5B6478", fontWeight: 500 }}>· Intraday</span>
            </h1>
          </div>
          <div style={{ textAlign: "right", fontSize: 11, color: "#5B6478" }}>
            <div>1H &amp; 4H gabungan</div>
            <div>via TwelveData</div>
          </div>
        </div>

        <div style={{ background: "#12151C", border: "1px solid #1E2330", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
          <label style={{ fontSize: 11, letterSpacing: "0.06em", color: "#5B6478", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
            API key TwelveData (wajib)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Tempel API key TwelveData"
              style={{ flex: 1, background: "#0B0D12", border: "1px solid #1E2330", borderRadius: 6, padding: "9px 10px", color: "#DDE3F0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
            />
            <button onClick={() => setShowKey((s) => !s)} style={{ background: "transparent", border: "1px solid #1E2330", borderRadius: 6, color: "#5B6478", fontSize: 12, padding: "0 12px", cursor: "pointer" }}>
              {showKey ? "Sembunyikan" : "Lihat"}
            </button>
          </div>
        </div>

        <div style={{ background: "#12151C", border: "1px solid #1E2330", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <label style={{ fontSize: 11, letterSpacing: "0.06em", color: "#5B6478", textTransform: "uppercase", display: "block", marginBottom: 8 }}>
            API key Anthropic (opsional, untuk narasi AI)
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              type={showAnthropicKey ? "text" : "password"}
              value={anthropicKey}
              onChange={(e) => setAnthropicKey(e.target.value)}
              placeholder="sk-ant-... (kosongkan untuk lihat indikator mentah saja)"
              style={{ flex: 1, background: "#0B0D12", border: "1px solid #1E2330", borderRadius: 6, padding: "9px 10px", color: "#DDE3F0", fontFamily: "'IBM Plex Mono', monospace", fontSize: 13 }}
            />
            <button onClick={() => setShowAnthropicKey((s) => !s)} style={{ background: "transparent", border: "1px solid #1E2330", borderRadius: 6, color: "#5B6478", fontSize: 12, padding: "0 12px", cursor: "pointer" }}>
              {showAnthropicKey ? "Sembunyikan" : "Lihat"}
            </button>
          </div>
          <div style={{ fontSize: 11, color: "#454D5F", marginTop: 8, lineHeight: 1.5 }}>
            Kedua key hanya tersimpan di memori browser kamu selama sesi ini, hilang saat halaman ditutup. Tidak dikirim ke server manapun selain TwelveData dan Anthropic langsung.
          </div>
        </div>

        <button
          onClick={runAnalysis}
          disabled={status === "loading"}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: 10,
            border: "none",
            background: status === "loading" ? "#1E2330" : "linear-gradient(135deg, #C9A227, #A67F1E)",
            color: status === "loading" ? "#5B6478" : "#0B0D12",
            fontSize: 15,
            fontWeight: 700,
            letterSpacing: "0.02em",
            cursor: status === "loading" ? "default" : "pointer",
            marginBottom: 20,
          }}
        >
          {status === "loading" ? <span className="pulse">Menganalisa kondisi market…</span> : "Analisa Sekarang"}
        </button>

        {status === "error" && (
          <div className="fade-in" style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.3)", borderRadius: 8, padding: "12px 14px", color: "#F87171", fontSize: 13, marginBottom: 20 }}>
            {errorMsg}
          </div>
        )}

        {status === "done" && result && (
          <div className="fade-in">
            {result.narrative ? (
              <>
                <div style={{ background: colors.bg, border: `1px solid ${colors.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span style={{ fontSize: 12, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5B6478" }}>
                      Bias · Keyakinan {result.narrative.confidence}
                    </span>
                    <span style={{ fontSize: 11, color: "#454D5F" }}>{result.timestamp.toLocaleTimeString("id-ID")}</span>
                  </div>
                  <div style={{ fontSize: 28, fontWeight: 700, color: colors.fg, textTransform: "capitalize", marginBottom: 10 }}>{bias}</div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "#B8C0D4" }}>{result.narrative.ringkasan}</p>
                </div>

                <div style={{ background: "#12151C", border: "1px solid #1E2330", borderRadius: 12, padding: 20, marginBottom: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <Stat label="Area Entry" value={result.narrative.entry_area} />
                  <Stat label="Invalidasi (SL)" value={result.narrative.invalidasi} />
                  <Stat label="Target (TP)" value={result.narrative.target} />
                  <Stat label="Harga Saat Ini" value={result.h1.lastClose.toFixed(2)} />
                </div>

                <div style={{ fontSize: 12.5, color: "#9A7B1F", background: "rgba(201,162,39,0.08)", border: "1px solid rgba(201,162,39,0.25)", borderRadius: 8, padding: "10px 14px", marginBottom: 20, lineHeight: 1.5 }}>
                  ⚠ {result.narrative.catatan_risiko}
                </div>
              </>
            ) : (
              <div style={{ background: "#12151C", border: "1px solid #1E2330", borderRadius: 12, padding: 20, marginBottom: 20, fontSize: 13, color: "#7A85A0" }}>
                Isi API key Anthropic untuk mendapat narasi &amp; setup entry/SL/TP otomatis. Berikut indikator mentahnya:
              </div>
            )}

            <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "#5B6478", marginBottom: 10 }}>
              Detail Indikator
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[{ label: "1 Jam", d: result.h1 }, { label: "4 Jam", d: result.h4 }].map(({ label, d }) => (
                <div key={label} style={{ background: "#12151C", border: "1px solid #1E2330", borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 12, color: "#C9A227", marginBottom: 10, fontWeight: 600 }}>{label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <Stat label="RSI 14" value={d.rsi14?.toFixed(1) ?? "—"} />
                    <Stat label="EMA20 / EMA50" value={`${d.ema20.toFixed(2)} / ${d.ema50.toFixed(2)}`} />
                    <Stat label="MACD Hist" value={d.macd.hist.toFixed(3)} />
                    <Stat label="ATR 14" value={d.atr14?.toFixed(2) ?? "—"} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 32, fontSize: 11, color: "#454D5F", lineHeight: 1.6, textAlign: "center" }}>
          Bukan nasihat keuangan. Analisa dihasilkan otomatis dari indikator teknikal dan AI — selalu lakukan verifikasi dan kelola risiko sendiri sebelum mengambil posisi.
        </div>
      </div>
    </div>
  );
    }
