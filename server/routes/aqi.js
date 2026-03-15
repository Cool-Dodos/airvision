const express = require('express');
const router  = express.Router();
const AqiSnapshot   = require('../models/AqiSnapshot');
const { fetchSingleCountry, fetchMapBounds, fetchIndiaStates, COUNTRY_CITIES } = require('../services/waqi');
const { getTrend, detectAnomalies, get30DayAverage } = require('../services/analytics');
const { getCachedAnomalies } = require('../services/cron');

// GET /api/aqi/world — latest snapshot for all countries
router.get('/world', async (req, res) => {
  try {
    const snapshot = await AqiSnapshot.findOne().sort({ fetchedAt: -1 });
    if (!snapshot) return res.status(503).json({ error: 'Data not ready yet, retry in 30s' });
    const countries = {};
    for (const [code, data] of snapshot.countryAverages.entries()) countries[code] = data;
    res.json({ fetchedAt: snapshot.fetchedAt, countries, count: snapshot.countryAverages.size });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/aqi/country/:code — detail + trend + prediction for one country
router.get('/country/:code', async (req, res) => {
  const code  = req.params.code.toUpperCase();
  const entry = COUNTRY_CITIES[code];
  if (!entry) return res.status(404).json({ error: 'Country not found' });
  try {
    // Try cache first (< 20 min old)
    const snapshot = await AqiSnapshot.findOne().sort({ fetchedAt: -1 });
    let base = null;
    if (snapshot?.countryAverages.has(code)) {
      const cached = snapshot.countryAverages.get(code);
      const ageMin = (Date.now() - snapshot.fetchedAt) / 60000;
      if (ageMin < 20) base = { source: 'cache', code, countryName: entry.name, ...cached };
    }

    // Live fetch if cache stale or missing
    if (!base) {
      const live = await fetchSingleCountry(code);
      if (!live) return res.status(503).json({ error: 'No station data available for this country' });
      base = { source: 'live', code, countryName: entry.name, ...live };
    }

    const trend      = await getTrend(code);
    const baseline30 = await get30DayAverage(code);
    res.json({ ...base, trend, baseline30 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/aqi/history/:code — last 12h readings for sparkline
router.get('/history/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  try {
    const snapshots = await AqiSnapshot.find().sort({ fetchedAt: -1 }).limit(48);
    const history = snapshots
      .filter(s => s.countryAverages.has(code))
      .map(s => ({ ts: s.fetchedAt, aqi: s.countryAverages.get(code).avgAqi }))
      .reverse();
    res.json({ code, history });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/aqi/anomalies — countries 80%+ above 30-day baseline
router.get('/anomalies', async (req, res) => {
  try {
    const { anomalies, cachedAt } = getCachedAnomalies();
    if (!anomalies.length) {
      const snapshot = await AqiSnapshot.findOne().sort({ fetchedAt: -1 });
      if (!snapshot) return res.json({ anomalies: [], cachedAt: null });
      const plain = {};
      for (const [code, val] of snapshot.countryAverages.entries()) plain[code] = val;
      const live = await detectAnomalies(plain);
      return res.json({ anomalies: live, cachedAt: new Date() });
    }
    res.json({ anomalies, cachedAt });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/aqi/stations — raw station dots for globe
router.get('/stations', async (req, res) => {
  try {
    const stations = await fetchMapBounds();
    res.json({ count: stations.length, stations });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/aqi/india/states — state-level AQI for India drill-down
router.get('/india/states', async (req, res) => {
  try {
    const states = await fetchIndiaStates();
    res.json({ ok: true, count: Object.keys(states).length, states });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

module.exports = router;
