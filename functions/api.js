export async function onRequest(context) {
  const { request } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders()
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");

    if (!targetUrl) {
      return jsonResponse({ error: "No URL provided", usage: "?url=<terabox_link>" }, 400);
    }

    const mirrorUrl = targetUrl.replace(/terabox\.com|teraboxapp\.com|terafileshare\.com/gi, "1024tera.com");

    // 1️⃣ Fetch shared page
    const res = await fetch(mirrorUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      }
    });

    const html = await res.text();

    // 2️⃣ Extract jsToken and dp-logid
    const jsToken = findBetween(html, 'fn%28%22', '%22%29');
    const logId = findBetween(html, 'dp-logid=', '&');
    if (!jsToken || !logId) {
      return jsonResponse({ error: "Failed to extract jsToken or logId (maybe CAPTCHA page)" }, 403);
    }

    // 3️⃣ Extract surl param from redirect URL
    const finalUrl = res.url;
    const surl = finalUrl.includes("surl=") ? finalUrl.split("surl=")[1] : null;
    if (!surl) return jsonResponse({ error: "Could not find surl param" }, 400);

    // 4️⃣ Call /share/list API
    const apiUrl = `https://www.1024tera.com/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dplogid=${logId}&page=1&num=20&order=time&desc=1&shorturl=${surl}&root=1`;

    const apiRes = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json"
      }
    });

    const data = await apiRes.json();

    if (!data.list || !data.list.length) {
      return jsonResponse({ error: "No files found or API returned empty list" }, 404);
    }

    // 5️⃣ Return formatted data
    const files = data.list.map(f => ({
      file_name: f.server_filename,
      sizebytes: f.size,
      size: formatSize(f.size),
      direct_link: f.dlink,
      is_dir: f.isdir === "1",
      thumb: f.thumbs?.url3 || null
    }));

    return jsonResponse({
      success: true,
      shortlink: targetUrl,
      files
    });
  } catch (err) {
    return jsonResponse({ error: err.message || "Unexpected error" }, 500);
  }
}

// --- Helpers ---
function findBetween(str, start, end) {
  const startIndex = str.indexOf(start);
  if (startIndex === -1) return null;
  const endIndex = str.indexOf(end, startIndex + start.length);
  return endIndex === -1 ? null : str.substring(startIndex + start.length, endIndex);
}

function formatSize(bytes) {
  if (!bytes || isNaN(bytes)) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(2)} ${units[unit]}`;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
