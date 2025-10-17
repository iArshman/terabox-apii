// TeraBox API Cloudflare Worker
// Update these cookies regularly from your browser

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
  async fetch(request, env, ctx) {
    return handleRequest(request);
  }
};

export async function onRequest(context) {
  const { request } = context;
  return handleRequest(request);
}

async function handleRequest(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: corsHeaders()
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const targetUrl = searchParams.get("url");
    
    if (!targetUrl) {
      return jsonResponse({ 
        error: "No URL provided", 
        usage: "?url=<terabox_link>",
        example: "?url=https://teraboxshare.com/s/1ABC..."
      }, 400);
    }

    console.log(`Processing URL: ${targetUrl}`);

    // Use terabox.app or 1024tera.com
    let mirrorUrl = targetUrl;
    if (targetUrl.includes('teraboxshare.com')) {
      mirrorUrl = targetUrl.replace('teraboxshare.com', '1024tera.com');
    } else if (targetUrl.includes('terafileshare.com')) {
      mirrorUrl = targetUrl.replace('terafileshare.com', '1024tera.com');
    } else if (targetUrl.includes('teraboxapp.com')) {
      mirrorUrl = targetUrl.replace('teraboxapp.com', '1024tera.com');
    }

    console.log(`Mirror URL: ${mirrorUrl}`);

    // 1️⃣ Fetch shared page with cookies
    const cookieString = Object.entries(COOKIES)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');

    const res = await fetch(mirrorUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": cookieString,
        "Referer": "https://www.1024tera.com/"
      },
      redirect: 'follow'
    });

    if (!res.ok) {
      return jsonResponse({ 
        error: `Failed to fetch page: ${res.status} ${res.statusText}`,
        url: mirrorUrl
      }, res.status);
    }

    const html = await res.text();
    console.log(`HTML length: ${html.length}`);

    // 2️⃣ Extract jsToken and dp-logid
    const jsToken = findBetween(html, 'fn%28%22', '%22%29');
    const logId = findBetween(html, 'dp-logid=', '&');

    if (!jsToken || !logId) {
      console.error("Failed to extract tokens");
      return jsonResponse({ 
        error: "Failed to extract authentication tokens. Possible reasons:",
        reasons: [
          "Cookies expired - update COOKIES in worker code",
          "CAPTCHA page detected",
          "Invalid share link",
          "Region blocked"
        ],
        debug: {
          hasJsToken: !!jsToken,
          hasLogId: !!logId
        }
      }, 403);
    }

    console.log(`Extracted jsToken: ${jsToken.substring(0, 20)}...`);
    console.log(`Extracted logId: ${logId}`);

    // 3️⃣ Extract surl from final URL
    const finalUrl = res.url;
    let surl = null;

    if (finalUrl.includes("surl=")) {
      surl = finalUrl.split("surl=")[1].split("&")[0];
    } else if (finalUrl.includes("/s/")) {
      surl = finalUrl.split("/s/")[1].split("?")[0];
    }

    if (!surl) {
      return jsonResponse({ 
        error: "Could not extract surl parameter",
        finalUrl: finalUrl
      }, 400);
    }

    console.log(`Extracted surl: ${surl}`);

    // 4️⃣ Call /share/list API with cookies
    const apiUrl = new URL("https://www.terabox.app/share/list");
    apiUrl.searchParams.set("app_id", "250528");
    apiUrl.searchParams.set("web", "1");
    apiUrl.searchParams.set("channel", "dubox");
    apiUrl.searchParams.set("clienttype", "0");
    apiUrl.searchParams.set("jsToken", jsToken);
    apiUrl.searchParams.set("dplogid", logId);
    apiUrl.searchParams.set("page", "1");
    apiUrl.searchParams.set("num", "20");
    apiUrl.searchParams.set("order", "time");
    apiUrl.searchParams.set("desc", "1");
    apiUrl.searchParams.set("shorturl", surl);
    apiUrl.searchParams.set("root", "1");
    apiUrl.searchParams.set("site_referer", finalUrl);

    console.log(`Calling API: ${apiUrl.toString().substring(0, 100)}...`);

    const apiRes = await fetch(apiUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "en-US,en;q=0.9",
        "Cookie": cookieString,
        "Referer": finalUrl
      }
    });

    if (!apiRes.ok) {
      return jsonResponse({ 
        error: `API request failed: ${apiRes.status} ${apiRes.statusText}`,
        url: apiUrl.toString().substring(0, 150) + "..."
      }, apiRes.status);
    }

    const data = await apiRes.json();
    console.log(`API response errno: ${data.errno}`);

    // Handle API errors
    if (data.errno && data.errno !== 0) {
      const errorMessages = {
        400141: "Verification required (password/captcha)",
        "-1": "Invalid request",
        "9019": "Share link expired or invalid"
      };

      return jsonResponse({ 
        error: errorMessages[data.errno] || data.errmsg || "API error",
        errno: data.errno,
        message: data.errmsg,
        tip: data.errno === 400141 
          ? "This link requires password or captcha verification" 
          : "Try refreshing cookies or check if link is valid"
      }, 400);
    }

    // Check if we have files
    if (!data.list || !data.list.length) {
      return jsonResponse({ 
        error: "No files found",
        debug: {
          hasData: !!data,
          hasList: !!data.list,
          listLength: data.list?.length || 0
        }
      }, 404);
    }

    console.log(`Found ${data.list.length} items`);

    // 5️⃣ Handle directory if needed
    let files = data.list;

    if (files[0]?.isdir === "1") {
      console.log("First item is directory, fetching contents...");
      
      const dirUrl = new URL("https://www.terabox.app/share/list");
      dirUrl.searchParams.set("app_id", "250528");
      dirUrl.searchParams.set("web", "1");
      dirUrl.searchParams.set("channel", "dubox");
      dirUrl.searchParams.set("clienttype", "0");
      dirUrl.searchParams.set("jsToken", jsToken);
      dirUrl.searchParams.set("dplogid", logId);
      dirUrl.searchParams.set("page", "1");
      dirUrl.searchParams.set("num", "20");
      dirUrl.searchParams.set("order", "asc");
      dirUrl.searchParams.set("by", "name");
      dirUrl.searchParams.set("shorturl", surl);
      dirUrl.searchParams.set("dir", files[0].path);
      dirUrl.searchParams.set("site_referer", finalUrl);

      const dirRes = await fetch(dirUrl.toString(), {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
          "Accept": "application/json",
          "Cookie": cookieString,
          "Referer": finalUrl
        }
      });

      if (dirRes.ok) {
        const dirData = await dirRes.json();
        if (dirData.list && dirData.list.length) {
          files = dirData.list;
          console.log(`Found ${files.length} files in directory`);
        }
      }
    }

    // 6️⃣ Format and return results
    const formattedFiles = files.map(f => ({
      filename: f.server_filename,
      size: formatSize(f.size),
      size_bytes: f.size,
      download_link: f.dlink,
      is_directory: f.isdir === "1",
      thumbnail: f.thumbs?.url3 || f.thumbs?.url2 || f.thumbs?.url1 || null,
      path: f.path,
      fs_id: f.fs_id
    }));

    return jsonResponse({
      status: "success",
      url: targetUrl,
      files: formattedFiles,
      total_files: formattedFiles.length,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error("Error:", err);
    return jsonResponse({ 
      error: err.message || "Unexpected error",
      stack: err.stack?.substring(0, 200)
    }, 500);
  }
}

// --- Helper Functions ---

function findBetween(str, start, end) {
  const startIndex = str.indexOf(start);
  if (startIndex === -1) return null;
  const endIndex = str.indexOf(end, startIndex + start.length);
  return endIndex === -1 ? null : str.substring(startIndex + start.length, endIndex);
}

function formatSize(bytes) {
  if (!bytes || isNaN(bytes)) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = parseFloat(bytes);
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
    headers: { 
      ...corsHeaders(), 
      "Content-Type": "application/json"
    }
  });
}

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}
