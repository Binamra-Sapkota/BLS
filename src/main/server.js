const http = require('http');
const https = require('https');
const express = require('express');
const path = require('path');
const fs = require('fs');
const os = require('os');
const selfsigned = require('selfsigned');
const mime = require('mime-types');

class ServerManager {
  constructor() {
    this.server = null;
    this.app = null;
    this.status = {
      running: false,
      port: 8080,
      protocol: 'http',
      rootPath: '',
      localhostOnly: true,
      cors: true,
      directoryListing: true,
      spaFallback: false,
      disableCache: true,
      startTime: null,
      urls: {
        localhost: '',
        network: []
      },
      stats: {
        totalRequests: 0,
        bytesTransferred: 0,
        statusCodes: {}
      }
    };
    this.logCallback = null;
  }

  // Get local network IPv4 addresses
  getNetworkAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];

    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        // Skip over non-IPv4 and internal (i.e. 127.0.0.1) addresses
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({
            name,
            address: iface.address
          });
        }
      }
    }
    return addresses;
  }

  // Generate hacker-styled directory listing HTML
  renderDirectoryListing(reqPath, physicalPath, relativeUrlPath) {
    try {
      const items = fs.readdirSync(physicalPath, { withFileTypes: true });
      
      const files = [];
      const dirs = [];

      for (const item of items) {
        // Skip hidden files if preferred, or keep them
        if (item.name.startsWith('.')) continue;

        try {
          const itemPath = path.join(physicalPath, item.name);
          const stat = fs.statSync(itemPath);
          const isDir = item.isDirectory();
          
          const entry = {
            name: item.name,
            isDir,
            size: isDir ? '-' : this.formatBytes(stat.size),
            sizeRaw: isDir ? -1 : stat.size,
            mtime: stat.mtime.toLocaleString(),
            mtimeRaw: stat.mtimeMs,
            ext: path.extname(item.name).toLowerCase()
          };

          if (isDir) {
            dirs.push(entry);
          } else {
            files.push(entry);
          }
        } catch (e) {
          // ignore unreadable files
        }
      }

      dirs.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));

      const allEntries = [...dirs, ...files];
      
      // Clean up breadcrumb paths
      const urlSegments = relativeUrlPath.split('/').filter(Boolean);
      let breadcrumbHtml = `<a href="/" class="crumb-root">/ root</a>`;
      let currentCrumbPath = '';
      for (let i = 0; i < urlSegments.length; i++) {
        currentCrumbPath += '/' + encodeURIComponent(urlSegments[i]);
        breadcrumbHtml += ` <span class="crumb-sep">/</span> <a href="${currentCrumbPath}">${this.escapeHtml(urlSegments[i])}</a>`;
      }

      const rowsHtml = allEntries.map(entry => {
        const href = path.posix.join(relativeUrlPath, encodeURIComponent(entry.name)) + (entry.isDir ? '/' : '');
        const icon = entry.isDir ? '📁' : this.getFileIcon(entry.ext);
        const typeClass = entry.isDir ? 'dir' : 'file';
        return `
          <tr class="row-${typeClass}">
            <td class="name-col"><a href="${href}"><span class="icon">${icon}</span> <span class="text">${this.escapeHtml(entry.name)}${entry.isDir ? '/' : ''}</span></a></td>
            <td class="size-col">${entry.size}</td>
            <td class="mtime-col">${entry.mtime}</td>
          </tr>
        `;
      }).join('\n');

      const parentRow = relativeUrlPath !== '/' && relativeUrlPath !== '' ? `
        <tr class="row-parent">
          <td colspan="3" class="name-col">
            <a href="${path.posix.dirname(relativeUrlPath.endsWith('/') ? relativeUrlPath.slice(0, -1) : relativeUrlPath) || '/'}">
              <span class="icon">⬆️</span> <span class="text">.. [Parent Directory]</span>
            </a>
          </td>
        </tr>
      ` : '';

      return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BLS // Index of ${this.escapeHtml(relativeUrlPath || '/')}</title>
  <style>
    :root {
      --bg: #070c0a;
      --bg-panel: #0d1612;
      --border: #143324;
      --neon: #00ff66;
      --neon-cyan: #00f0ff;
      --text: #c8e6c9;
      --text-dim: #5c856c;
      --hover-bg: #12291d;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'JetBrains Mono', 'Fira Code', Menlo, Monaco, 'Courier New', monospace;
      padding: 30px 20px;
      line-height: 1.5;
    }
    .container {
      max-width: 980px;
      margin: 0 auto;
      background: var(--bg-panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: 0 0 30px rgba(0, 255, 102, 0.05);
      overflow: hidden;
    }
    .header {
      padding: 20px 24px;
      border-bottom: 1px solid var(--border);
      background: rgba(0, 255, 102, 0.03);
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-wrap: wrap;
      gap: 15px;
    }
    .title-area {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .badge {
      background: #00ff66;
      color: #050a07;
      font-weight: 900;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      letter-spacing: 1.5px;
    }
    h1 {
      font-size: 16px;
      color: #fff;
      font-weight: 600;
    }
    .breadcrumbs {
      padding: 12px 24px;
      background: #09100d;
      border-bottom: 1px solid var(--border);
      font-size: 13px;
      color: var(--text-dim);
    }
    .breadcrumbs a {
      color: var(--neon-cyan);
      text-decoration: none;
    }
    .breadcrumbs a:hover {
      text-decoration: underline;
    }
    .crumb-sep {
      color: var(--border);
      margin: 0 4px;
    }
    .search-bar {
      padding: 12px 24px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .search-input {
      width: 100%;
      background: #050a08;
      border: 1px solid var(--border);
      color: var(--neon);
      padding: 8px 14px;
      border-radius: 4px;
      font-family: inherit;
      font-size: 13px;
      outline: none;
      transition: border-color 0.2s;
    }
    .search-input:focus {
      border-color: var(--neon);
      box-shadow: 0 0 10px rgba(0, 255, 102, 0.2);
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    th {
      text-align: left;
      padding: 12px 24px;
      background: rgba(0, 0, 0, 0.3);
      color: var(--text-dim);
      font-weight: 600;
      border-bottom: 1px solid var(--border);
      font-size: 11px;
      letter-spacing: 1px;
      text-transform: uppercase;
    }
    td {
      padding: 10px 24px;
      border-bottom: 1px solid rgba(20, 51, 36, 0.5);
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr:hover td {
      background: var(--hover-bg);
    }
    .name-col {
      width: 60%;
    }
    .name-col a {
      color: var(--text);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }
    .row-dir .name-col a {
      color: var(--neon);
      font-weight: 600;
    }
    .row-parent a {
      color: var(--neon-cyan);
    }
    .name-col a:hover {
      color: #fff;
      text-shadow: 0 0 8px var(--neon);
    }
    .size-col {
      width: 15%;
      color: var(--text-dim);
      font-variant-numeric: tabular-nums;
    }
    .mtime-col {
      width: 25%;
      color: var(--text-dim);
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .footer {
      padding: 14px 24px;
      background: #060b09;
      border-top: 1px solid var(--border);
      font-size: 11px;
      color: var(--text-dim);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer a {
      color: var(--neon);
      text-decoration: none;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="title-area">
        <span class="badge">BLS SERVER</span>
        <h1>Index of ${this.escapeHtml(relativeUrlPath || '/')}</h1>
      </div>
      <div style="font-size: 12px; color: var(--text-dim);">
        ${allEntries.length} item${allEntries.length === 1 ? '' : 's'}
      </div>
    </div>
    <div class="breadcrumbs">
      ${breadcrumbHtml}
    </div>
    <div class="search-bar">
      <input type="text" id="filterInput" class="search-input" placeholder="🔍 Type to filter files..." autofocus autocomplete="off" spellcheck="false" />
    </div>
    <table id="fileTable">
      <thead>
        <tr>
          <th>Name</th>
          <th>Size</th>
          <th>Last Modified</th>
        </tr>
      </thead>
      <tbody>
        ${parentRow}
        ${rowsHtml || '<tr><td colspan="3" style="text-align: center; color: var(--text-dim); padding: 30px;">[ Directory is empty ]</td></tr>'}
      </tbody>
    </table>
    <div class="footer">
      <span>BLS &bull; Lightweight Local Web Server</span>
      <span>Status: <strong style="color: var(--neon);">LIVE</strong></span>
    </div>
  </div>

  <script>
    const filterInput = document.getElementById('filterInput');
    const tableRows = document.querySelectorAll('#fileTable tbody tr:not(.row-parent)');

    filterInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      tableRows.forEach(row => {
        const text = row.querySelector('.name-col')?.textContent?.toLowerCase() || '';
        if (text.includes(q)) {
          row.style.display = '';
        } else {
          row.style.display = 'none';
        }
      });
    });
  </script>
</body>
</html>`;
    } catch (err) {
      return `<h1>Directory Listing Error: ${this.escapeHtml(err.message)}</h1>`;
    }
  }

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  getFileIcon(ext) {
    const iconMap = {
      '.html': '🌐',
      '.htm': '🌐',
      '.css': '🎨',
      '.js': '⚡',
      '.mjs': '⚡',
      '.json': '📦',
      '.png': '🖼️',
      '.jpg': '🖼️',
      '.jpeg': '🖼️',
      '.gif': '🖼️',
      '.svg': '📐',
      '.webp': '🖼️',
      '.mp4': '🎬',
      '.webm': '🎬',
      '.mp3': '🎵',
      '.wav': '🎵',
      '.pdf': '📄',
      '.zip': '🗜️',
      '.tar': '🗜️',
      '.gz': '🗜️',
      '.txt': '📝',
      '.md': '📝',
      '.ts': '🔷',
      '.tsx': '⚛️',
      '.jsx': '⚛️'
    };
    return iconMap[ext] || '📄';
  }

  // Start the server
  async start(options, onLog) {
    if (this.status.running) {
      await this.stop();
    }

    this.logCallback = onLog || null;

    const rootPath = path.resolve(options.rootPath || process.cwd());
    if (!fs.existsSync(rootPath)) {
      throw new Error(`Directory does not exist: ${rootPath}`);
    }

    const port = parseInt(options.port, 10) || 8080;
    const localhostOnly = options.localhostOnly !== false;
    const isHttps = Boolean(options.https);
    const enableCors = options.cors !== false;
    const directoryListing = options.directoryListing !== false;
    const spaFallback = Boolean(options.spaFallback);
    const disableCache = options.disableCache !== false;

    const app = express();
    this.app = app;

    // Reset stats
    this.status.stats = {
      totalRequests: 0,
      bytesTransferred: 0,
      statusCodes: {}
    };

    // Logging & metrics middleware
    app.use((req, res, next) => {
      const startTime = Date.now();
      const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '127.0.0.1';

      // Capture response finish
      res.on('finish', () => {
        const durationMs = Date.now() - startTime;
        const statusCode = res.statusCode;
        const size = parseInt(res.getHeader('content-length'), 10) || 0;

        this.status.stats.totalRequests++;
        this.status.stats.bytesTransferred += size;
        this.status.stats.statusCodes[statusCode] = (this.status.stats.statusCodes[statusCode] || 0) + 1;

        const logEntry = {
          id: Math.random().toString(36).substring(2, 9),
          timestamp: new Date().toLocaleTimeString(),
          method: req.method,
          url: req.originalUrl || req.url,
          status: statusCode,
          durationMs,
          size,
          sizeFormatted: this.formatBytes(size),
          clientIp: clientIp.replace('::ffff:', '')
        };

        if (this.logCallback) {
          this.logCallback(logEntry);
        }
      });

      next();
    });

    // Disable caching headers if requested
    if (disableCache) {
      app.use((req, res, next) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');
        next();
      });
    }

    // CORS Headers
    if (enableCors) {
      app.use((req, res, next) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD');
        res.setHeader('Access-Control-Allow-Headers', '*');
        res.setHeader('Access-Control-Expose-Headers', '*');
        if (req.method === 'OPTIONS') {
          return res.sendStatus(204);
        }
        next();
      });
    }

    // Custom Static file & Directory handler
    app.use(async (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
      }

      // Sanitize URL path to avoid directory traversal
      let reqPath = decodeURIComponent(req.path);
      const safePath = path.normalize(reqPath).replace(/^(\.\.[\/\\])+/, '');
      const fullPhysicalPath = path.join(rootPath, safePath);

      // Verify that target path is within rootPath
      if (!fullPhysicalPath.startsWith(rootPath)) {
        return res.status(403).send('Forbidden: Access Denied');
      }

      try {
        if (!fs.existsSync(fullPhysicalPath)) {
          return next();
        }

        const stat = fs.statSync(fullPhysicalPath);

        if (stat.isDirectory()) {
          // Check for index.html or index.htm
          const indexHtml = path.join(fullPhysicalPath, 'index.html');
          const indexHtm = path.join(fullPhysicalPath, 'index.htm');

          if (fs.existsSync(indexHtml)) {
            return res.sendFile(indexHtml);
          } else if (fs.existsSync(indexHtm)) {
            return res.sendFile(indexHtm);
          } else if (directoryListing) {
            // Render styled directory listing
            const listingHtml = this.renderDirectoryListing(safePath, fullPhysicalPath, reqPath);
            return res.setHeader('Content-Type', 'text/html; charset=utf-8').send(listingHtml);
          } else {
            return res.status(403).setHeader('Content-Type', 'text/html').send(`
              <!DOCTYPE html>
              <html><body style="background:#070c0a;color:#ff5555;font-family:monospace;padding:40px;text-align:center;">
                <h2>403 Forbidden</h2>
                <p>Directory listing is disabled for this server.</p>
              </body></html>
            `);
          }
        } else if (stat.isFile()) {
          const mimeType = mime.lookup(fullPhysicalPath) || 'application/octet-stream';
          res.setHeader('Content-Type', mimeType);
          return res.sendFile(fullPhysicalPath);
        }
      } catch (err) {
        return next(err);
      }

      next();
    });

    // SPA Fallback: If not found, serve index.html from root if enabled
    if (spaFallback) {
      app.use((req, res, next) => {
        if (req.method === 'GET') {
          const rootIndex = path.join(rootPath, 'index.html');
          if (fs.existsSync(rootIndex)) {
            return res.sendFile(rootIndex);
          }
        }
        next();
      });
    }

    // 404 handler
    app.use((req, res) => {
      res.status(404).setHeader('Content-Type', 'text/html').send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>404 Not Found // BLS</title>
          <style>
            body { background: #070c0a; color: #00ff66; font-family: monospace; padding: 50px 20px; text-align: center; }
            .box { max-width: 500px; margin: 0 auto; border: 1px solid #143324; padding: 30px; border-radius: 8px; background: #0d1612; }
            h1 { color: #ff5555; margin-bottom: 10px; font-size: 28px; }
            p { color: #8fa89b; font-size: 14px; margin-bottom: 20px; }
            a { color: #00f0ff; text-decoration: none; border: 1px solid #00f0ff; padding: 6px 14px; border-radius: 4px; }
            a:hover { background: rgba(0,240,255,0.1); }
          </style>
        </head>
        <body>
          <div class="box">
            <h1>404 Not Found</h1>
            <p>The requested URL <code>${this.escapeHtml(req.path)}</code> was not found on this server.</p>
            <a href="/">Return to Root</a>
          </div>
        </body>
        </html>
      `);
    });

    // Error handler
    app.use((err, req, res, next) => {
      res.status(500).setHeader('Content-Type', 'text/html').send(`
        <!DOCTYPE html>
        <html><body style="background:#070c0a;color:#ff5555;font-family:monospace;padding:30px;">
          <h2>500 Internal Server Error</h2>
          <pre>${this.escapeHtml(err.stack || err.message)}</pre>
        </body></html>
      `);
    });

    // Create HTTP or HTTPS server
    let serverInstance;
    const protocol = isHttps ? 'https' : 'http';

    if (isHttps) {
      // Generate self-signed certificate dynamically
      const attrs = [{ name: 'commonName', value: 'localhost' }];
      const pems = await selfsigned.generate(attrs, { days: 365, algorithm: 'sha256' });
      serverInstance = https.createServer({ key: pems.private, cert: pems.cert }, app);
    } else {
      serverInstance = http.createServer(app);
    }

    const host = localhostOnly ? '127.0.0.1' : '0.0.0.0';

    return new Promise((resolve, reject) => {
      serverInstance.once('error', (err) => {
        reject(err);
      });

      serverInstance.listen(port, host, () => {
        this.server = serverInstance;
        const actualPort = serverInstance.address().port;
        const localhostUrl = `${protocol}://localhost:${actualPort}`;
        const networkUrls = [];

        if (!localhostOnly) {
          const netAddrs = this.getNetworkAddresses();
          for (const item of netAddrs) {
            networkUrls.push({
              name: item.name,
              ip: item.address,
              url: `${protocol}://${item.address}:${actualPort}`
            });
          }
        }

        this.status = {
          running: true,
          port: actualPort,
          protocol,
          rootPath,
          localhostOnly,
          cors: enableCors,
          directoryListing,
          spaFallback,
          disableCache,
          startTime: new Date().toISOString(),
          urls: {
            localhost: localhostUrl,
            network: networkUrls
          },
          stats: this.status.stats
        };

        resolve(this.status);
      });
    });
  }

  // Stop the server
  stop() {
    return new Promise((resolve) => {
      if (!this.server || !this.status.running) {
        this.status.running = false;
        return resolve({ success: true, message: 'Server is already stopped' });
      }

      this.server.close(() => {
        this.server = null;
        this.app = null;
        this.status.running = false;
        resolve({ success: true, message: 'Server stopped successfully' });
      });

      // Force close lingering keep-alive sockets if available
      if (this.server.closeAllConnections) {
        this.server.closeAllConnections();
      }
    });
  }

  getStatus() {
    return this.status;
  }
}

module.exports = new ServerManager();
