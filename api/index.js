export default async function handler(req, res) {
  const target = req.headers['x-target-url'];
  if (!target) return res.status(400).json({ error: 'Missing target URL. Header x-target-url is required.' });

  try {
    // 1. Kumpulkan header penting & pertahankan header bawaan jika ada
    const headers = { 
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
    };

    for (const [key, value] of Object.entries(req.headers)) {
      if (!['host', 'x-forwarded-for', 'x-real-ip', 'x-target-url', 'x-vercel-proxy-signature'].includes(key.toLowerCase())) {
        headers[key] = value;
      }
    }

    // 2. Forward Body secara penuh (Support GET, POST, PUT, DELETE)
    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      body = await req.text();
    }

    // 3. Tembak target URL
    const response = await fetch(target, {
      method: req.method,
      headers,
      body,
      redirect: 'follow',
    });

    // 4. Salin HTTP Status Code & Response Headers (skip hop-by-hop)
    res.status(response.status);
    response.headers.forEach((value, key) => {
      if (!['connection', 'keep-alive', 'transfer-encoding', 'content-encoding'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // 5. Stream Response (Sangat krusial untuk AI Model / Hermes)
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
