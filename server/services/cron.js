const cron = require('node-cron');
const { fetchAllCountries, fetchIndiaStates } = require('./waqi');
const { updateDailyAverages, detectAnomalies } = require('./analytics');
const AqiSnapshot = require('../models/AqiSnapshot');
const StateSnapshot = require('../models/StateSnapshot');

let cachedAnomalies = [];
let anomalyCachedAt = null;
function getCachedAnomalies() { return { anomalies: cachedAnomalies, cachedAt: anomalyCachedAt }; }

async function runFetch() {
  console.log(`[${new Date().toISOString()}] Global AQI aggregation fetch started...`);
  try {
    const { fetchGlobalAggregation, fetchIndiaStates } = require('./waqi');
    
    // 1. Fetch data
    const [globalResults, indiaStates] = await Promise.all([
      fetchGlobalAggregation(),
      fetchIndiaStates()
    ]);

    const { countryData, stations } = globalResults;

    // 2. Update India State Snapshots
    if (Object.keys(indiaStates).length > 0) {
      await StateSnapshot.create({
        countryCode: 'IN',
        states: indiaStates,
        fetchedAt: new Date()
      });
    }

    const lastSnapshot = await AqiSnapshot.findOne().sort({ fetchedAt: -1 });
    const countryAverages = new Map();

    // 3. Persistence: Keep last known data for countries not found in current fetch
    if (lastSnapshot && lastSnapshot.countryAverages) {
      for (const [code, data] of lastSnapshot.countryAverages.entries()) {
        countryAverages.set(code, data);
      }
    }

    // 4. Overwrite/Update with fresh global aggregates
    for (const [code, d] of Object.entries(countryData)) {
      countryAverages.set(code, {
        name: d.countryName, 
        avgAqi: d.aqi, 
        maxAqi: d.maxAqi, 
        minAqi: d.minAqi,
        stationCount: d.stationCount, 
        dominentpol: d.dominentpol, 
        city: d.city, 
        time: d.time,
      });
    }

    // 5. Create final snapshot with station points for the Globe
    await AqiSnapshot.create({ 
      countryAverages, 
      stations,
      fetchedAt: new Date() 
    });

    const plainData = {};
    for (const [code, val] of countryAverages.entries()) plainData[code] = val;
    await updateDailyAverages(plainData);

    cachedAnomalies = await detectAnomalies(plainData);
    anomalyCachedAt = new Date();

    const old = await AqiSnapshot.find().sort({ fetchedAt: -1 }).skip(48);
    if (old.length) await AqiSnapshot.deleteMany({ _id: { $in: old.map(o => o._id) } });

    const oldStates = await StateSnapshot.find().sort({ fetchedAt: -1 }).skip(48);
    if (oldStates.length) await StateSnapshot.deleteMany({ _id: { $in: oldStates.map(o => o._id) } });

    console.log(`[${new Date().toISOString()}] Done — ${countryAverages.size} countries, ${Object.keys(indiaStates).length} India states, ${cachedAnomalies.length} anomalies`);
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
