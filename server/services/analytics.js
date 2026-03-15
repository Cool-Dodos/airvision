const AqiSnapshot = require('../models/AqiSnapshot');
const DailyAverage = require('../models/DailyAverage');

// ── Linear regression on array of numbers ─────────────────────────────────
function linearRegression(values) {
  const n = values.length;
  if (n < 2) return { slope: 0, predicted: values[0] || 0 };

  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX  += i;
    sumY  += values[i];
    sumXY += i * values[i];
    sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  // Predict next 6 steps (each step = 15 min → 6 steps = 90 min ≈ next 6h rough estimate)
  const predictions = [];
  for (let i = 1; i <= 24; i++) {  // 24 steps × 15min = 6h
    predictions.push(Math.max(0, Math.round(intercept + slope * (n + i - 1))));
  }

  return { slope, intercept, predictions, lastActual: values[n - 1] };
}

// ── Trend direction from slope ─────────────────────────────────────────────
function trendLabel(slope) {
  if (slope >  5) return { dir: 'rising_fast',  label: 'Rising fast',  arrow: '↑↑', color: '#ff0000' };
  if (slope >  1) return { dir: 'rising',       label: 'Rising',       arrow: '↑',  color: '#ff7e00' };
  if (slope < -5) return { dir: 'falling_fast', label: 'Improving fast', arrow: '↓↓', color: '#00e400' };
  if (slope < -1) return { dir: 'falling',      label: 'Improving',    arrow: '↓',  color: '#66ff66' };
  return              { dir: 'stable',       label: 'Stable',       arrow: '→',  color: '#ffff00' };
}

// ── Get trend + 6h prediction for a country ────────────────────────────────
async function getTrend(countryCode) {
  const snapshots = await AqiSnapshot
    .find({ [`countryAverages.${countryCode}`]: { $exists: true } })
    .sort({ fetchedAt: -1 })
    .limit(8);

  if (snapshots.length < 2) return null;

  const readings = snapshots
    .reverse()
    .map(s => s.countryAverages.get(countryCode)?.avgAqi)
    .filter(v => v != null);

  if (readings.length < 2) return null;

  const regression = linearRegression(readings);
  const trend      = trendLabel(regression.slope);

  return {
    readings,
    slope:          regression.slope,
    trend,
    predictions:    regression.predictions,
    predictedIn6h:  regression.predictions[23] ?? readings[readings.length - 1],
    predictedIn1h:  regression.predictions[3]  ?? readings[readings.length - 1],
    predictedIn3h:  regression.predictions[11] ?? readings[readings.length - 1],
  };
}

// ── Update daily averages (called from cron) ───────────────────────────────
async function updateDailyAverages(countryData) {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

  for (const [code, d] of Object.entries(countryData)) {
    if (!d.avgAqi) continue;
    await DailyAverage.findOneAndUpdate(
      { countryCode: code, date: today },
      {
        $set:  { countryName: d.name, dominentpol: d.dominentpol },
        $push: { /* handled below */ },
        $inc:  { readingCount: 1 },
      },
      { upsert: true }
    );
    // Recompute avg for today
    const existing = await DailyAverage.findOne({ countryCode: code, date: today });
    if (existing) {
      const newAvg = ((existing.avgAqi || d.avgAqi) * Math.max(1, existing.readingCount - 1) + d.avgAqi) / existing.readingCount;
      existing.avgAqi = Math.round(newAvg);
      existing.maxAqi = Math.max(existing.maxAqi || 0, d.avgAqi);
      existing.minAqi = existing.minAqi ? Math.min(existing.minAqi, d.avgAqi) : d.avgAqi;
      await existing.save();
    }
  }

  // Prune anything older than 32 days
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 32);
  const cutoffStr = cutoff.toISOString().slice(0, 10);
  await DailyAverage.deleteMany({ date: { $lt: cutoffStr } });
}

// ── Compute 30-day rolling average per country ─────────────────────────────
async function get30DayAverage(countryCode) {
  const days = await DailyAverage
    .find({ countryCode })
    .sort({ date: -1 })
    .limit(30);
  if (!days.length) return null;
  const avg = days.reduce((s, d) => s + (d.avgAqi || 0), 0) / days.length;
  return Math.round(avg);
}

// ── Detect anomalies across all countries ─────────────────────────────────
async function detectAnomalies(currentCountries) {
  const anomalies = [];

  for (const [code, data] of Object.entries(currentCountries)) {
    const current = data.avgAqi;
    if (!current) continue;

    const baseline = await get30DayAverage(code);

    // If no 30-day data yet, use 12h snapshots as baseline
    let baselineAqi = baseline;
    if (!baselineAqi) {
      const snaps = await AqiSnapshot
        .find({ [`countryAverages.${code}`]: { $exists: true } })
        .sort({ fetchedAt: -1 })
        .limit(48);
      if (snaps.length < 3) continue;
      const vals = snaps.map(s => s.countryAverages.get(code)?.avgAqi).filter(Boolean);
      baselineAqi = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
    }

    if (!baselineAqi) continue;

    const ratio = current / baselineAqi;
    if (ratio >= 1.8) {  // 80% above normal = anomaly
      anomalies.push({
        code,
        name:        data.name,
        currentAqi:  current,
        baselineAqi,
        ratio:       Math.round(ratio * 10) / 10,
        percentAbove: Math.round((ratio - 1) * 100),
        dominentpol: data.dominentpol,
        severity:    ratio >= 3 ? 'extreme' : ratio >= 2.5 ? 'severe' : 'elevated',
      });
    }
  }

  return anomalies.sort((a, b) => b.ratio - a.ratio);
}

module.exports = { getTrend, trendLabel, updateDailyAverages, detectAnomalies, get30DayAverage };
