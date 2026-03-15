const cron = require('node-cron');
const { fetchAllCountries } = require('./waqi');
const { updateDailyAverages, detectAnomalies } = require('./analytics');
const AqiSnapshot = require('../models/AqiSnapshot');

let cachedAnomalies = [];
let anomalyCachedAt = null;
function getCachedAnomalies() { return { anomalies: cachedAnomalies, cachedAt: anomalyCachedAt }; }

async function runFetch() {
  console.log(`[${new Date().toISOString()}] AQI fetch started...`);
  try {
    const countryData = await fetchAllCountries();
    const lastSnapshot = await AqiSnapshot.findOne().sort({ fetchedAt: -1 });
    const countryAverages = new Map();

    // 1. Start with last known data to ensure persistence
    if (lastSnapshot && lastSnapshot.countryAverages) {
      for (const [code, data] of lastSnapshot.countryAverages.entries()) {
        countryAverages.set(code, data);
      }
    }

    // 2. Overwrite with fresh data
    for (const [code, d] of Object.entries(countryData)) {
      countryAverages.set(code, {
        name: d.countryName, avgAqi: d.aqi, maxAqi: d.aqi, minAqi: d.aqi,
        stationCount: 1, dominentpol: d.dominentpol, iaqi: d.iaqi, city: d.city, time: d.time,
      });
    }

    await AqiSnapshot.create({ countryAverages, fetchedAt: new Date() });

    const plainData = {};
    for (const [code, val] of countryAverages.entries()) plainData[code] = val;
    await updateDailyAverages(plainData);

    cachedAnomalies = await detectAnomalies(plainData);
    anomalyCachedAt = new Date();

    const old = await AqiSnapshot.find().sort({ fetchedAt: -1 }).skip(48);
    if (old.length) await AqiSnapshot.deleteMany({ _id: { $in: old.map(o => o._id) } });

    console.log(`[${new Date().toISOString()}] Done — ${countryAverages.size} countries, ${cachedAnomalies.length} anomalies`);
  } catch (err) {
    console.error('Cron fetch error:', err.message);
  }
}

function startCronJob() {
  runFetch();
  cron.schedule('*/15 * * * *', runFetch);
  console.log('AQI cron scheduled (every 15 min)');
}

module.exports = { startCronJob, runFetch, getCachedAnomalies };
