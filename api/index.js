export default async function handler(req, res) {
  // 1. Tangkap URL target dari header x-target-url atau query target
  const targetUrl = req.headers['x-target-url'] || req.query.target;

  if (!targetUrl) {
    return res.status(400).json({ 
      error: 'Missing target URL. Header x-target-url is required.' 
    });
  }

  // 2. Salin header request & hapus header internal/IP VPS
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (
      !key.startsWith('x-vercel-') &&
      !['host', 'x-forwarded-for', 'x-real-ip', 'x-target-url', 'content-length'].includes(key.toLowerCase())
    ) {
      headers[key] = value;
    }
  }

  try {
    // 3. Tangani Request Body dengan Aman (mencegah Body Hilang/Kosong)
    let body = undefined;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
        body = req.body;
      } else if (typeof req.body === 'object' && req.body !== null) {
        body = JSON.stringify(req.body);
      } else {
        // Fallback jika body belum di-parse oleh Vercel
        const buffers = [];
        for await (const chunk of req) {
          buffers.push(chunk);
        }
        body = Buffer.concat(buffers);
      }
    }

    // 4. Kirim request ke target AI Provider
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: body,
    });

    // 5. Teruskan HTTP Status Code & Response Headers balik ke 9Router
    res.status(response.status);
    response.headers.forEach((value, key) => {
      // Abaikan encoding kompresi ganda
      if (!['content-encoding', 'content-length'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // 6. Teruskan Stream Response (Support Streaming / SSE dari AI Model)
    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
      return res.end();
    } else {
      const data = await response.arrayBuffer();
      return res.send(Buffer.from(data));
    }

  } catch (error) {
    return res.status(500).json({ error: 'Proxy Forward Error: ' + error.message });
  }
}
