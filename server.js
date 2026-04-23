import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.text({ type: '*/*' }));

let cookieJar = '';

app.all('/proxy', async (req, res) => {
  const target = req.headers['x-target-url'];
  if (!target) return res.status(400).send('Missing x-target-url');

  const headers = {};
  if (cookieJar) headers['Cookie'] = cookieJar;
  if (req.method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

  try {
    const r = await fetch(target, {
      method: req.method,
      headers,
      body: req.method === 'GET' ? undefined : req.body,
      redirect: 'follow'
    });

    const setCookie = r.headers.get('set-cookie');
    if (setCookie) {
      const match = setCookie.match(/MoodleSession[^=]*=[^;]+/);
      if (match) cookieJar = match[0];
    }

    const text = await r.text();

    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, x-target-url, x-campus-cookie');
    res.set('Access-Control-Expose-Headers', 'x-set-cookie');
    res.set('x-set-cookie', cookieJar || '');

    res.send(text);
  } catch (e) {
    res.status(500).send(e.message);
  }
});

app.listen(3000, () => console.log('Proxy running on port 3000'));