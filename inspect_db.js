const mongoose = require('mongoose');
const AqiSnapshot = require('./server/models/AqiSnapshot');
require('dotenv').config({ path: './server/.env' });

async function inspect() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const snapshot = await AqiSnapshot.findOne().sort({ fetchedAt: -1 }).lean();
    if (!snapshot) {
      console.log('No snapshots found.');
      return;
    }

    console.log('Latest Snapshot FetchedAt:', snapshot.fetchedAt);
    
    const codes = ['IR', 'SA', 'IN', 'AF', 'CN'];
    console.log('\nAudit of specific keys in countryAverages:');
    
    for (const code of codes) {
      const data = snapshot.countryAverages[code];
      if (data) {
        console.log(`[${code}]: name="${data.name}", avgAqi=${data.avgAqi}, keys=${Object.keys(data).join(',')}`);
      } else {
        console.log(`[${code}]: MISSING`);
      }
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Inspection failed:', err.message);
  }
}

inspect();
