/**
 * Terabox Download API - Cloudflare Pages Function
 * Mobile-friendly deployment
 */

export async function onRequest(context) {
  const { request } = context;
  
  // Handle CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }

  try {
    const url = new URL(request.url);
    const teraboxUrl = url.searchParams.get('url');

    if (!teraboxUrl) {
      return jsonResponse({ 
        error: 'No URL provided',
        usage: 'Add ?url=YOUR_TERABOX_LINK'
      }, 400);
    }

    // Convert domain if needed
    let convertedUrl = teraboxUrl;
    if (teraboxUrl.includes('terabox')) {
      const urlObj = new URL(teraboxUrl);
      convertedUrl = teraboxUrl.replace(urlObj.hostname, '1024tera.com');
    }

    // Fetch Terabox page
    const response = await fetch(convertedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      return jsonResponse({ 
        error: `Failed to access Terabox: HTTP ${response.status}` 
      }, response.status);
    }

    const html = await response.text();

    // Extract file information using regex
    const dlinkMatch = html.match(/"dlink"\s*:\s*"([^"]+)"/);
    const filenameMatch = html.match(/"server_filename"\s*:\s*"([^"]+)"/);
    const sizeMatch = html.match(/"size"\s*:\s*(\d+)/);

    if (!dlinkMatch) {
      return jsonResponse({ 
        error: 'Could not extract download link. Link may be expired or invalid.' 
      }, 404);
    }

    // Clean up escaped URLs
    const downloadLink = dlinkMatch[1].replace(/\\\//g, '/');

    return jsonResponse({
      success: true,
      file_name: filenameMatch ? filenameMatch[1] : 'Terabox File',
      direct_link: downloadLink,
      size: sizeMatch ? formatSize(parseInt(sizeMatch[1])) : 'Unknown',
      sizebytes: sizeMatch ? parseInt(sizeMatch[1]) : 0,
      link: downloadLink // Alternative key for compatibility
    });

  } catch (error) {
    return jsonResponse({ 
      error: error.message || 'Unknown error occurred' 
    }, 500);
  }
}

// Helper function to format file size
function formatSize(bytes) {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

// Helper function to create JSON response
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-cache'
    }
  });
}
