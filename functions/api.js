const COOKIES = {
  'PANWEB': '1',
  '__bid_n': '199f06ecf83c6517974207',
  'ndus': 'YdPCtvYteHui3XC6demNk-M2HgRzVrnh0txZQG6X',
  'csrfToken': 'af9aD-FiuCbvJkukHHhOA8XV',
  'browserid': 'BNT7BllyBZJWHfvSoVw8hXcWCBzRNSUvSABzO7pq-zj9qWDBOBHoyz--pRg=',
  'lang': 'en',
  'ndut_fmt': '808CED9ACB7ADD765BADAF30B1F8220BB41B8E2C016E523E3D37B486C74124DD',
};

export default {
  async fetch(request) {
    const { pathname, searchParams } = new URL(request.url);

    // --- CORS ---
    if (request.method === "OPTIONS") return new Response(null, { headers: cors() });

    // --- Proxy route ---
    if (pathname.startsWith("/proxy")) {
      const u = searchParams.get("u");
      if (!u) return new Response("Missing ?u=", { status: 400 });

      const origin = await fetch(u, { headers: { range: request.headers.get("range") || "" } });
      return new Response(origin.body, { status: origin.status, headers: origin.headers });
    }

    // --- Update route ---
    if (pathname === "/update") {
      if (request.method === "GET") return updateForm();
      if (request.method === "POST") return handleUpdate(request);
    }

    // --- Default (extractor) route ---
    return handleExtract(request);
  }
};

// --- Update Handler (JSON or Form) ---
async function handleUpdate(request) {
  const contentType = request.headers.get("content-type") || "";

  try {
    if (contentType.includes("application/json")) {
      const body = await request.json();
      Object.assign(COOKIES, body);
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = await request.formData();
      for (const key of Object.keys(COOKIES)) {
        if (form.get(key)) COOKIES[key] = form.get(key);
      }
    }

    COOKIES.updatedAt = new Date().toISOString();
    return json({ success: true, cookies: COOKIES });
  } catch (e) {
    return json({ error: "Invalid update data", details: e.message }, 400);
  }
}

// --- HTML Form for Cookie Update ---
function updateForm() {
  const formHtml = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>Update TeraBox Cookies</title>
    <style>
      body { font-family: sans-serif; background: #0d1117; color: #fff; padding: 2rem; }
      form { background: #161b22; padding: 2rem; border-radius: 1rem; max-width: 500px; margin: auto; }
      label { display: block; margin-top: 1rem; font-weight: bold; }
      input[type=text] { width: 100%; padding: 0.6rem; border: none; border-radius: 0.5rem; background: #21262d; color: #fff; }
      button { margin-top: 1.5rem; padding: 0.7rem 1.5rem; background: #238636; color: #fff; border: none; border-radius: 0.5rem; cursor: pointer; }
      button:hover { background: #2ea043; }
      .footer { text-align: center; margin-top: 2rem; font-size: 0.9em; color: #aaa; }
    </style>
  </head>
  <body>
    <form method="POST">
      <h2>🧠 Update TeraBox Cookies</h2>
      ${Object.keys(COOKIES)
        .map(
          key => `
        <label for="${key}">${key}</label>
        <input type="text" id="${key}" name="${key}" value="${COOKIES[key] || ""}" />
      `
        )
        .join("")}
      <button type="submit">Update Cookies</button>
      <div class="footer">Current update: ${COOKIES.updatedAt || "Never"}</div>
    </form>
  </body>
  </html>
  `;
  return new Response(formHtml, { headers: { "Content-Type": "text/html" } });
}

// --- Extractor Handler ---
async function handleExtract(request) {
  const url = new URL(request.url).searchParams.get("url");
  if (!url) return json({ error: "Add ?url=YOUR_TERABOX_LINK" }, 400);

  const cookies = Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join("; ");

  // Normalize link
  let mirrorUrl = url;
  if (url.includes("/s/")) {
    const surl = url.split("/s/")[1].split("?")[0];
    mirrorUrl = `https://www.1024tera.com/s/${surl}`;
  } else if (url.includes("surl=")) {
    const surl = url.split("surl=")[1].split("&")[0];
    mirrorUrl = `https://www.1024tera.com/sharing/link?surl=${surl}`;
  }

  // Step 1: Fetch page
  const page = await fetch(mirrorUrl, {
    headers: { "User-Agent": "Mozilla/5.0", "Cookie": cookies }
  });

  const html = await page.text();
  const finalUrl = page.url;

  // Step 2: Extract tokens
  const jsToken = extract(html, 'fn%28%22', '%22%29');
  const logId = extract(html, 'dp-logid=', '&');
  const surl = finalUrl.includes('surl=')
    ? finalUrl.split('surl=')[1].split('&')[0]
    : finalUrl.split('/s/')[1]?.split('?')[0];

  if (!jsToken || !logId || !surl)
    return json({ error: "Failed to extract tokens. Cookies expired?" }, 403);

  // Step 3: Get file list
  const api = `https://www.terabox.app/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dplogid=${logId}&page=1&num=20&shorturl=${surl}&root=1`;
  const res = await fetch(api, { headers: { "User-Agent": "Mozilla/5.0", "Cookie": cookies } });
  const data = await res.json();

  if (data.errno !== 0) return json({ error: data.errmsg || "API error" }, 400);
  if (!data.list?.length) return json({ error: "No files found" }, 404);

  // Handle directory
  let files = data.list;
  if (files[0]?.isdir === "1") {
    const dirApi = `https://www.terabox.app/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dplogid=${logId}&page=1&num=20&shorturl=${surl}&dir=${files[0].path}`;
    const dirRes = await fetch(dirApi, { headers: { "Cookie": cookies } });
    const dirData = await dirRes.json();
    if (dirData.list?.length) files = dirData.list;
  }

  // Build final links
  const workerOrigin = new URL(request.url).origin;
  const links = files.map(f => {
    const sizeMB = +(f.size / 1024 / 1024).toFixed(2);
    const proxyUrl = `${workerOrigin}/proxy?u=${encodeURIComponent(f.dlink)}`;
    return {
      name: f.server_filename,
      size_mb: sizeMB,
      original_url: f.dlink,
      download_url: proxyUrl,
      proxied: true
    };
  });

  return json({ count: links.length, links });
}

// --- Helpers ---
function extract(str, start, end) {
  const s = str.indexOf(start);
  if (s === -1) return null;
  const e = str.indexOf(end, s + start.length);
  return e === -1 ? null : str.substring(s + start.length, e);
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...cors(), "Content-Type": "application/json" }
  });
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
