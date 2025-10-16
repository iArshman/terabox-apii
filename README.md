# Terabox Download API

Cloudflare Pages Function for extracting Terabox download links.

## Usage

https://your-project.pages.dev/api?url=YOUR_TERABOX_LINK

text

## Example

https://your-project.pages.dev/api?url=https://terabox.com/s/1abc123

text

## Response Format

{
"success": true,
"file_name": "example.mp4",
"direct_link": "https://...",
"size": "125.50 MB",
"sizebytes": 131621888,
"link": "https://..."
}

text

## Deploy

1. Fork this repo
2. Connect to Cloudflare Pages
3. Deploy automatically

Free tier: 100,000 requests/day
