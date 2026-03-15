const axios = require('axios');
const fs = require('fs');
require('dotenv').config({ path: 'd:/Downloads/airvision/airvision/server/.env' });

const BASE = 'https://api.waqi.info';
const TOKEN = process.env.WAQI_TOKEN;

async function fetchIndiaStations() {
  const lat1 = 6; const lng1 = 68;
  const lat2 = 38; const lng2 = 98;
  const url = `${BASE}/map/bounds/?latlng=${lat1},${lng1},${lat2},${lng2}&token=${TOKEN}`;
  
  try {
    const { data } = await axios.get(url);
    if (data.status !== 'ok') {
      console.log('Error ok:', data);
      return;
    }
    
    // Filter for stations in India
    const stations = data.data
      .filter(s => s.station.name.toLowerCase().includes('india'))
      .map(s => s.station.name)
      .sort();
      
    const unique = [...new Set(stations)];
    fs.writeFileSync('d:/Downloads/airvision/airvision/server/india_stations_list.json', JSON.stringify(unique, null, 2));
    console.log('Saved ' + unique.length + ' stations.');
  } catch (err) {
    console.error(err);
  }
}
fetchIndiaStations();
