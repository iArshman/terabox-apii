// TeraBox Debug Worker - Shows exactly what's happening at each step

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
  const debug = [];
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: cors() });
  }

  try {
    const url = new URL(request.url).searchParams.get("url");
    
    if (!url) {
      return json({ 
        error: "No URL provided",
        usage: "Add ?url=YOUR_TERABOX_LINK"
      }, 400);
    }

    debug.push(`✅ Step 1: Got URL: ${url}`);

    // Prepare cookies
    const cookieStr = Object.entries(COOKIES).map(([k, v]) => `${k}=${v}`).join('; ');
    debug.push(`✅ Step 2: Cookies prepared (${Object.keys(COOKIES).length} cookies)`);

    // Fetch page
    const mirrorUrl = url.replace(/terabox(share|app)?\.com|terafileshare\.com/gi, '1024tera.com');
    debug.push(`✅ Step 3: Fetching: ${mirrorUrl}`);

    const pageRes = await fetch(mirrorUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0.0.0",
        "Cookie": cookieStr,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
      },
      redirect: 'follow'
    });

    debug.push(`✅ Step 4: Page status: ${pageRes.status}`);

    if (!pageRes.ok) {
      return json({
        error: `Failed to fetch page (status ${pageRes.status})`,
        debug
      }, pageRes.status);
    }

    const html = await pageRes.text();
    const finalUrl = pageRes.url;
    
    debug.push(`✅ Step 5: Got HTML (${html.length} chars)`);
    debug.push(`✅ Step 6: Final URL: ${finalUrl}`);

    // Extract tokens
    const jsToken = extract(html, 'fn%28%22', '%22%29');
    const logId = extract(html, 'dp-logid=', '&');
    
    debug.push(`${jsToken ? '✅' : '❌'} Step 7: jsToken: ${jsToken ? jsToken.substring(0, 30) + '...' : 'NOT FOUND'}`);
    debug.push(`${logId ? '✅' : '❌'} Step 8: logId: ${logId || 'NOT FOUND'}`);

    if (!jsToken || !logId) {
      // Show part of HTML for debugging
      const htmlSnippet = html.substring(0, 500);
      return json({
        error: "Failed to extract tokens",
        possible_reasons: [
          "Cookies expired - update COOKIES in worker",
          "CAPTCHA page detected",
          "Link is invalid or expired"
        ],
        debug,
        html_snippet: htmlSnippet
      }, 403);
    }

    // Extract surl
    let surl = null;
    if (finalUrl.includes('surl=')) {
      surl = finalUrl.split('surl=')[1].split('&')[0];
    } else if (finalUrl.includes('/s/')) {
      surl = finalUrl.split('/s/')[1].split('?')[0];
    }

    debug.push(`${surl ? '✅' : '❌'} Step 9: surl: ${surl || 'NOT FOUND'}`);

    if (!surl) {
      return json({
        error: "Could not extract surl",
        finalUrl,
        debug
      }, 400);
    }

    // Call API
    const apiUrl = `https://www.terabox.app/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dplogid=${logId}&page=1&num=20&shorturl=${surl}&root=1`;
    
    debug.push(`✅ Step 10: Calling API...`);

    const apiRes = await fetch(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Cookie": cookieStr,
        "Referer": finalUrl,
        "Accept": "application/json"
      }
    });

    debug.push(`✅ Step 11: API status: ${apiRes.status}`);

    const data = await apiRes.json();
    
    debug.push(`✅ Step 12: API response errno: ${data.errno}`);
    debug.push(`✅ Step 13: API has list: ${!!data.list}`);
    debug.push(`✅ Step 14: Files count: ${data.list?.length || 0}`);

    if (data.errno !== 0) {
      return json({
        error: data.errmsg || "API returned error",
        errno: data.errno,
        errno_meaning: getErrorMeaning(data.errno),
        debug,
        api_response: data
      }, 400);
    }

    if (!data.list || data.list.length === 0) {
      return json({
        error: "No files in response",
        debug,
        api_response: data
      }, 404);
    }

    let files = data.list;

    // Handle directory
    if (files[0]?.isdir === "1") {
      debug.push(`✅ Step 15: First item is directory, fetching contents...`);
      
      const dirUrl = `https://www.terabox.app/share/list?app_id=250528&web=1&channel=dubox&clienttype=0&jsToken=${jsToken}&dplogid=${logId}&page=1&num=20&shorturl=${surl}&dir=${encodeURIComponent(files[0].path)}&by=name&order=asc`;
      
      const dirRes = await fetch(dirUrl, {
        headers: {
          "Cookie": cookieStr,
          "Referer": finalUrl,
          "Accept": "application/json"
        }
      });

      const dirData = await dirRes.json();
      
      if (dirData.list?.length) {
        files = dirData.list;
        debug.push(`✅ Step 16: Found ${files.length} files in directory`);
      }
    }

    // Extract links
    const links = files.map(f => ({
      name: f.server_filename,
      link: f.dlink,
      size: formatSize(f.size)
    }));

    debug.push(`✅ Step 17: SUCCESS! Extracted ${links.length} download links`);

    return json({
      status: "SUCCESS",
      links,
      debug
    });

  } catch (err) {
    debug.push(`❌ ERROR: ${err.message}`);
    return json({
      error: err.message,
      stack: err.stack?.substring(0, 300),
      debug
    }, 500);
  }
}

function extract(str, start, end) {
  const s = str.indexOf(start);
  if (s === -1) return null;
  const e = str.indexOf(end, s + start.length);
  return e === -1 ? null : str.substring(s + start.length, e);
}

function formatSize(bytes) {
  if (!bytes) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = parseFloat(bytes);
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit++;
  }
  return `${size.toFixed(2)} ${units[unit]}`;
}

function getErrorMeaning(errno) {
  const errors = {
    400141: "Verification required (password/captcha)",
    9019: "Share link expired or deleted",
    "-1": "Invalid request",
    0: "Success"
  };
  return errors[errno] || "Unknown error";
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 
      ...cors(), 
      "Content-Type": "application/json"
    }
  });
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}
