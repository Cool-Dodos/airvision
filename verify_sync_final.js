require('dotenv').config({ path: './server/.env' });
const mongoose = require('mongoose');
const { runFetch } = require('./server/services/cron');

async function testSync() {
  try {
    console.log('Connecting to DB at:', process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Starting Manual Sync...');
    await runFetch();
    console.log('Sync Complete.');
    process.exit(0);
  } catch (err) {
    console.error('Test Sync Failed:', err);
    process.exit(1);
  }
}

testSync();
