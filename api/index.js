export default async function handler(req, res) {
  // 1. Tangkap URL target yang dikirim oleh 9Router
  const targetUrl = req.headers['x-target-url'] || req.query.target;

  if (!targetUrl) {
    return res.status(400).json({ 
      error: 'Missing target URL. Header x-target-url is required.' 
    });
  }

  // 2. Salin header request dan hapus IP VPS agar tidak terdeteksi
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    // Abaikan header internal Vercel dan header IP VPS
    if (
      !key.startsWith('x-vercel-') &&
      !['host', 'x-forwarded-for', 'x-real-ip', 'x-target-url'].includes(key.toLowerCase())
    ) {
      headers[key] = value;
    }
  }

  try {
    // 3. Baca body request jika ada
    let body = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const buffers = [];
      for await (const chunk of req) {
        buffers.push(chunk);
      }
      body = Buffer.concat(buffers);
    }

    // 4. Kirim request ke API tujuan menggunakan IP Vercel
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: headers,
      body: body,
    });

    // 5. Kembalikan respons balik ke 9Router
    res.status(response.status);
    response.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    const responseData = await response.arrayBuffer();
    res.send(Buffer.from(responseData));

  } catch (error) {
    res.status(500).json({ error: 'Proxy Error: ' + error.message });
  }
}