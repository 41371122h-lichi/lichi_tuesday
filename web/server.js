const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '1mb' })); // 啟用 Body JSON 解析

// ---- helpers ----
function sanitizeHeaders(incoming = {}) {
    // 規範化標頭名稱 (Express 的 req.headers 都是小寫)
    const normalized = Object.keys(incoming).reduce((acc, key) => {
        acc[key.toLowerCase()] = incoming[key];
        return acc;
    }, {});

    // 只保留必要的安全標頭，避免把 host/origin/accept-encoding 等轉給上游
    const out = {};
    if (normalized['accept']) out['accept'] = normalized['accept'];
    else out['accept'] = 'application/json';
    if (normalized['content-type']) out['content-type'] = normalized['content-type'];
    if (normalized['authorization']) out['authorization'] = normalized['authorization'];
    return out;
}

function ensureTrailingSlashForKnownV1(targetUrl) {
    const [path, qs] = targetUrl.split('?');
    if (/\/api\/v1\/dashboard$/.test(path) || /\/api\/v1\/component\/\d+\/chart$/.test(path)) {
        const fixed = path.endsWith('/') ? path : path + '/';
        return qs ? `${fixed}?${qs}` : fixed;
    }
    return targetUrl;
}

// 1) 代理 /api/v1/dashboard
app.get('/api/taipei/dashboard', async (req, res) => {
    try {
        const qs = new URLSearchParams(req.query).toString();
        let target = `https://citydashboard.taipei/api/v1/dashboard${qs ? `?${qs}` : ''}`;
        target = ensureTrailingSlashForKnownV1(target);
        console.log('[PROXY:TAIPEI/DASHBOARD] ->', 'GET', target);

        const r = await fetch(target, { headers: sanitizeHeaders(req.headers) });
        const text = await r.text();
        res.status(r.status).set('Content-Type', r.headers.get('content-type') || 'application/json');
        try { res.send(JSON.parse(text)); } catch { res.send(text); }
    } catch (e) {
        console.error('[ERROR:TAIPEI/DASHBOARD]', e);
        res.status(500).json({ error: String(e) });
    }
});

// 2) 代理 /api/v1/dashboard/construction (您 AItest 組件需要的)
app.get("/api/taipei/construction", async (req, res) => {
    try {
        // 目標 URL
        const target = "https://citydashboard.taipei/api/v1/dashboard/construction";
        console.log('[PROXY:TAIPEI/CONSTRUCTION] ->', 'GET', target);

        const r = await fetch(target, { 
            headers: sanitizeHeaders(req.headers) 
        });
        const text = await r.text();
        res.status(r.status).set('Content-Type', r.headers.get("content-type") || "application/json");
        try { res.send(JSON.parse(text)); } catch { res.send(text); }
    } catch (e) {
        console.error('[ERROR:TAIPEI/CONSTRUCTION]', e);
        res.status(500).json({ error: String(e) });
    }
});

// 讓前端可以直接呼叫 /api/v1/component/57/chart?city=taipei 等路徑
app.use('/api/v1', async (req, res) => {
    try {
        // 從 /api/v1 之後的路徑開始計算
        let suffix = req.originalUrl.replace(/^\/api\/v1/, ''); 
        let target = `https://citydashboard.taipei/api/v1${suffix}`;
        target = ensureTrailingSlashForKnownV1(target);
        
        const headers = sanitizeHeaders(req.headers);
        const init = { method: req.method, headers };

        // 處理 POST/PUT 等請求的 Body
        if (req.method !== 'GET' && req.method !== 'HEAD') {
            const contentType = headers['content-type'] || 'application/json';
            init.headers['content-type'] = contentType;
            
            // 嘗試從 Express 解析的 req.body 取得內容
            if (req.body && Object.keys(req.body).length) {
                // 如果是 JSON 格式，將其字串化
                if (contentType.includes('application/json')) {
                    init.body = JSON.stringify(req.body);
                } else {
                    // 如果是其他格式 (例如純文字)，直接使用
                    init.body = req.body;
                }
            }
        }

        console.log('[PROXY:V1-ALL] ->', req.method, target);
        const r = await fetch(target, init);
        const text = await r.text();
        res.status(r.status).set('Content-Type', r.headers.get('content-type') || 'application/json');
        
        // 嘗試解析 JSON，否則發送純文字
        try { res.send(JSON.parse(text)); } catch { res.send(text); }
    } catch (e) {
        console.error('[ERROR:V1-ALL]', e);
        res.status(500).json({ error: "Proxy 萬用轉發錯誤：" + String(e) });
    }
});


// ----------------------------------------------------------------------------------
// ---- 超彈性代理：POST /proxy { url, method, headers, body } (通用除錯工具) ----
// ----------------------------------------------------------------------------------
app.post('/proxy', async (req, res) => {
    try {
        const { url, method = 'GET', headers = {}, body } = req.body || {};
        if (!url) return res.status(400).json({ error: 'Missing url in body' });

        const init = { method, headers: sanitizeHeaders(headers) };
        if (method !== 'GET' && method !== 'HEAD' && body !== undefined) {
            // 處理 JSON/純文字 Body
            if (typeof body === 'object' && !Buffer.isBuffer(body)) {
                init.headers['content-type'] = init.headers['content-type'] || 'application/json';
                init.body = JSON.stringify(body);
            } else {
                init.body = body;
            }
        }

        console.log('[PROXY:RAW] ->', method, url);
        const r = await fetch(url, init);
        const text = await r.text();
        res.status(r.status).set('Content-Type', r.headers.get('content-type') || 'application/json');
        
        // 嘗試解析 JSON，否則發送純文字
        try { res.send(JSON.parse(text)); } catch { res.send(text); }
    } catch (e) {
        console.error('[ERROR:RAW]', e);
        res.status(500).json({ error: "Proxy 原始請求錯誤：" + String(e) });
    }
});


// ----------------------------------------------------------------------------------
// ---- 啟動伺服器 ----
// ----------------------------------------------------------------------------------
// 確保 app.listen 放在所有路由定義的後面
app.listen(PORT, () => console.log(`Proxy on http://localhost:${PORT}`));