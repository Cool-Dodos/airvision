const axios = require('axios');

async function test() {
  try {
    console.log('Testing /api/aqi/world...');
    const world = await axios.get('http://localhost:5000/api/aqi/world');
    console.log('World count:', world.data.count);
    const firstKey = Object.keys(world.data.countries)[0];
    console.log('Sample country (World):', firstKey, JSON.stringify(world.data.countries[firstKey]).substring(0, 100));

    console.log('\nTesting /api/aqi/country/IN...');
    const india = await axios.get('http://localhost:5000/api/aqi/country/IN');
    console.log('India keys:', Object.keys(india.data));
    console.log('India data:', JSON.stringify(india.data).substring(0, 200));

    if (india.data._doc || india.data.$__) {
      console.error('\n!!! FAILURE: Mongoose metadata detected in response !!!');
    } else {
      console.log('\nSUCCESS: No Mongoose metadata found.');
    }
  } catch (err) {
    console.error('Test failed:', err.message);
  }
}

test();
