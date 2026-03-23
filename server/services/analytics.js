const AqiSnapshot  = require('../models/AqiSnapshot');
const DailyAverage = require('../models/DailyAverage');

// ── Linear regression ──────────────────────────────────────────────────────
function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, predicted: values[0] || 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX  += i; sumY  += values[i];
    sumXY += i * values[i]; sumX2 += i * i;
  }
  const slope     = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;
  const predictions = [];
  for (let i = 1; i <= 24; i++) {
    predictions.push(Math.max(0, Math.round(intercept + slope * (n + i - 1))));
  }
  return { slope, intercept, predictions, lastActual: values[n - 1] };
}

function trendLabel(slope) {
  if (slope >  5) return { dir: 'rising_fast',  label: 'Rising fast',    arrow: '↑↑', color: '#ff0000' };
  if (slope >  1) return { dir: 'rising',       label: 'Rising',         arrow: '↑',  color: '#ff7e00' };
  if (slope < -5) return { dir: 'falling_fast', label: 'Improving fast', arrow: '↓↓', color: '#00e400' };
  if (slope < -1) return { dir: 'falling',      label: 'Improving',      arrow: '↓',  color: '#66ff66' };
  return                  { dir: 'stable',       label: 'Stable',         arrow: '→',  color: '#ffff00' };
}

// ── Trend + 6h prediction ──────────────────────────────────────────────────
async function getTrend(countryCode) {
  const snapshots = await AqiSnapshot
    .find().sort({ fetchedAt: -1 }).limit(8).lean();
  const readings = snapshots
    .reverse()
    .map(s => s.countryAverages?.[countryCode]?.avgAqi)
    .filter(v => v != null);
  if (readings.length < 2) return null;
  const regression = linearRegression(readings);
  const trend      = trendLabel(regression.slope);
  return {
    readings, slope: regression.slope, trend,
    predictions:   regression.predictions,
    predictedIn6h: regression.predictions[23] ?? readings[readings.length - 1],
    predictedIn1h: regression.predictions[3]  ?? readings[readings.length - 1],
    predictedIn3h: regression.predictions[11] ?? readings[readings.length - 1],
  };
}

// ── Update daily averages ──────────────────────────────────────────────────
async function updateDailyAverages(countryData) {
  const today = new Date().toISOString().slice(0, 10);

  for (const [code, d] of Object.entries(countryData)) {
    if (!d.avgAqi) continue;
    await DailyAverage.findOneAndUpdate(
      { countryCode: code, date: today },
      { $set: { countryName: d.name, dominentpol: d.dominentpol }, $inc: { readingCount: 1 } },
      { upsert: true }
    );
    const existing = await DailyAverage.findOne({ countryCode: code, date: today });
    if (existing) {
      // On first write, readingCount is 1, so prevCount becomes 0 — prevents div-by-zero
      const prevCount = Math.max(1, existing.readingCount - 1);
      const prevAvg   = existing.avgAqi ?? d.avgAqi; // null guard
      const newAvg    = (prevAvg * prevCount + d.avgAqi) / existing.readingCount;
      existing.avgAqi = isNaN(newAvg) ? d.avgAqi : Math.round(newAvg);
      existing.maxAqi = Math.max(existing.maxAqi || 0, d.avgAqi);
      existing.minAqi = existing.minAqi != null ? Math.min(existing.minAqi, d.avgAqi) : d.avgAqi;
      await existing.save();
    }
  }

  // Remove daily averages older than 32 days to bound DB growth
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 32);
  await DailyAverage.deleteMany({ date: { $lt: cutoff.toISOString().slice(0, 10) } });
}

// ── 30-day average ─────────────────────────────────────────────────────────
async function get30DayAverage(countryCode) {
  const days = await DailyAverage
    .find({ countryCode }).sort({ date: -1 }).limit(30).lean();
  if (!days.length) return null;
  const avg = days.reduce((s, d) => s + (d.avgAqi || 0), 0) / days.length;
  return Math.round(avg);
}

// Detects AQI anomalies using a single batch query across all countries
async function detectAnomalies(currentCountries) {
  const codes = Object.keys(currentCountries).filter(c => currentCountries[c]?.avgAqi != null);
  if (!codes.length) return [];

  // Single batch query for all 30-day history
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  const dailyDocs = await DailyAverage.find({
    countryCode: { $in: codes },
    date: { $gte: cutoffStr },
  }).lean();

  // Group per-country daily averages from the batch query result
  const baselineMap = {};
  for (const doc of dailyDocs) {
    if (!baselineMap[doc.countryCode]) baselineMap[doc.countryCode] = [];
    if (doc.avgAqi) baselineMap[doc.countryCode].push(doc.avgAqi);
  }

  // For countries with no daily history, fall back to the last 48 snapshots
  const missingCodes = codes.filter(c => !baselineMap[c]?.length);
  if (missingCodes.length) {
    const snaps = await AqiSnapshot.find().sort({ fetchedAt: -1 }).limit(48).lean();
    for (const code of missingCodes) {
      const vals = snaps
        .map(s => s.countryAverages?.[code]?.avgAqi)
        .filter(Boolean);
      if (vals.length >= 3) baselineMap[code] = vals;
    }
  }

  const anomalies = [];
  for (const [code, data] of Object.entries(currentCountries)) {
    const current = data.avgAqi;
    if (!current) continue;
    const vals = baselineMap[code];
    if (!vals?.length) continue;
    const baselineAqi = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    if (!baselineAqi) continue;
    const ratio = current / baselineAqi;
    if (ratio >= 1.8) {
      anomalies.push({
        code, name: data.name, currentAqi: current, baselineAqi,
        ratio:        Math.round(ratio * 10) / 10,
        percentAbove: Math.round((ratio - 1) * 100),
        dominentpol:  data.dominentpol,
        severity:     ratio >= 3 ? 'extreme' : ratio >= 2.5 ? 'severe' : 'elevated',
      });
    }
  }
  return anomalies.sort((a, b) => b.ratio - a.ratio);
}

module.exports = { getTrend, trendLabel, updateDailyAverages, detectAnomalies, get30DayAverage };
