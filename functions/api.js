// TeraBox Download Links Extractor - SIMPLE VERSION
// Just returns download links, nothing else!

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
    return handleRequest(request);
  }
};

export async function onRequest(context) {
  return handleRequest(context.request);
}

async function handleRequest(request) {
  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors() });
  }

  try {
    const url = new URL(request.url).searchParams.get("url");
    
    if (!url) {
      return json({ error: "Add ?url=YOUR_TERABOX_LINK" }, 400);
    }

    // Get cookies string
    const cookies = Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ');

    // Normalize URL
    let mirrorUrl = url;
    if (url.includes('/s/')) {
      const surl = url.split('/s/')[1].split('?')[0];
      mirrorUrl = `https://www.1024tera.com/s/${surl}`;
    } else if (url.includes('surl=')) {
      const surl = url.split('surl=')[1].split('&')[0];
      mirrorUrl = `https://www.1024tera.com/sharing/link?surl=${surl}`;
    }

    // Step 1: Fetch page
    const page = await fetch(mirrorUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        "Cookie": cookies
      }
    });

    const html = await page.text();
    const finalUrl = page.url;

    // Step 2: Extract tokens
    const jsToken = extract(html, 'fn%28%22', '%22%29');
    const logId = extract(html, 'dp-logid=', '&');
    const surl = finalUrl.includes('surl=') 
      ? finalUrl.split('surl=')[1].split('&')[0]
      : finalUrl.split('/s/')[1]?.split('?')[0];

    if (!jsToken || !logId || !surl) {
      return json({ error: "Failed to extract tokens. Cookies expired?" }, 403);
    }

    // Step 3: Get file list
    const api = `https://www.terabox.app/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dplogid=${logId}&page=1&num=20&shorturl=${surl}&root=1`;
    
    const res = await fetch(api, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Cookie": cookies,
        "Referer": finalUrl
      }
    });

    const data = await res.json();

    if (data.errno !== 0) {
      return json({ error: data.errmsg || "API error", errno: data.errno }, 400);
    }

    if (!data.list?.length) {
      return json({ error: "No files found" }, 404);
    }

    let files = data.list;

    // Handle directory
    if (files[0]?.isdir === "1") {
      const dirApi = `https://www.terabox.app/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dplogid=${logId}&page=1&num=20&shorturl=${surl}&dir=${files[0].path}&by=name&order=asc`;
      
      const dirRes = await fetch(dirApi, {
        headers: { "Cookie": cookies, "Referer": finalUrl }
      });
      
      const dirData = await dirRes.json();
      if (dirData.list?.length) files = dirData.list;
    }

    // Return ONLY download links
const links = files.map(f => ({
  name: f.server_filename,
  download_url: f.dlink
}));

return json({ links });

  } catch (err) {
    return json({ error: err.message }, 500);
  }
}

// Helpers
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
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
