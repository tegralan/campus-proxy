import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.text({ type: '*/*' }));

let cookieJar = '';

function mergeCookies(oldCookie, setCookies) {
  const jar = {};
  if (oldCookie) {
    oldCookie.split(';').forEach(c => {
      const [k, ...v] = c.trim().split('=');
      if (k) jar[k] = v.join('=');
    });
  }

  for (const sc of setCookies || []) {
    const first = sc.split(';')[0];
    const [k, ...v] = first.split('=');
    if (k) jar[k] = v.join('=');
  }

  return Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
}

app.all('/proxy', async (req, res) => {
  let target = req.headers['x-target-url'];
  if (!target) return res.status(400).send('Missing x-target-url');

  let method = req.method;
  let body = req.method === 'GET' || req.method === 'HEAD' ? undefined : req.body;

  try {
    let response;

    for (let i = 0; i < 5; i++) {
      const headers = {};
      if (cookieJar) headers['Cookie'] = cookieJar;
      if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';

      response = await fetch(target, {
        method,
        headers,
        body,
        redirect: 'manual'
      });

      const setCookies = response.headers.raw()['set-cookie'] || [];
      cookieJar = mergeCookies(cookieJar, setCookies);

      if (![301, 302, 303, 307, 308].includes(response.status)) break;

      const loc = response.headers.get('location');
      if (!loc) break;

      target = new URL(loc, target).href;
      method = 'GET';
      body = undefined;
    }

    const text = await response.text();

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-target-url, x-campus-cookie');
    res.set('Access-Control-Expose-Headers', 'x-set-cookie');
    res.set('x-set-cookie', cookieJar || '');

    res.status(response.status).send(text);
  } catch (e) {
    res.status(500).send('Proxy error: ' + e.message);
  }
});

app.listen(3000, () => console.log('Proxy running on port 3000'));
