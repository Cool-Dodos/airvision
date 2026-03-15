import { useEffect, useState } from 'react';
import { aqiInfo } from '../utils/aqi';
import { ANOMALY_SEVERITY, SOURCE_TAGS } from '../utils/health';

export default function AnomalyFeed({ onCountryClick }) {
  const [anomalies, setAnomalies] = useState([]);
  const [open, setOpen]           = useState(false);
  const [loading, setLoading]     = useState(false);

  async function loadAnomalies() {
    setLoading(true);
    try {
      const res  = await fetch('/api/aqi/anomalies');
      const json = await res.json();
      setAnomalies(json.anomalies || []);
    } catch {}
    setLoading(false);
  }

  useEffect(() => {
    loadAnomalies();
    const iv = setInterval(loadAnomalies, 15 * 60 * 1000);
    return () => clearInterval(iv);
  }, []);

  const count = anomalies.length;
  const hasCritical = anomalies.some(a => a.severity === 'extreme');

  return (
    <>
      {/* Toggle button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', top: 22, left: '50%', transform: 'translateX(-50%)',
          background: 'rgba(2,5,16,0.88)',
          border: `1px solid ${hasCritical ? '#ff0000' : '#0d2a4a'}`,
          borderRadius: 2, padding: '7px 18px', cursor: 'pointer',
          fontFamily: "'Courier New', monospace",
          fontSize: 10, letterSpacing: '0.25em', color: hasCritical ? '#ff0000' : '#2a5a8a',
          textTransform: 'uppercase', zIndex: 25, display: 'flex', alignItems: 'center', gap: 8,
        }}
      >
        {hasCritical && <span style={{ width: 7, height: 7, background: '#ff0000', borderRadius: '50%', display: 'inline-block', animation: 'blink 1.2s infinite' }} />}
        Anomalies
        {count > 0 && (
          <span style={{ background: hasCritical ? '#ff0000' : '#0d2a4a', color: '#fff', borderRadius: 2, padding: '1px 6px', fontSize: 10 }}>
            {count}
          </span>
        )}
      </button>

      {/* Feed panel */}
      {open && (
        <div style={{
          position: 'fixed', top: 70, left: '50%', transform: 'translateX(-50%)',
          width: 360, maxHeight: 420, overflowY: 'auto',
          background: 'rgba(2,5,16,0.96)', border: '1px solid #0d2a4a',
          borderRadius: 2, zIndex: 24,
          fontFamily: "'Courier New', monospace",
          scrollbarWidth: 'none',
        }}>
          {/* Header */}
          <div style={{
            padding: '12px 16px', borderBottom: '1px solid #0d2a4a',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span style={{ fontSize: 9, letterSpacing: '0.35em', color: '#2a4a6a', textTransform: 'uppercase' }}>
              Unusual AQI Events
            </span>
            <span style={{ fontSize: 9, color: '#1a3a5a', letterSpacing: '0.1em' }}>
              80%+ above 30-day avg
            </span>
          </div>

          {loading && (
            <div style={{ padding: '16px', fontSize: 11, color: '#2a4a6a', letterSpacing: '0.2em', textAlign: 'center' }}>
              Scanning...
            </div>
          )}

          {!loading && !count && (
            <div style={{ padding: '16px', fontSize: 11, color: '#1a3a5a', letterSpacing: '0.1em', textAlign: 'center' }}>
              No anomalies detected — air quality within normal range globally
            </div>
          )}

          {anomalies.map(a => {
            const sev  = ANOMALY_SEVERITY[a.severity] || ANOMALY_SEVERITY.elevated;
            const info = aqiInfo(a.currentAqi);
            const src  = a.dominentpol && SOURCE_TAGS[a.dominentpol];
            return (
              <div
                key={a.code}
                onClick={() => { onCountryClick(a.code); setOpen(false); }}
                style={{
                  padding: '12px 16px', borderBottom: '1px solid #060e1e',
                  cursor: 'pointer', background: sev.bg,
                  transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = sev.bg}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 5 }}>
                  <div>
                    <span style={{ fontSize: 12, color: '#c8d8f0', fontWeight: 'bold', letterSpacing: '0.06em' }}>
                      {a.name}
                    </span>
                    {src && <span style={{ fontSize: 10, color: '#3a5a7a', marginLeft: 8 }}>{src.icon}</span>}
                  </div>
                  <span style={{
                    fontSize: 8, letterSpacing: '0.2em', textTransform: 'uppercase',
                    color: sev.color, border: `1px solid ${sev.color}`, borderRadius: 1, padding: '2px 5px',
                  }}>
                    {sev.label}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16, alignItems: 'baseline' }}>
                  <span style={{ fontSize: 22, fontWeight: 'bold', color: info.col, lineHeight: 1 }}>{a.currentAqi}</span>
                  <span style={{ fontSize: 10, color: '#3a5a7a' }}>
                    vs <span style={{ color: '#5a7a9a' }}>{a.baselineAqi}</span> avg
                    <span style={{ color: sev.color, marginLeft: 4 }}>+{a.percentAbove}%</span>
                  </span>
                </div>

                <div style={{ fontSize: 9, color: '#1a3a5a', marginTop: 4, letterSpacing: '0.1em' }}>
                  {info.cat} · Click to zoom
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
