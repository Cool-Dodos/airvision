const axios = require('axios');
require('dotenv').config({ path: 'd:/Downloads/airvision/airvision/server/.env' });

const BASE = 'https://api.waqi.info';
const TOKEN = process.env.WAQI_TOKEN;

async function fetchIndiaStations() {
  if (!TOKEN) {
    console.error('WAQI_TOKEN not found in .env');
    return;
  }
  
  // Broad bounding box for India
  const lat1 = 6;
  const lng1 = 68;
  const lat2 = 38;
  const lng2 = 98;
  
  const url = `${BASE}/map/bounds/?latlng=${lat1},${lng1},${lat2},${lng2}&token=${TOKEN}`;
  
  try {
    console.log('Fetching India stations from WAQI...');
    const { data } = await axios.get(url);
    if (data.status !== 'ok') {
      console.error('API Error:', data.data);
      return;
    }
    
    const stations = data.data.map(s => s.station.name);
    const uniqueStations = [...new Set(stations)].sort();
    
    console.log(`Found ${uniqueStations.length} unique stations.`);
    console.log('\n--- STATION LIST ---');
    console.log(JSON.stringify(uniqueStations, null, 2));
    
  } catch (err) {
    console.error('Fetch failed:', err.message);
  }
}

fetchIndiaStations();
