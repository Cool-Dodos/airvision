const { fetchCityAQI } = require('./server/services/waqi');
require('dotenv').config({ path: './server/.env' });

async function test() {
  console.log('Testing WAQI API for wind data...');
  const data = await fetchCityAQI('delhi');
  console.log('Raw Data for Delhi:', JSON.stringify(data, null, 2));
}

test();
