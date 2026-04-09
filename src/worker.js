export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const params = url.searchParams;

    // If no query params or not a .txt file, serve static asset as-is
    if (!url.pathname.endsWith('.txt') || params.toString() === '') {
      return env.ASSETS.fetch(request);
    }

    // Fetch the raw file from assets
    const assetResponse = await env.ASSETS.fetch(new Request(url.origin + url.pathname));
    if (!assetResponse.ok) {
      return new Response('File not found', { status: 404, headers: corsHeaders() });
    }

    const text = await assetResponse.text();
    const lines = text.split('\n').filter(line => line.trim() !== '');

    let result;

    if (params.has('full')) {
      // ?full=true → archivo completo
      result = lines.join('\n');

    } else if (params.has('find')) {
      // ?find=keyword → líneas que contengan el texto
      const keyword = params.get('find').toLowerCase();
      const matches = lines.filter(line => line.toLowerCase().includes(keyword));
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

function corsHeaders(contentType) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  };
  if (contentType) headers['Content-Type'] = contentType;
  return headers;
}
