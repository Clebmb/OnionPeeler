const mongoose = require('mongoose');

const siteSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    unique: true
  },
  title: String,
  content: String,
  status: {
    type: String,
    enum: ['pending', 'crawled', 'failed'],
    default: 'pending'
  },
  discoveredAt: {
    type: Date,
    default: Date.now
  },
  lastCrawledAt: Date,
  links: [String]
});

module.exports = mongoose.model('Site', siteSchema);
