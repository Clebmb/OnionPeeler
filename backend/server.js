require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { WebSocketServer } = require('ws');
const http = require('http');
const Crawler = require('./crawler');
const Site = require('./models/Site');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

let crawler;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// WebSocket setup
wss.on('connection', (ws) => {
  console.log('Client connected');
  if (crawler) {
    ws.send(JSON.stringify({ type: 'status', isRunning: crawler.isRunning }));
    ws.send(JSON.stringify({ type: 'stats', stats: crawler.stats }));
  }
  
  ws.on('close', () => {
    console.log('Client disconnected');
  });
});

crawler = new Crawler(wss);

// API Routes
app.post('/api/crawler/start', (req, res) => {
  crawler.start();
  res.json({ message: 'Crawler started' });
});

app.post('/api/crawler/stop', (req, res) => {
  crawler.stop();
  res.json({ message: 'Crawler stopped' });
});

app.post('/api/crawler/config', (req, res) => {
  const { depth, delay, targets } = req.body;
  crawler.setConfig({ depth, delay, targets });
  res.json({ message: 'Configuration updated', config: crawler.config });
});

app.get('/api/crawler/stats', (req, res) => {
  res.json(crawler.stats);
});

app.get('/api/sites', async (req, res) => {
  try {
    const sites = await Site.find().sort({ discoveredAt: -1 }).limit(100);
    res.json(sites);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sites', async (req, res) => {
  try {
    await Site.deleteMany({});
    crawler.resetStats();
    res.json({ message: 'Database cleared' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/sites/:id', async (req, res) => {
  try {
    await Site.findByIdAndDelete(req.params.id);
    res.json({ message: 'Site deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/sites/import', async (req, res) => {
  try {
    const sitesData = req.body;
    const ops = sitesData.map(site => ({
      updateOne: {
        filter: { url: site.url },
        update: { $set: site },
        upsert: true
      }
    }));
    await Site.bulkWrite(ops);
    res.json({ message: 'Import successful' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
