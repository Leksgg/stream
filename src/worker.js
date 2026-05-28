export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const params = url.searchParams;
    const isTxt = url.pathname.endsWith('.txt');

    // If not a .txt file, serve static asset as-is
    if (!isTxt) {
      return env.ASSETS.fetch(request);
    }

    // If .txt with no query params, return 1 random line by default
    const cleanUrl = new URL(url.pathname, url.origin);
    const isDbdPerks = cleanUrl.pathname.endsWith('/txt/dbdperks.txt');

    let lines;
    if (isDbdPerks) {
      lines = await loadNightlightPerks();
      if (!lines.length) {
        lines = await loadAssetLines(env, cleanUrl.toString());
      }
    } else {
      lines = await loadAssetLines(env, cleanUrl.toString());
    }

    if (!lines.length) {
      return new Response('File not found', { status: 404, headers: corsHeaders('text/plain; charset=utf-8') });
    }

    let result;

    if (params.has('full')) {
      // ?full=true → archivo completo
      result = lines.join('\n');

    } else if (params.has('find')) {
      // ?find=keyword → busca en la línea, devuelve solo la parte después de |
      const keyword = params.get('find').toLowerCase();
      const matches = lines
        .filter(line => line.toLowerCase().includes(keyword))
        .map(line => line.includes('|') ? line.split('|').slice(1).join('|').trim() : line);
      result = matches.length > 0 ? matches.join('\n') : 'No results found';

    } else if (params.has('line')) {
      // ?line=N → línea exacta por número (1-based)
      const n = parseInt(params.get('line'), 10);
      if (n < 1 || n > lines.length || isNaN(n)) {
        result = `Invalid line number (1-${lines.length})`;
      } else {
        result = lines[n - 1];
      }

    } else if (params.has('return')) {
      // ?return=N → N líneas aleatorias sin repetir
      const count = Math.min(parseInt(params.get('return'), 10) || 1, lines.length);
      const shuffled = [...lines].sort(() => Math.random() - 0.5);
      result = shuffled.slice(0, count).join(' | ');

    } else {
      // Default: 1 línea aleatoria
      result = lines[Math.floor(Math.random() * lines.length)];
    }

    return new Response(result, {
      headers: corsHeaders('text/plain; charset=utf-8'),
    });
  },
};

async function loadAssetLines(env, assetUrl) {
  const assetResponse = await env.ASSETS.fetch(assetUrl);
  if (!assetResponse.ok) {
    return [];
  }

  const buffer = await assetResponse.arrayBuffer();
  const text = new TextDecoder('utf-8').decode(buffer);
  return text.split('\n').map(line => line.trim()).filter(Boolean);
}

async function loadNightlightPerks() {
  try {
    const response = await fetch('https://nightlight.gg/perks/viewer?shown=pick', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
      },
    });

    if (!response.ok) {
      return [];
    }

    const html = await response.text();
    const seen = new Set();
    const lines = [];
    const regex = /\|\s*([^|]+?)\s+(\d+)\s+Games\s*\|\s*([^|]+?)\|/g;

    let match;
    while ((match = regex.exec(html)) !== null) {
      const name = match[1].replace(/\s+/g, ' ').trim();
      const games = match[2].trim();
      const stats = match[3].replace(/\s+/g, ' ').trim();
      const line = `${name} | ${games} Games | ${stats}`;

      if (!seen.has(line)) {
        seen.add(line);
        lines.push(line);
      }
    }

    return lines;
  } catch (error) {
    return [];
  }
}

function corsHeaders(contentType) {
  return {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': contentType,
    'Cache-Control': 'no-cache',
  };
}
