import { useState, useEffect } from 'react';
import { Database, Play, Square, RefreshCcw, Copy, Check, Trash2, Download, Upload, FileJson, FileSpreadsheet } from 'lucide-react';

const API_BASE = 'http://localhost:5000/api';
const WS_URL = 'ws://localhost:5000';

function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [stats, setStats] = useState({ sitesCrawled: 0, sitesDiscovered: 0, errors: 0 });
  const [sites, setSites] = useState([]);
  const [config, setConfig] = useState({ depth: 1, delay: 2000, targets: 'http://zqktlwiuavvvqqt4ybvgvi7tyo4hjl5xgfuvpdf6otjiycgwqbym2qad.onion' });
  const [currentCrawl, setCurrentCrawl] = useState('');
  const [copiedUrl, setCopiedUrl] = useState('');
  const [showExportMenu, setShowExportMenu] = useState(false);
  
  useEffect(() => {
    fetchSites();
    
    const ws = new WebSocket(WS_URL);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'status') {
        setIsRunning(data.isRunning);
      } else if (data.type === 'stats') {
        setStats(data.stats);
      } else if (data.type === 'crawling') {
        setCurrentCrawl(data.url);
      } else if (data.type === 'site_discovered') {
        setSites(prev => {
          const newSites = [data.site, ...prev.filter(s => s.url !== data.site.url)];
          return newSites.slice(0, 100);
        });
      }
    };
    
    return () => ws.close();
  }, []);

  const fetchSites = async () => {
    try {
      const res = await fetch(`${API_BASE}/sites`);
      const data = await res.json();
      setSites(data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleStart = async () => {
    try {
      await fetch(`${API_BASE}/crawler/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, targets: config.targets.split('\n').filter(t => t.trim() !== '') })
      });
      await fetch(`${API_BASE}/crawler/start`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  const handleStop = async () => {
    try {
      await fetch(`${API_BASE}/crawler/stop`, { method: 'POST' });
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (url) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    setTimeout(() => setCopiedUrl(''), 2000);
  };

  const handleDeleteSite = async (id) => {
    if (!confirm('Are you sure you want to delete this entry?')) return;
    try {
      await fetch(`${API_BASE}/sites/${id}`, { method: 'DELETE' });
      setSites(prev => prev.filter(s => s._id !== id));
    } catch (err) {
      console.error(err);
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm('WARNING: This will permanently delete ALL discovered sites. Continue?')) return;
    try {
      await fetch(`${API_BASE}/sites`, { method: 'DELETE' });
      setSites([]);
      setStats({ sitesCrawled: 0, sitesDiscovered: 0, errors: 0 });
    } catch (err) {
      console.error(err);
    }
  };

  const exportData = (format) => {
    const data = sites;
    let content = '';
    let fileName = `onion-peeler-export-${new Date().toISOString().split('T')[0]}`;
    let type = '';

    if (format === 'json') {
      content = JSON.stringify(data, null, 2);
      fileName += '.json';
      type = 'application/json';
    } else if (format === 'csv') {
      const headers = ['URL', 'Title', 'Status', 'Discovered At'];
      const rows = data.map(s => [
        `"${s.url}"`,
        `"${(s.title || '').replace(/"/g, '""')}"`,
        s.status,
        new Date(s.discoveredAt).toLocaleString()
      ].join(','));
      content = [headers.join(','), ...rows].join('\n');
      fileName += '.csv';
      type = 'text/csv';
    }

    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  };

  const handleImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const jsonData = JSON.parse(event.target.result);
        if (!Array.isArray(jsonData)) throw new Error('Invalid format');

        await fetch(`${API_BASE}/sites/import`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(jsonData)
        });

        fetchSites();
        alert('Data imported successfully');
      } catch (err) {
        alert('Failed to import: ' + err.message);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="app-container">
      <aside className="sidebar">
        <a href="https://clebmb.pages.dev" target="_blank" rel="noopener noreferrer" className="clebmb-link">
          <img src="/assets/clebmb.webp" alt="Clebmb" className="clebmb-logo" />
        </a>
        <img src="/assets/logo.webp" alt="Logo" className="app-logo" />

        <div className="section-title">CONTROL PANEL</div>
        <div className="control-group">
          <div>
            <label className="input-label">Target URLs (.onion)</label>
            <textarea 
              value={config.targets}
              onChange={(e) => setConfig({...config, targets: e.target.value})}
              className="input-field w-full mt-1"
              rows="4"
              placeholder="http://..."
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="input-label">Depth</label>
              <input 
                type="number" 
                value={config.depth}
                onChange={(e) => setConfig({...config, depth: parseInt(e.target.value)})}
                className="input-field w-full mt-1"
              />
            </div>
            <div>
              <label className="input-label">Delay (ms)</label>
              <input 
                type="number" 
                value={config.delay}
                onChange={(e) => setConfig({...config, delay: parseInt(e.target.value)})}
                className="input-field w-full mt-1"
              />
            </div>
          </div>

          <div className="pt-2 flex flex-col gap-2">
            {!isRunning ? (
              <button onClick={handleStart} className="btn btn-primary w-full text-white">
                <Play className="w-4 h-4" /> Start Crawler
              </button>
            ) : (
              <button onClick={handleStop} className="btn btn-secondary w-full border-red-500/50 text-red-500 hover:bg-red-500/10">
                <Square className="w-4 h-4" /> Stop Crawler
              </button>
            )}
            
            <div className="flex gap-2">
              <button 
                onClick={handleClearDatabase}
                className="btn btn-secondary flex-1 border-white/10 text-zinc-500 hover:text-red-400 hover:border-red-400/30 text-[10px] py-2"
              >
                <Trash2 className="w-3 h-3" /> Clear
              </button>
              
              <div className="relative flex-1">
                <button 
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="btn btn-secondary w-full border-white/10 text-zinc-500 hover:text-white hover:border-white/30 text-[10px] py-2"
                >
                  <Download className="w-3 h-3" /> Save
                </button>
                {showExportMenu && (
                  <div className="absolute bottom-full left-0 w-full mb-2 bg-zinc-900 border border-white/10 rounded shadow-xl z-50 overflow-hidden">
                    <button onClick={() => exportData('json')} className="w-full text-left px-3 py-2 text-[10px] hover:bg-white/10 flex items-center gap-2">
                      <FileJson className="w-3 h-3" /> JSON
                    </button>
                    <button onClick={() => exportData('csv')} className="w-full text-left px-3 py-2 text-[10px] hover:bg-white/10 flex items-center gap-2">
                      <FileSpreadsheet className="w-3 h-3" /> CSV
                    </button>
                  </div>
                )}
              </div>
            </div>

            <div className="relative">
              <label className="btn btn-secondary w-full border-white/10 text-zinc-500 hover:text-white hover:border-white/30 text-[10px] py-2 cursor-pointer">
                <Upload className="w-3 h-3" /> Load Results
                <input type="file" accept=".json" onChange={handleImport} className="hidden" />
              </label>
            </div>
          </div>
        </div>

        <div className="section-title">LIVE STATISTICS</div>
        <div className="space-y-2">
          <div className="stats-card">
            <span className="stats-label">Discovered</span>
            <span className="stats-value">{stats.sitesDiscovered}</span>
          </div>
          <div className="stats-card">
            <span className="stats-label">Crawled</span>
            <span className="stats-value text-emerald-400">{stats.sitesCrawled}</span>
          </div>
          <div className="stats-card">
            <span className="stats-label">Errors</span>
            <span className="stats-value text-red-500">{stats.errors}</span>
          </div>
        </div>
        
        <div className="mt-auto pt-6 text-[10px] text-zinc-600 uppercase tracking-[0.2em] text-center">
          SYSTEM STATUS: {isRunning ? 'ACTIVE' : 'IDLE'}
        </div>
      </aside>

      <main className="main-view">
        <header className="header-bar">
          <div className="header-title">ONION PEELER</div>
          <a href="https://github.com/clebmb/onionpeeler" target="_blank" rel="noopener noreferrer" className="source-link">
            <img src="/assets/sourcecode.webp" alt="Source Code" className="source-logo" />
          </a>
        </header>

        <div className="content-area">
          {isRunning && currentCrawl && (
            <div className="live-bar">
              <RefreshCcw className="w-4 h-4 animate-spin text-red-500" />
              <div className="flex-1 truncate">
                <span className="text-[10px] font-bold text-red-500 uppercase tracking-widest block mb-0.5">CURRENTLY PEELING</span>
                <span className="font-mono text-xs truncate block">{currentCrawl}</span>
              </div>
            </div>
          )}

          <div className="data-table-container flex-1">
            <div className="p-4 border-b border-white/5 flex justify-between items-center bg-black/40">
              <h2 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2">
                <Database className="w-3 h-3 text-red-500"/> DISCOVERED NODES
              </h2>
              <span className="text-[10px] text-zinc-500 uppercase">LATEST 100 DISCOVERIES</span>
            </div>
            <div className="flex-1 overflow-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="w-16">Status</th>
                    <th>Onion Address</th>
                    <th>Node Title</th>
                    <th className="w-20 text-center">Action</th>
                    <th className="text-right">Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {sites.length === 0 ? (
                    <tr>
                      <td colSpan="4" className="py-20 text-center text-zinc-600 uppercase tracking-widest text-xs">
                        No nodes discovered. Initiate crawl.
                      </td>
                    </tr>
                  ) : sites.map((site) => (
                    <tr key={site._id}>
                      <td>
                        <span className={`status-indicator ${
                          site.status === 'crawled' ? 'status-active' : 
                          site.status === 'failed' ? 'status-failed' : 'status-pending'
                        }`}></span>
                      </td>
                      <td className="font-mono text-xs text-zinc-400">{site.url}</td>
                      <td className="text-zinc-200">{site.title || 'UNNAMED NODE'}</td>
                      <td className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button 
                            onClick={() => copyToClipboard(site.url)}
                            className="p-1.5 hover:bg-white/10 rounded transition-colors text-zinc-500 hover:text-white"
                            title="Copy URL"
                          >
                            {copiedUrl === site.url ? (
                              <Check className="w-3.5 h-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                          <button 
                            onClick={() => handleDeleteSite(site._id)}
                            className="p-1.5 hover:bg-white/10 rounded transition-colors text-zinc-500 hover:text-red-500"
                            title="Delete Entry"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="text-right text-[10px] text-zinc-500">
                        {new Date(site.discoveredAt).toLocaleTimeString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}


export default App;
