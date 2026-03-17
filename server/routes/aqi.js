const express = require('express');
const router  = express.Router();
const axios   = require('axios');
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

let cacheIndiaStates = null;
let IndiaStatesCachedAt = null;

// GET /api/aqi/india/states — state-level AQI for India drill-down
router.get('/india/states', async (req, res) => {
  try {
    const now = Date.now();
    const TTL = 30 * 60 * 1000; // 30 minutes

    if (cacheIndiaStates && IndiaStatesCachedAt && (now - IndiaStatesCachedAt < TTL)) {
      return res.json({ ok: true, count: Object.keys(cacheIndiaStates).length, states: cacheIndiaStates, source: 'cache' });
    }

    const states = await fetchIndiaStates();
    cacheIndiaStates = states;
    IndiaStatesCachedAt = now;
    
    res.json({ ok: true, count: Object.keys(states).length, states, source: 'live' });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// Get all global snapshots (last 12h)
router.get('/snapshots', async (req, res) => {
  try {
    const snapshots = await AqiSnapshot.find({}, 'fetchedAt').sort({ fetchedAt: -1 });
    // Map to timestamp for frontend compatibility if needed, or just change frontend
    res.json(snapshots.map(s => ({ timestamp: s.fetchedAt })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

// Get specific snapshot
router.get('/snapshot/:timestamp', async (req, res) => {
  try {
    const ts = new Date(req.params.timestamp);
    const snapshot = await AqiSnapshot.findOne({ fetchedAt: ts });
    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });
    
    // Map fetchedAt to timestamp for frontend and return countries
    const countries = {};
    let total = 0, count = 0;
    for (const [code, data] of snapshot.countryAverages.entries()) {
      countries[code] = data;
      if (data.avgAqi != null) { total += data.avgAqi; count++; }
    }
    const globalAvg = count > 0 ? Math.round((total / count) * 10) / 10 : 0;
    res.json({ fetchedAt: snapshot.fetchedAt, countries, globalAvg });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/aqi/boundaries/:iso2 — proxy for GeoBoundaries to avoid CORS
router.get('/boundaries/:iso2', async (req, res) => {
  const iso2 = req.params.iso2.toUpperCase();
  try {
    const { data: meta } = await axios.get(`https://www.geoboundaries.org/api/current/gbOpen/${iso2}/ADM0/`, { timeout: 8000 });
    if (!meta || !meta.gjDownloadURL) return res.status(404).json({ error: 'Boundary metadata not found' });
    
    const { data: geojson } = await axios.get(meta.gjDownloadURL, { timeout: 15000 });
    const feature = geojson.type === 'FeatureCollection' ? geojson.features[0] : geojson;
    
    res.json(feature);
  } catch (err) {
    console.error(`Boundary fetch failed for ${iso2}:`, err.message);
    res.status(502).json({ error: `Failed to fetch boundary from upstream: ${err.message}` });
  }
});

module.exports = router;
