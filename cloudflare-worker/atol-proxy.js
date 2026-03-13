/**
 * ATOL Online CORS Proxy — Cloudflare Worker
 *
 * Проксирует запросы от CRM (GitHub Pages) к ATOL Online API,
 * добавляя CORS-заголовки для браузерного доступа.
 *
 * Деплой:
 * 1. Зайти на https://dash.cloudflare.com → Workers & Pages → Create
 * 2. Вставить этот код → Deploy
 * 3. Скопировать URL Worker'а (например: https://atol-proxy.yourname.workers.dev)
 * 4. Вставить URL в настройках CRM → ATOL Online → URL прокси
 */

const ATOL_BASE = 'https://online.atol.ru/possystem';
const ALLOWED_ORIGINS = [
    'https://bochkarevadim.github.io',
    'http://localhost:3000',
    'http://localhost:5500',
    'http://127.0.0.1:5500'
];

function corsHeaders(origin) {
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Token',
        'Access-Control-Max-Age': '86400',
    };
}

async function handleRequest(request) {
    const origin = request.headers.get('Origin') || '';

    // Preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    const url = new URL(request.url);
    // Path: /v4/getToken, /v4/{group}/sell, etc.
    const atolPath = url.pathname;

    if (!atolPath || atolPath === '/') {
        return new Response(JSON.stringify({ error: 'Specify ATOL API path, e.g. /v4/getToken' }), {
            status: 400,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        });
    }

    const atolUrl = ATOL_BASE + atolPath + url.search;

    // Build proxied request
    const headers = new Headers();
    headers.set('Content-Type', 'application/json; charset=utf-8');

    // Forward Token header if present
    const token = request.headers.get('Token');
    if (token) {
        headers.set('Token', token);
    }

    const fetchOptions = {
        method: request.method,
        headers: headers
    };

    if (request.method === 'POST') {
        fetchOptions.body = await request.text();
    }

    try {
        const response = await fetch(atolUrl, fetchOptions);
        const body = await response.text();

        return new Response(body, {
            status: response.status,
            headers: {
                ...corsHeaders(origin),
                'Content-Type': 'application/json; charset=utf-8'
            }
        });
    } catch (err) {
        return new Response(JSON.stringify({ error: 'Proxy error: ' + err.message }), {
            status: 502,
            headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' }
        });
    }
}

export default {
    async fetch(request) {
        return handleRequest(request);
    }
};
