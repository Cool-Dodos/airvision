const axios = require('axios');

let cachedWind = null;
let lastFetched = 0;
const CACHE_DURATION = 3600 * 1000; // 1 hour

async function fetchGlobalWind() {
  const now = Date.now();
  if (cachedWind && (now - lastFetched < CACHE_DURATION)) {
    return cachedWind;
  }

  try {
    const lats = [];
    const lons = [];
    for (let lat = -90; lat <= 90; lat += 10) {
      for (let lon = -180; lon <= 180; lon += 10) {
        lats.push(lat);
        lons.push(lon);
      }
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lats.join(',')}&longitude=${lons.join(',')}&current=wind_speed_10m,wind_direction_10m`;
    const { data } = await axios.get(url, { timeout: 15000 });

    // Open-Meteo returns an array of objects if multiple points are requested
    const grid = data.map((point, i) => ({
      lat: lats[i],
      lon: lons[i],
      speed: point.current.wind_speed_10m,
      deg: point.current.wind_direction_10m
    }));

    cachedWind = grid;
    lastFetched = now;
    return grid;
  } catch (e) {
    console.error('fetchGlobalWind error:', e.message);
    return cachedWind || [];
  }
}

module.exports = { fetchGlobalWind };
