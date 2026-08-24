export default async function handler(req, res) {
  // Fix Bug 2: Vercel selalu menormalisasi header ke lowercase
  const target = req.headers['x-target-url'];
  if (!target) {
    return res.status(400).json({ error: 'Missing target URL. Header x-target-url is required.' });
  }

  try {
    // Fix Bug 1: Baca body dengan aman (HANYA SEKALI) tanpa memicu stream hang/520
    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (req.body) {
        // Jika Vercel sudah mengurai req.body
        body = typeof req.body === 'string' || Buffer.isBuffer(req.body) 
          ? req.body 
          : JSON.stringify(req.body);
      } else {
        // Fallback jika raw body belum diurai oleh Vercel
        const chunks = [];
        for await (const chunk of req) {
          chunks.push(chunk);
        }
        body = Buffer.concat(chunks);
      }
    }

    // Kumpulkan header request (skip header internal / hop-by-hop)
    const headers = { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
    };

    for (const [key, value] of Object.entries(req.headers)) {
      if (!['host', 'x-forwarded-for', 'x-real-ip', 'x-target-url', 'x-vercel-proxy-signature', 'content-length'].includes(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    // Tembak target URL
    const response = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'follow',
    });

    // Forward status code & response headers (skip hop-by-hop)
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['connection', 'keep-alive', 'transfer-encoding', 'content-encoding', 'content-length'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Stream Response (Krusial untuk Hermes & AI Client)
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
