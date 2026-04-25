const express = require('express');
const https   = require('https');
const http    = require('http');
const app     = express();

// Parsear body como texto plano
app.use(express.text({ type: '*/*', limit: '5mb' }));

// CORS — permitir cualquier origen
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-target-url, x-campus-cookie');
  res.setHeader('Access-Control-Expose-Headers','x-set-cookie');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Ruta raíz — verificar que está activo
app.get('/', (req, res) => {
  res.send('Campus Bot Proxy activo. Falta x-target-url');
});

// Proxy principal
app.all('/proxy', async (req, res) => {
  const targetUrl = req.headers['x-target-url'];

  if (!targetUrl) {
    return res.status(400).send('Falta x-target-url');
  }

  if (!targetUrl.includes('campus.unma.net.ar')) {
    return res.status(403).send('URL no permitida');
  }

  // Headers para el campus
  const reqHeaders = {
    'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'es-AR,es;q=0.9',
    'Connection':      'keep-alive',
  };

  if (req.headers['content-type']) {
    reqHeaders['Content-Type'] = req.headers['content-type'];
  }

  // Pasar cookie de sesión
  const campusCookie = req.headers['x-campus-cookie'];
  if (campusCookie) {
    reqHeaders['Cookie'] = campusCookie;
  }

  // Hacer el request al campus
  try {
    const url    = new URL(targetUrl);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const port   = url.port || (isHttps ? 443 : 80);

    const options = {
      hostname: url.hostname,
      port:     port,
      path:     url.pathname + url.search,
      method:   req.method,
      headers:  reqHeaders,
    };

    const proxyReq = client.request(options, (proxyRes) => {
      // Pasar Set-Cookie como header especial
      const setCookie = proxyRes.headers['set-cookie'];
      if (setCookie) {
        res.setHeader('x-set-cookie', Array.isArray(setCookie) ? setCookie.join('; ') : setCookie);
      }

      // Content-Type
      const ct = proxyRes.headers['content-type'] || 'text/html; charset=utf-8';
      res.setHeader('Content-Type', ct);
      res.status(proxyRes.statusCode);

      // Stream de respuesta
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => {
      console.error('Proxy error:', e.message);
      if (!res.headersSent) {
        res.status(502).send('Error conectando al campus: ' + e.message);
      }
    });

    // Enviar body si es POST
    if (req.method === 'POST' && req.body) {
      proxyReq.write(req.body);
    }

    proxyReq.end();

  } catch (e) {
    console.error('Error:', e.message);
    res.status(500).send('Error interno: ' + e.message);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Campus Bot Proxy corriendo en puerto', PORT);
});
