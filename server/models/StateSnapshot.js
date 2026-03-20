const mongoose = require('mongoose');

const StateDataSchema = new mongoose.Schema({
  aqi: { type: Number, required: true },
  city: { type: String },
  rawName: { type: String, required: true }
}, { _id: false });

const StateSnapshotSchema = new mongoose.Schema({
  countryCode: { type: String, required: true, index: true }, // e.g., 'IN'
  states: {
    type: Map,
    of: StateDataSchema
  },
  fetchedAt: { type: Date, default: Date.now, index: true }
});

// TTL index to auto-prune state caches after 2 hours (more frequent than world data)
StateSnapshotSchema.index({ fetchedAt: 1 }, { expireAfterSeconds: 7200 });

module.exports = mongoose.models.StateSnapshot || mongoose.model('StateSnapshot', StateSnapshotSchema);
