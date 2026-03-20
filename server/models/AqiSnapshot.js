const mongoose = require('mongoose');

const StationSchema = new mongoose.Schema({
  lat: Number,
  lon: Number,
  aqi: Number,
  stationName: String,
  countryCode: String,
  countryName: String,
}, { _id: false });

// Typed sub-schema for each country's averaged data (patch 4.2)
const CountryDataSchema = new mongoose.Schema({
  name:         { type: String },
  avgAqi:       { type: Number },
  maxAqi:       { type: Number },
  minAqi:       { type: Number },
  stationCount: { type: Number },
  dominentpol:  { type: String },
  city:         { type: String },
  time:         { type: String },
  iaqi: new mongoose.Schema({
    pm25: Number,
    pm10: Number,
    no2:  Number,
    o3:   Number,
    co:   Number,
    so2:  Number,
  }, { _id: false })
}, { _id: false });

const AqiSnapshotSchema = new mongoose.Schema({
  fetchedAt: {
    type:    Date,
    default: Date.now,
    index:   true,
  },
  stations: [StationSchema],
  countryAverages: {
    type: Map,
    of:   CountryDataSchema,
  },
}, {
  timestamps: false,
  versionKey: false,
});

// Compound index for sort-by-time queries (patch 4.2)
AqiSnapshotSchema.index({ fetchedAt: -1 });

// TTL index — auto-delete snapshots older than 25 hours (patch 4.5)
// 25h = 90000 seconds; gives 1h buffer so 24h of data is always available
AqiSnapshotSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 90000 });

module.exports = mongoose.models.AqiSnapshot || mongoose.model('AqiSnapshot', AqiSnapshotSchema);

