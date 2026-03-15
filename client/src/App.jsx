import { useEffect, useState, useRef } from 'react';
import Globe from './components/Globe';
import InfoPanel from './components/InfoPanel';
import AnomalyFeed from './components/AnomalyFeed';
import { aqiInfo } from './utils/aqi';
import './App.css';

const REFRESH = 15 * 60 * 1000;

export default function App() {
  const [aqiData,       setAqiData]       = useState({});
  const [selectedCode,  setSelectedCode]  = useState(null);
  const [lastUpdated,   setLastUpdated]   = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const tickerRef = useRef(null);

  async function loadWorld() {
    try {
      const res  = await fetch('/api/aqi/world');
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setAqiData(json.countries || {});
      setLastUpdated(new Date(json.fetchedAt));
      setLoading(false); setError(null);
    } catch (e) { setError(e.message); setLoading(false); }
  }

  useEffect(() => {
    loadWorld();
    const iv = setInterval(loadWorld, REFRESH);
    return () => clearInterval(iv);
  }, []);

  useEffect(() => {
    if (!tickerRef.current || !Object.keys(aqiData).length) return;
    const sorted = Object.entries(aqiData)
      .filter(([, d]) => d.avgAqi != null)
      .sort(([, a], [, b]) => (b.avgAqi || 0) - (a.avgAqi || 0));
    const items = sorted.map(([code, d]) => {
      const info = aqiInfo(d.avgAqi);
      return `<span style="color:${info.col}">${d.name || code}&nbsp;${d.avgAqi}</span>`;
    }).join('&ensp;·&ensp;');
    tickerRef.current.innerHTML = items + '&ensp;·&ensp;' + items;
  }, [aqiData]);

  const vals      = Object.values(aqiData).map(d => d.avgAqi).filter(Boolean);
  const globalAvg = vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) : '—';
  const globalInfo = aqiInfo(parseFloat(globalAvg));

  return (
    <div className="app">
      <StarField />
      <div className="scanlines" />

      {loading && <div className="loading-screen"><div className="loading-text">Initializing AQI Monitor</div></div>}
      {error    && <div className="error-banner">{error} — retrying...</div>}

      <Globe aqiData={aqiData} onCountryClick={setSelectedCode} selectedCode={selectedCode} />

      {/* Header */}
      <div className="header">
        <div className="brand-label">Global Air Quality</div>
        <div className="brand-title">AirVision<br/>Global</div>
        <div className="brand-sub">v1.0 · MERN Stack</div>
      </div>

      {/* Top right */}
      <div className="top-right">
        <div className="gai-label">Global Avg AQI</div>
        <div className="gai-value" style={{ color: globalInfo.col }}>{globalAvg}</div>
        <div className="gai-status" style={{ color: globalInfo.col }}>
          <span className="live-dot" />LIVE · {vals.length} countries
        </div>
        {lastUpdated && <div className="gai-time">Updated {lastUpdated.toLocaleTimeString()}</div>}
      </div>

      {/* Legend */}
      <div className="legend">
        <div className="leg-title">AQI Level</div>
        {[
          ['#00e400', 'Good ≤50'],
          ['#ffff00', 'Moderate 51–100'],
          ['#ff7e00', 'Sensitive 101–150'],
          ['#ff0000', 'Unhealthy 151–200'],
          ['#8f3f97', 'Very Unhealthy 201–300'],
          ['#7e0023', 'Hazardous >300'],
        ].map(([col, label]) => (
          <div className="leg-item" key={col}>
            <div className="leg-swatch" style={{ background: col }} />{label}
          </div>
        ))}
      </div>

      {/* Anomaly feed (center top) */}
      <AnomalyFeed onCountryClick={setSelectedCode} />

      {/* Country detail panel */}
      <InfoPanel countryCode={selectedCode} onClose={() => setSelectedCode(null)} />

      <div className="hint">Scroll to zoom · names appear when zoomed · click any country</div>

      {/* Ticker */}
      <div className="ticker">
        <div className="ticker-label">AQI Feed</div>
        <div className="ticker-track"><div className="ticker-inner" ref={tickerRef} /></div>
      </div>
    </div>
  );
}

function StarField() {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current;
    c.width = window.innerWidth; c.height = window.innerHeight;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#020510'; ctx.fillRect(0, 0, c.width, c.height);
    for (let i = 0; i < 900; i++) {
      ctx.beginPath();
      ctx.arc(Math.random() * c.width, Math.random() * c.height, Math.random() * 1.1, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${180 + Math.random()*40},${195 + Math.random()*30},255,${0.15 + Math.random()*0.6})`;
      ctx.fill();
    }
  }, []);
  return <canvas ref={ref} style={{ position: 'fixed', top: 0, left: 0, zIndex: 0, pointerEvents: 'none' }} />;
}
