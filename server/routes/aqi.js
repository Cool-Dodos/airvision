const express = require('express');
const router  = express.Router();
const axios   = require('axios');
const AqiSnapshot     = require('../models/AqiSnapshot');
const StateSnapshot   = require('../models/StateSnapshot');
const { fetchSingleCountry, fetchMapBounds, fetchIndiaStates, COUNTRY_CITIES } = require('../services/waqi');
const { getTrend, detectAnomalies, get30DayAverage } = require('../services/analytics');
const { getCachedAnomalies } = require('../services/cron');

// GET /api/aqi/world — latest snapshot for all countries
router.get('/world', async (req, res) => {
  try {
    const snapshot = await AqiSnapshot.findOne().sort({ fetchedAt: -1 }).lean();
    if (!snapshot) return res.status(503).json({ error: 'Data not ready yet, retry in 30s' });
    const countries = {};
    for (const [code, data] of Object.entries(snapshot.countryAverages || {})) {
      countries[code] = data;
    }
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ fetchedAt: snapshot.fetchedAt, countries, count: Object.keys(countries).length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/aqi/country/:code — detail + trend + prediction for one country
router.get('/country/:code', async (req, res) => {
  const code  = req.params.code.toUpperCase();
  const entry = COUNTRY_CITIES[code];
  if (!entry) return res.status(404).json({ error: 'Country not found' });
  try {
    const snapshot = await AqiSnapshot.findOne().sort({ fetchedAt: -1 }).lean();
    let base = null;
    if (snapshot?.countryAverages?.[code]) {
      const cached = snapshot.countryAverages[code];
      const ageMin = (Date.now() - new Date(snapshot.fetchedAt)) / 60000;
      if (ageMin < 20) {
        base = { source: 'cache', code, countryName: entry.name, ...cached };
      }
    }

    if (!base) {
      const live = await fetchSingleCountry(code);
      if (!live) return res.status(503).json({ error: 'No station data available for this country' });
      base = { source: 'live', code, countryName: entry.name, ...live };
    }

    const trend      = await getTrend(code);
    const baseline30 = await get30DayAverage(code);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ ...base, trend, baseline30 });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/aqi/history/:code — last 12h readings for sparkline
router.get('/history/:code', async (req, res) => {
  const code = req.params.code.toUpperCase();
  try {
    const snapshots = await AqiSnapshot.find().sort({ fetchedAt: -1 }).limit(48).lean();
    const history = snapshots
      .filter(s => s.countryAverages?.[code])
      .map(s => ({ ts: s.fetchedAt, aqi: s.countryAverages[code].avgAqi }))
      .reverse();
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ code, history });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /api/aqi/anomalies — countries 80%+ above 30-day baseline
router.get('/anomalies', expensiveLimiter, async (req, res) => {
  try {
    const { anomalies, cachedAt } = getCachedAnomalies();
    if (!anomalies.length) {
      const snapshot = await AqiSnapshot.findOne().sort({ fetchedAt: -1 }).lean();
      if (!snapshot) return res.json({ anomalies: [], cachedAt: null });
      const plain = snapshot.countryAverages || {};
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
    const TTL = 20 * 60 * 1000; // 20 minutes
    const now = new Date();
    
    // Check MongoDB for latest snapshot
    const latest = await StateSnapshot.findOne({ countryCode: 'IN' }).sort({ fetchedAt: -1 }).lean();
    
    if (latest) {
      if (now - latest.fetchedAt < TTL) {
        return res.json({ ok: true, count: Object.keys(latest.states).length, states: latest.states, source: 'cache_db' });
      } else {
        // Stale data: Return immediately to prevent Vercel 10s timeouts, then fetch in background
        res.json({ ok: true, count: Object.keys(latest.states).length, states: latest.states, source: 'cache_db_stale' });
        
        // Background refresh
        fetchIndiaStates().then(async states => {
          if (Object.keys(states).length > 0) {
            await StateSnapshot.create({
              countryCode: 'IN',
              states: states,
              fetchedAt: new Date()
            });
          }
        }).catch(err => console.error('Background fetch failed for India states:', err.message));
        return;
      }
    }

    // Fetch fresh if NO data AT ALL exists
    const states = await fetchIndiaStates();
    if (Object.keys(states).length > 0) {
      await StateSnapshot.create({
        countryCode: 'IN',
        states: states,
        fetchedAt: now
      });
    }

    res.json({ ok: true, count: Object.keys(states).length, states, source: 'live' });
  } catch (err) { res.status(500).json({ ok: false, error: err.message }); }
});

// GET /api/aqi/snapshots — all snapshot timestamps (limited to last 48h / 96 entries)
router.get('/snapshots', async (req, res) => {
  try {
    const snapshots = await AqiSnapshot.find({}, 'fetchedAt')
      .sort({ fetchedAt: -1 })
      .limit(96) // 96 snapshots at 15min intervals = 24h of history
      .lean();
    res.set('Cache-Control', 'public, max-age=60');
    res.json(snapshots.map(s => ({ timestamp: s.fetchedAt })));
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch snapshots' });
  }
});

// GET /api/aqi/snapshot/:timestamp — single historical snapshot
router.get('/snapshot/:timestamp', async (req, res) => {
  try {
    const ts = new Date(req.params.timestamp);
    if (isNaN(ts.getTime())) return res.status(400).json({ error: 'Invalid timestamp' });

    const snapshot = await AqiSnapshot.findOne({ fetchedAt: ts }).lean();
    if (!snapshot) return res.status(404).json({ error: 'Snapshot not found' });

    const countries = snapshot.countryAverages || {};
    let total = 0, count = 0;
    for (const data of Object.values(countries)) {
      if (data.avgAqi != null) { total += data.avgAqi; count++; }
    }
    const globalAvg = count > 0 ? Math.round((total / count) * 10) / 10 : 0;
    res.json({ fetchedAt: snapshot.fetchedAt, countries, globalAvg });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/aqi/boundaries/:iso2 — proxy for GeoBoundaries (with SSRF guard)
router.get('/boundaries/:iso2', async (req, res) => {
  let iso2 = req.params.iso2.toUpperCase();
  const isoMap = { 'AF': 'AFG', 'IN': 'IND', 'US': 'USA', 'CN': 'CHN' };
  const isoSearch = isoMap[iso2] || iso2; 

  // SSRF guard: strictly validate to exactly 2 uppercase letters
  if (!/^[A-Z]{2}$/.test(iso2)) {
    return res.status(400).json({ error: 'Invalid country code. Must be a 2-letter ISO 3166-1 alpha-2 code.' });
  }

  try {
    const { data: meta } = await axios.get(
      `https://www.geoboundaries.org/api/current/gbOpen/${isoSearch}/ADM0/`,
      { timeout: 7000 }
    ).catch(() => ({ data: null }));

    if (!meta || !meta.gjDownloadURL) {
      return res.status(404).json({ error: `Boundary metadata not found for ${iso2}` });
    }

    const { data: geojson } = await axios.get(meta.gjDownloadURL, { timeout: 12000 });
    const feature = geojson.type === 'FeatureCollection' ? geojson.features[0] : geojson;

    res.json(feature);
  } catch (err) {
    console.warn(`Boundary fetch failed for ${iso2}:`, err.message);
    res.status(503).json({ error: 'Boundary service temporarily unavailable. Please try again.' });
  }
});

// Honeypot route — logs client IP for automated API enumeration detection
router.get('/global-stats-v2', (req, res) => {
  const ip = req.headers['x-forwarded-for']?.split(',')[0] ?? req.ip;
  console.warn('[HONEYPOT] Suspicious client:', ip, req.headers['user-agent']);
  res.json({ count: 0, data: [] }); // Empty but valid response to avoid tipping off scanners
});

module.exports = router;
