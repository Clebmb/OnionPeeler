const tr = require('tor-request');
const cheerio = require('cheerio');
const Site = require('./models/Site');

class Crawler {
  constructor(wsServer) {
    this.wsServer = wsServer;
    this.isRunning = false;
    
    // Configure Tor ports correctly for this version of tor-request
    const torHost = '127.0.0.1';
    const torSocksPort = parseInt(process.env.TOR_SOCKS_PORT) || 9050;
    
    if (typeof tr.setTorAddress === 'function') {
      tr.setTorAddress(torHost, torSocksPort);
    }
    
    tr.TorControlPort = parseInt(process.env.TOR_CONTROL_PORT) || 9051;

    this.config = {
      depth: 1,
      delay: 2000,
      targets: []
    };

    // Default seeds for "random" discovery
    this.defaultSeeds = [
      'https://check.torproject.org/',                                         // To verify Tor is working
      'http://zqktlwiuavvvqqt4ybvgvi7tyo4hcygpbtf7z3ot67rcrtcvege33kid.onion/', // Hidden Wiki
      'http://v2c7yx7io6kv7u7bm2i6is7z3zeaac6cf3ax26ox67v7sh2p5yz6f6yd.onion/', // Ahmia Search
      'http://juhanurmihxlp77nkq76byazcldy2hlreozbe6v67v7sh2p5yz6f6yd.onion/'  // Another directory
    ];

    this.queue = [];
    this.stats = {
      sitesCrawled: 0,
      sitesDiscovered: 0,
      errors: 0
    };
    this.syncStats();
  }

  async syncStats() {
    try {
      const discovered = await Site.countDocuments({ status: 'discovered' });
      const crawled = await Site.countDocuments({ status: 'crawled' });
      const failed = await Site.countDocuments({ status: 'failed' });
      this.stats = {
        sitesCrawled: crawled,
        sitesDiscovered: discovered + crawled + failed,
        errors: failed
      };
      this.broadcastUpdate({ type: 'stats', stats: this.stats });
    } catch (e) {
      console.error('Error syncing stats:', e);
    }
  }

  resetStats() {
    this.stats = {
      sitesCrawled: 0,
      sitesDiscovered: 0,
      errors: 0
    };
    this.broadcastUpdate({ type: 'stats', stats: this.stats });
  }

  setConfig(config) {
    this.config = { ...this.config, ...config };
    
    let targets = [];
    if (this.config.targets && this.config.targets.length > 0) {
      // Split strings if they contain commas or spaces (user copy-paste error)
      this.config.targets.forEach(t => {
        if (typeof t === 'string' && (t.includes(',') || t.includes(' '))) {
          const splitTargets = t.split(/[,\s]+/).filter(url => url.startsWith('http'));
          targets.push(...splitTargets);
        } else {
          targets.push(t);
        }
      });
    }

    // Use default seeds if targets is empty
    this.queue = targets.length > 0 ? [...targets] : [...this.defaultSeeds];
  }

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    
    // If queue is empty, populate with random sites from DB or defaults
    if (this.queue.length === 0) {
      this.populateQueue();
    }

    this.broadcastUpdate({ type: 'status', isRunning: true });
    this.crawlNext();
  }

  async populateQueue() {
    try {
      // Try to get up to 500 random sites from the database that haven't been crawled successfully yet
      const randomSites = await Site.aggregate([
        { $match: { status: 'discovered' } },
        { $sample: { size: 500 } }
      ]);

      if (randomSites.length > 0) {
        this.queue = randomSites.map(s => ({ url: s.url, depth: 1 }));
      } else {
        this.queue = this.defaultSeeds.map(url => ({ url, depth: 0 }));
      }
      
      this.shuffleQueue();
    } catch (e) {
      this.queue = this.defaultSeeds.map(url => ({ url, depth: 0 }));
    }
  }

  shuffleQueue() {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.queue[i], this.queue[j]] = [this.queue[j], this.queue[i]];
    }
  }

  stop() {
    this.isRunning = false;
    this.broadcastUpdate({ type: 'status', isRunning: false });
  }

  broadcastUpdate(data) {
    if (this.wsServer) {
      this.wsServer.clients.forEach(client => {
        if (client.readyState === 1) { // WebSocket.OPEN
          client.send(JSON.stringify(data));
        }
      });
    }
  }

  async crawlNext() {
    if (!this.isRunning || this.queue.length === 0) {
      if (this.queue.length === 0) this.stop();
      return;
    }

    // Queue now stores objects: { url, depth }
    const item = this.queue.shift();
    const targetUrl = typeof item === 'string' ? item : item.url;
    const currentDepth = typeof item === 'object' ? item.depth : 0;
    
    try {
      let site = await Site.findOne({ url: targetUrl });
      if (!site) {
        site = new Site({ url: targetUrl });
        this.stats.sitesDiscovered++;
      }

      if (site.status === 'crawled' && currentDepth > 0) {
        // Skip already crawled if we're deep, but if it's a seed, we might want to re-check
        this.scheduleNext();
        return;
      }

      this.broadcastUpdate({ type: 'crawling', url: targetUrl });

      const html = await this.fetchUrl(targetUrl);
      const $ = cheerio.load(html);
      
      const title = $('title').text() || 'Unknown Title';
      const textContent = $('body').text().replace(/\s+/g, ' ').trim();
      const discoveredLinks = [];
      
      const baseUrl = new URL(targetUrl);

      $('a').each((i, el) => {
        let href = $(el).attr('href');
        if (!href) return;

        try {
          // Handle relative links
          if (href.startsWith('/')) {
            href = `${baseUrl.origin}${href}`;
          } else if (!href.startsWith('http')) {
            // Probably relative to current path, but let's keep it simple for now
            return;
          }

          if (href.includes('.onion')) {
            // UNWRAP REDIRECTS: If it's a redirect link, extract the destination
            if (href.includes('url=http')) {
              const urlMatch = href.match(/url=(https?:\/\/[^\&]+)/i);
              if (urlMatch) {
                const decodedUrl = decodeURIComponent(urlMatch[1]);
                if (decodedUrl.includes('.onion')) {
                  href = decodedUrl;
                }
              }
            }
            discoveredLinks.push(href);
          }
        } catch (e) {}
      });

      const uniqueLinks = [...new Set(discoveredLinks)];
      console.log(`- Found ${uniqueLinks.length} unique links on ${targetUrl}`);
      
      // Separate internal and external links
      const internalLinks = [];
      const externalLinks = [];
      
      const currentHostMatch = baseUrl.hostname.match(/([^\.]+\.onion)/i);
      const currentOnion = currentHostMatch ? currentHostMatch[1] : null;

      uniqueLinks.forEach(link => {
        try {
          const linkUrl = new URL(link);
          const linkOnionMatch = link.match(/([^\.\/]+\.onion)/i);
          const linkOnion = linkOnionMatch ? linkOnionMatch[1] : null;

          // If the link points to a DIFFERENT onion domain, it's external
          // Even if it's a redirect through the current domain
          if (linkOnion && linkOnion !== currentOnion) {
            externalLinks.push(link);
          } else if (linkUrl.hostname === baseUrl.hostname) {
            internalLinks.push(link);
          } else {
            // Probably a different domain but not an onion, or something else
            externalLinks.push(link);
          }
        } catch (e) {
          externalLinks.push(link);
        }
      });

      // Update site record
      site.title = title;
      site.content = textContent;
      site.status = 'crawled';
      site.lastCrawledAt = new Date();
      site.links = uniqueLinks;
      await site.save();

      this.stats.sitesCrawled++;
      this.broadcastUpdate({ type: 'stats', stats: this.stats });
      this.broadcastUpdate({ type: 'site_discovered', site: site });

      // Add new links to queue if depth limit not reached
      if (currentDepth < this.config.depth) {
        // PRIORITIZE EXTERNAL LINKS for discovery
        // Add all external links
        for (const link of externalLinks) {
          const exists = await Site.exists({ url: link });
          if (!exists) {
            const newSite = new Site({ url: link });
            await newSite.save();
            this.stats.sitesDiscovered++;
          }
          this.queue.push({ url: link, depth: currentDepth + 1 });
        }

        // Limit internal links to prevent getting stuck on one site (e.g., search engine pages)
        // Only add up to 5 internal links per page
        const internalToFollow = internalLinks.slice(0, 5);
        for (const link of internalToFollow) {
          this.queue.push({ url: link, depth: currentDepth + 1 });
        }
      }

      // Periodically shuffle the queue to prevent getting stuck
      if (this.stats.sitesCrawled % 10 === 0) {
        this.shuffleQueue();
      }

    } catch (error) {
      console.error(`Error crawling ${targetUrl}:`, error.message);
      this.stats.errors++;
      try {
        await Site.updateOne({ url: targetUrl }, { status: 'failed' });
      } catch (e) {}
    }

    this.broadcastUpdate({ type: 'stats', stats: this.stats });
    this.scheduleNext();
  }

  fetchUrl(url) {
    return new Promise((resolve, reject) => {
      console.log(`- Fetching: ${url}`);
      tr.request({
        url: url,
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
        },
        agentOptions: {
          keepAlive: true
        }
      }, (err, res, body) => {
        if (err) {
          console.error(`- Fetch Failed for ${url}:`, err.message);
          return reject(err);
        }
        if (res && res.statusCode !== 200) {
          return reject(new Error(`Status ${res.statusCode}`));
        }
        console.log(`- Success: ${url} (${body.length} bytes)`);
        resolve(body);
      });
    });
  }

  scheduleNext() {
    setTimeout(() => {
      this.crawlNext();
    }, this.config.delay);
  }
}

module.exports = Crawler;
