export default async function handler(req, res) {
  const target = req.headers['x-target-url'];
  if (!target) return res.status(400).json({ error: 'Missing target URL. Header x-target-url is required.' });

  try {
    // 1. Kumpulkan header request
    const headers = { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
    };

    for (const [key, value] of Object.entries(req.headers)) {
      if (!['host', 'x-forwarded-for', 'x-real-ip', 'x-target-url', 'x-vercel-proxy-signature', 'content-length'].includes(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    // 2. Tangani Request Body Native Node.js Stream (Fix untuk Vercel Serverless)
    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
        body = req.body;
      } else if (typeof req.body === 'object' && req.body !== null) {
        body = JSON.stringify(req.body);
      } else {
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        body = Buffer.concat(buffers);
      }
    }

    // 3. Tembak target URL
    const response = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'follow',
    });

    // 4. Salin HTTP Status Code & Response Headers
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['connection', 'keep-alive', 'transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // 5. Stream Response (Krusial untuk AI Model / Hermes)
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    } else {
      const buf = await response.arrayBuffer();
      return res.send(Buffer.from(buf));
    }

  } catch (e) {
    return res.status(502).json({ error: 'Proxy Error: ' + e.message });
  }
}
