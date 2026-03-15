import { useEffect, useState } from 'react';
import { aqiInfo, POLLUTANT_LABELS } from '../utils/aqi';
import { safeOutdoorTime, bestHourAdvice, maskAdvice, POLLUTANT_EFFECTS, SOURCE_TAGS } from '../utils/health';

const S = {
  panel: {
    position: 'fixed', right: 24, top: '50%', transform: 'translateY(-50%)',
    width: 260, maxHeight: '88vh', overflowY: 'auto',
    background: 'rgba(2,5,16,0.95)', border: '1px solid #0d2a4a',
    borderRadius: 2, padding: '20px 18px', zIndex: 20,
    fontFamily: "'Courier New', monospace", color: '#8ba4c8',
    scrollbarWidth: 'none',
  },
  sectionLabel: { fontSize: 9, letterSpacing: '0.35em', color: '#2a4a6a', textTransform: 'uppercase', marginBottom: 10 },
  divider:      { border: 'none', borderTop: '1px solid #0a1e38', margin: '14px 0' },
  row:          { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', fontSize: 11, marginBottom: 8, color: '#3a5a7a' },
  val:          { color: '#8ba4c8', letterSpacing: '0.05em', textAlign: 'right', maxWidth: 130 },
  close:        { position: 'absolute', top: 10, right: 12, cursor: 'pointer', fontSize: 13, color: '#2a4a6a' },
};

export default function InfoPanel({ countryCode, onClose }) {
  const [detail,  setDetail]  = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countryCode) return;
    setLoading(true); setDetail(null); setHistory([]);
    Promise.all([
      fetch(`/api/aqi/country/${countryCode}`).then(r => r.json()),
      fetch(`/api/aqi/history/${countryCode}`).then(r => r.json()),
    ]).then(([d, h]) => {
      setDetail(d);
      setHistory(h.history || []);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [countryCode]);

  if (!countryCode) return null;

  const aqi       = detail?.avgAqi ?? detail?.aqi;
  const info      = aqi != null ? aqiInfo(aqi) : null;
  const dom       = detail?.dominentpol;
  const polEff    = dom && POLLUTANT_EFFECTS[dom];
  const sourceTag = dom && SOURCE_TAGS[dom];
  const safeTime  = safeOutdoorTime(aqi);
  const bestHour  = bestHourAdvice(aqi, dom);
  const mask      = maskAdvice(aqi);
  const trend     = detail?.trend;
  const spark     = history.slice(-12);
  const maxV      = Math.max(...spark.map(s => s.aqi), 1);
  const SW = 210, SH = 38;
  const preds     = trend?.predictions?.slice(0, 8) ?? [];

  return (
    <div style={{ ...S.panel, borderLeft: `2px solid ${info?.col || '#0d2a4a'}` }}>
      <span style={S.close} onClick={onClose}>✕</span>

      <div style={S.sectionLabel}>Selected Region</div>
      {loading && <div style={{ color: '#2a4a6a', fontSize: 11, letterSpacing: '0.2em' }}>Loading...</div>}

      {detail && info && <>
        <div style={{ fontSize: 14, color: '#c8d8f0', fontWeight: 'bold', marginBottom: 2, letterSpacing: '0.06em' }}>
          {detail.countryName || detail.name}
        </div>
        {detail.city && <div style={{ fontSize: 9, color: '#1a3a5a', marginBottom: 10, letterSpacing: '0.15em' }}>{detail.city}</div>}

        {/* AQI + trend arrow */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 4 }}>
          <div style={{ fontSize: 56, fontWeight: 'bold', lineHeight: 1, color: info.col }}>{aqi}</div>
          {trend && (
            <div style={{ paddingBottom: 8 }}>
              <div style={{ fontSize: 22, color: trend.trend.color }}>{trend.trend.arrow}</div>
              <div style={{ fontSize: 9, color: trend.trend.color, letterSpacing: '0.12em', marginTop: 2 }}>{trend.trend.label}</div>
            </div>
          )}
        </div>
        <div style={{ fontSize: 10, letterSpacing: '0.2em', color: info.col, textTransform: 'uppercase', marginBottom: 4 }}>{info.cat}</div>
        {sourceTag && <div style={{ fontSize: 10, color: '#3a5a7a', marginBottom: 14 }}>{sourceTag.icon} {sourceTag.tag}</div>}

        {/* Sparkline + forecast */}
        {spark.length > 1 && <>
          <hr style={S.divider} />
          <div style={S.sectionLabel}>History + 6h Forecast</div>
          <svg width={SW} height={SH} style={{ display: 'block', marginBottom: 8 }}>
            <polyline
              points={spark.map((s, i) => `${(i / (spark.length - 1)) * (SW * 0.65)},${SH - (s.aqi / maxV) * (SH - 4) - 2}`).join(' ')}
              fill="none" stroke={info.col} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"
            />
            {preds.length > 0 && (
              <polyline
                points={preds.map((v, i) => {
                  const x = SW * 0.65 + (i / (preds.length - 1)) * (SW * 0.32);
                  const y = SH - (v / maxV) * (SH - 4) - 2;
                  return `${x},${y}`;
                }).join(' ')}
                fill="none" stroke={info.col} strokeWidth="1" strokeDasharray="3 3" opacity="0.6"
              />
            )}
            <line x1={SW * 0.65} y1={0} x2={SW * 0.65} y2={SH} stroke="#0d2a4a" strokeWidth="1" strokeDasharray="2 2" />
            <text x={SW * 0.67} y={9} style={{ fontSize: 7, fill: '#1a3a5a', fontFamily: 'monospace' }}>forecast →</text>
          </svg>

          {trend && (
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              {[['1h', trend.predictedIn1h], ['3h', trend.predictedIn3h], ['6h', trend.predictedIn6h]].map(([lbl, val]) => (
                <div key={lbl} style={{ flex: 1, background: '#070f22', borderRadius: 2, padding: '6px 0', textAlign: 'center' }}>
                  <div style={{ fontSize: 9, color: '#1a3a5a', letterSpacing: '0.12em' }}>{lbl}</div>
                  <div style={{ fontSize: 16, fontWeight: 'bold', color: aqiInfo(val).col }}>{val}</div>
                </div>
              ))}
            </div>
          )}
        </>}

        {/* Health dashboard */}
        <hr style={S.divider} />
        <div style={S.sectionLabel}>Health Advisory</div>
        <div style={S.row}>Healthy adults<span style={S.val}>{safeTime.healthy}</span></div>
        <div style={S.row}>Sensitive groups<span style={S.val}>{safeTime.sensitive}</span></div>
        <div style={S.row}>Children / Elderly
          <span style={{ ...S.val, color: safeTime.children === 'Stay in' ? '#ff0000' : '#8ba4c8' }}>{safeTime.children}</span>
        </div>
        <div style={S.row}>Best time outside<span style={{ ...S.val, fontSize: 10 }}>{bestHour}</span></div>
        <div style={S.row}>Mask
          <span style={{ ...S.val, color: mask.needed ? '#ff7e00' : '#00e400' }}>{mask.type}</span>
        </div>
        {mask.needed && <div style={{ fontSize: 10, color: '#ff7e00', marginBottom: 8, textAlign: 'right' }}>{mask.note}</div>}

        {/* Pollutant readings */}
        <hr style={S.divider} />
        <div style={S.sectionLabel}>Pollutant Readings</div>
        {detail.iaqi && Object.entries(POLLUTANT_LABELS).map(([key, label]) => {
          const val = detail.iaqi?.[key];
          if (val === null || val === undefined) return null;
          return (
            <div key={key} style={S.row}>
              {label}
              <span style={{ ...S.val, color: dom === key ? info.col : '#8ba4c8' }}>
                {typeof val === 'number' ? val.toFixed(1) : val}
                {key === 'pm25' || key === 'pm10' ? ' μg/m³' : ' ppb'}
                {dom === key && ' ●'}
              </span>
            </div>
          );
        })}

        {/* Dominant pollutant effect card */}
        {polEff && <>
          <hr style={S.divider} />
          <div style={S.sectionLabel}>Primary Concern</div>
          <div style={{ background: '#070f22', borderRadius: 2, padding: '10px 12px', borderLeft: `2px solid ${polEff.color}` }}>
            <div style={{ fontSize: 11, color: polEff.color, fontWeight: 'bold', marginBottom: 4 }}>{polEff.label}</div>
            <div style={{ fontSize: 10, color: '#3a5a7a', marginBottom: 4 }}>Source: {polEff.source}</div>
            <div style={{ fontSize: 10, color: '#5a7a9a', lineHeight: 1.6 }}>{polEff.effect}</div>
          </div>
        </>}

        <hr style={S.divider} />
        <div style={{ fontSize: 10, color: '#3a5a7a', lineHeight: 1.7 }}>{info.advice}</div>

        {detail.baseline30 && (
          <div style={{ marginTop: 12, fontSize: 10, color: '#1a3a5a' }}>
            30-day avg: <span style={{ color: aqiInfo(detail.baseline30).col }}>{detail.baseline30}</span>
            {aqi > detail.baseline30 * 1.5 && <span style={{ color: '#ff7e00' }}> ↑ above normal</span>}
            {aqi < detail.baseline30 * 0.7 && <span style={{ color: '#00e400' }}> ↓ better than usual</span>}
          </div>
        )}
      </>}
    </div>
  );
}
