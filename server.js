/**
 * JLCPCB/LCSC API 后端代理服务
 *
 * 为前端提供 LCSC 立创商城 API 代理，处理 HMAC-SHA256 签名认证
 * 同时提供静态文件服务（可替代 python -m http.server 5000）
 *
 * 使用方式：
 *   npm install
 *   node server.js
 *   访问 http://localhost:5000
 */
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const https = require('https');
const http = require('http');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;
const LCSC_BASE = 'https://open-api.jlc.com';

// =============== 项目根目录检测 ===============
// 优先使用 __dirname（server.js 所在目录），其次 fallback 到 cwd
// 这解决了某些 Windows 桌面重定向环境下 __dirname 解析异常的问题
function findProjectRoot() {
    const dirs = [
        path.resolve(__dirname),
        path.resolve(process.cwd())
    ];
    const seen = new Set();
    for (const dir of dirs) {
        if (seen.has(dir)) continue;
        seen.add(dir);
        if (fs.existsSync(path.join(dir, 'index.html'))) {
            console.log('[Root] 项目根目录:', dir);
            return dir;
        }
    }
    console.error('[Root] 找不到 index.html，请检查目录：', Array.from(seen));
    process.exit(1);
}

const PROJECT_ROOT = findProjectRoot();
const DATA_DIR = path.join(PROJECT_ROOT, 'data');
const DATA_FILE = path.join(DATA_DIR, 'components.json');
const SETTINGS_DIR = path.join(DATA_DIR, 'settings');
const SETTINGS_FILE = path.join(SETTINGS_DIR, 'settings.json');

app.use(cors({
    origin: function(origin, callback) {
        // 允许所有来源，包括 null（file://协议）
        callback(null, true);
    },
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));

// 请求日志
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url} (origin: ${req.headers.origin || '直接访问'})`);
    next();
});

// =============== HMAC-SHA256 签名工具 ===============

/**
 * 生成随机字符串 nonce
 * 对应 Java SDK 的 NonceKit.createNonce()
 */
function createNonce(length) {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

/**
 * 构建待签名字符串
 * 支持多种签名格式（用于调试）
 * 从 SignAuthorization.getAuthorization() 反推：
 * - 涉及 appId, accessKey, timestamp, nonce
 * - canonicalURI = path + (query ? "?" + query : "")
 * - method = HTTP method (POST)
 * - requestPayload = JSON body
 * - contextPath 默认为空
 *
 * 尝试两种格式:
 *   Format1: appId + accessKey + timestamp + nonce + canonicalURI + method + body (原始反推)
 *   Format2: method + "\n" + canonicalURI + "\n" + body (常见阿里云/华为云风格)
 *
 * @param {Object} params 签名参数
 * @returns {string} 待签名字符串
 */
function buildStringToSign({ appId, accessKey, timestamp, nonce, method, uri, body, contextPath }) {
    const canonicalURI = uri;  // 路径 + 查询字符串
    const requestPayload = body || '';

    // 首选格式: method + "\n" + canonicalURI + "\n" + body (标准 REST API 签名)
    const stringToSign = method + '\n' + canonicalURI + '\n' + requestPayload;

    console.log('[Sign] stringToSign:', JSON.stringify(stringToSign));
    return stringToSign;
}

/**
 * MD5 哈希（用于 Content-MD5 头）
 */
function md5Hash(data) {
    return crypto.createHash('md5').update(data, 'utf8').digest('base64');
}

/**
 * HMAC-SHA256 签名
 * 对应 Java SDK 的 HmacSHA256Signer.computeHash() + Base64Kit.encodeToString()
 *
 * @param {string} stringToSign 待签名字符串
 * @param {string} secretKey 密钥
 * @returns {string} Base64 编码的签名
 */
function sign(stringToSign, secretKey) {
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(stringToSign, 'utf8');
    return hmac.digest('base64');
}

/**
 * 生成完整的 Authorization 头值
 * 格式: Signature appid="<appId>",accesskey="<accessKey>",timestamp="<ts>",nonce="<nonce>",signature="<sig>"
 *
 * @param {Object} auth 认证信息
 * @param {string} auth.appId
 * @param {string} auth.accessKey
 * @param {string} auth.secretKey
 * @param {string} uri 请求路径 (如 /lcsc/openapi/order/list)
 * @param {string} method HTTP 方法
 * @param {string} body 请求体 JSON 字符串
 * @returns {string} Authorization header value
 */
function buildAuthorization(auth, uri, method, body) {
    const timestamp = String(Date.now());
    const nonce = createNonce(32);
    const contextPath = '';  // 默认为空

    const stringToSign = buildStringToSign({
        appId: auth.appId,
        accessKey: auth.accessKey,
        timestamp,
        nonce,
        method,
        uri,
        body,
        contextPath
    });

    const signature = sign(stringToSign, auth.secretKey);

    const authValue = `Signature appid="${auth.appId}",accesskey="${auth.accessKey}",timestamp="${timestamp}",nonce="${nonce}",signature="${signature}"`;
    return authValue;
}

// =============== API 代理 ===============

/**
 * 转发请求到 JLCPCB Open API
 */
function proxyToLcsc(auth, endpoint, body) {
    return new Promise((resolve, reject) => {
        const requestBody = body ? JSON.stringify(body) : '';
        const uri = endpoint;  // e.g. /lcsc/openapi/order/list
        const method = 'POST';

        const authHeader = buildAuthorization(auth, uri, method, requestBody);

        const url = new URL(endpoint, LCSC_BASE);
        const options = {
            hostname: url.hostname,
            port: 443,
            path: url.pathname + (url.search || ''),
            method: method,
            headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'Accept-Language': 'zh-CN',
                'User-Agent': 'component-hub/2.3.0 (Node.js)'
            }
        };

        if (requestBody) {
            options.headers['Content-Length'] = Buffer.byteLength(requestBody, 'utf-8');
            options.headers['Content-MD5'] = md5Hash(requestBody);
        }

        console.log(`[Proxy] ${method} ${url.hostname}${url.pathname}`);
        console.log(`[Proxy] Authorization: ${authHeader.substring(0, 80)}...`);
        console.log(`[Proxy] Body: ${requestBody}`);

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    // 即使是 HTTP 200，API 内部可能返回错误码
                    if (res.statusCode === 200) {
                        resolve({ status: 200, data: parsed });
                    } else {
                        resolve({ status: res.statusCode, data: parsed, error: true });
                    }
                } catch (e) {
                    resolve({ status: res.statusCode, data: data, error: true });
                }
            });
        });

        req.on('error', (err) => {
            reject(err);
        });

        if (requestBody) {
            req.write(requestBody);
        }
        req.end();
    });
}

/**
 * 从请求体中提取 auth 信息
 */
function extractAuth(req) {
    const { appId, accessKey, secretKey } = req.body;
    if (!appId || !accessKey || !secretKey) {
        return null;
    }
    return { appId, accessKey, secretKey };
}

/**
 * 提取请求体中的业务参数（移除 auth 字段）
 */
function extractParams(req) {
    const { appId, accessKey, secretKey, ...params } = req.body;
    return params;
}

// =============== API 路由 ===============

/**
 * 统一的代理处理
 */
function createProxyHandler(endpoint) {
    return async (req, res) => {
        try {
            const auth = extractAuth(req);
            if (!auth) {
                return res.status(400).json({ success: false, message: '缺少 API 凭据 (appId, accessKey, secretKey)' });
            }

            const params = extractParams(req);
            const result = await proxyToLcsc(auth, endpoint, params);

            if (result.error) {
                return res.status(result.status).json(result.data);
            }
            res.json(result.data);
        } catch (err) {
            console.error(`[Proxy Error] ${endpoint}:`, err.message);
            res.status(500).json({ success: false, message: `请求失败: ${err.message}` });
        }
    };
}

// 测试连接 - 用最小的有效请求验证凭据
app.post('/api/lcsc/test-connection', async (req, res) => {
    try {
        const auth = extractAuth(req);
        if (!auth) {
            return res.status(400).json({ success: false, message: '缺少 API 凭据' });
        }

        // 使用分页查询订单列表作为测试（1条即可）
        const result = await proxyToLcsc(auth, '/lcsc/openapi/order/list', { currPage: 1, pageSize: 1 });
        if (result.status === 200 && result.data) {
            // 检查 API 业务状态码
            const code = result.data.code;
            if (code === undefined || code === null || code === '0' || code === 200) {
                return res.json({ success: true, message: '连接成功！API 凭据有效。' });
            } else {
                return res.json({
                    success: false,
                    message: `API 返回错误: ${result.data.msg || result.data.message || '未知错误'}`,
                    detail: result.data
                });
            }
        } else {
            return res.status(result.status).json({
                success: false,
                message: `HTTP ${result.status}: ${result.data?.msg || result.data?.message || '请求失败'}`,
                detail: result.data
            });
        }
    } catch (err) {
        console.error('[Test Connection Error]:', err.message);
        res.status(500).json({ success: false, message: `连接测试失败: ${err.message}` });
    }
});

// LCSC 订单列表
app.post('/api/lcsc/order/list', createProxyHandler('/lcsc/openapi/order/list'));

// LCSC 订单详情
app.post('/api/lcsc/order/detail', createProxyHandler('/lcsc/openapi/order/detail'));

// LCSC 订单进度
app.post('/api/lcsc/order/progress', createProxyHandler('/lcsc/openapi/order/progress'));

// LCSC 产品 SKU 基本信息
app.post('/api/lcsc/product/basic', createProxyHandler('/lcsc/openapi/sku/product/basic'));

// LCSC 产品搜索（关键词）
app.post('/api/lcsc/product/search', createProxyHandler('/lcsc/openapi/product/search/global'));

// LCSC 产品价格（按料号批量）
app.post('/api/lcsc/price', createProxyHandler('/lcsc/openapi/product/get/price/by/code'));

// LCSC 库存查询（按料号批量）
app.post('/api/lcsc/stock', createProxyHandler('/lcsc/openapi/stock/select/all/stock/by/id'));

// =============== 数据存储（文件持久化） ===============

// 确保 data 和 settings 目录存在
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(SETTINGS_DIR)) {
    fs.mkdirSync(SETTINGS_DIR, { recursive: true });
}

// 健康检查 - 前端用来检测后端是否运行
app.get('/api/data/health', (req, res) => {
    res.json({ status: 'ok', dataFile: DATA_FILE, dir: DATA_DIR, root: PROJECT_ROOT });
});

// 加载元器件数据
app.get('/api/data/components', (req, res) => {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const raw = fs.readFileSync(DATA_FILE, 'utf-8');
            const data = JSON.parse(raw);
            return res.json({ success: true, components: data.components || [] });
        }
        res.json({ success: true, components: [] });
    } catch (e) {
        console.error('[Data] 读取数据文件失败:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 保存元器件数据
app.post('/api/data/components', (req, res) => {
    try {
        const { components } = req.body;
        if (!Array.isArray(components)) {
            return res.status(400).json({ success: false, message: '数据格式错误' });
        }
        const data = { version: '2.0', updatedAt: new Date().toISOString(), components };
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
        res.json({ success: true, count: components.length });
    } catch (e) {
        console.error('[Data] 保存数据文件失败:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// =============== 设置持久化（文件存储） ===============

/**
 * 读取设置文件
 */
function loadSettingsFile() {
    try {
        if (fs.existsSync(SETTINGS_FILE)) {
            const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error('[Settings] 读取设置文件失败:', e.message);
    }
    return {};
}

/**
 * 写入设置文件
 */
function saveSettingsFile(data) {
    try {
        fs.writeFileSync(SETTINGS_FILE, JSON.stringify(data, null, 2), 'utf-8');
        return true;
    } catch (e) {
        console.error('[Settings] 保存设置文件失败:', e.message);
        return false;
    }
}

// 加载设置
app.get('/api/settings', (req, res) => {
    try {
        const settings = loadSettingsFile();
        res.json({ success: true, settings });
    } catch (e) {
        console.error('[Settings] 读取设置失败:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 保存设置
app.post('/api/settings', (req, res) => {
    try {
        const settings = req.body;
        if (typeof settings !== 'object') {
            return res.status(400).json({ success: false, message: '数据格式错误' });
        }
        const saved = saveSettingsFile(settings);
        if (saved) {
            res.json({ success: true });
        } else {
            res.status(500).json({ success: false, message: '保存设置文件失败' });
        }
    } catch (e) {
        console.error('[Settings] 保存设置失败:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// =============== Puppeteer 商品信息抓取 ===============

let puppeteerBrowser = null;
let browserLaunchPromise = null;

/**
 * 获取 Puppeteer 浏览器实例（单例，延迟启动）
 */
async function getPuppeteerBrowser() {
    // 检查现有浏览器是否可用
    if (puppeteerBrowser) {
        try {
            // Puppeteer 25+ 使用 connected() 方法
            if (typeof puppeteerBrowser.connected === 'function') {
                if (await puppeteerBrowser.connected()) return puppeteerBrowser;
            } else if (typeof puppeteerBrowser.isConnected === 'function') {
                if (await puppeteerBrowser.isConnected()) return puppeteerBrowser;
            } else if (puppeteerBrowser.connected === true || puppeteerBrowser.isConnected === true) {
                return puppeteerBrowser;
            } else {
                // 尝试获取进程 ID 确认是否存活
                const proc = puppeteerBrowser.process();
                if (proc && proc.pid) return puppeteerBrowser;
            }
        } catch (e) {
            console.log('[Puppeteer] 浏览器已断开:', e.message);
        }
        // 浏览器不可用，重置
        puppeteerBrowser = null;
        browserLaunchPromise = null;
    }
    if (browserLaunchPromise) {
        return browserLaunchPromise;
    }
    browserLaunchPromise = (async () => {
        try {
            const puppeteer = require('puppeteer');
            console.log('[Puppeteer] 正在启动浏览器...');
            puppeteerBrowser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--hide-scrollbars',
                    '--mute-audio'
                ]
            });
            console.log('[Puppeteer] 浏览器启动成功');
            // 设置定时重启，避免会话过期（每45分钟重启一次）
            setTimeout(() => {
                console.log('[Puppeteer] 定时重启浏览器...');
                try {
                    puppeteerBrowser.close().catch(() => {});
                } catch (ce) {}
                puppeteerBrowser = null;
                browserLaunchPromise = null;
            }, 45 * 60 * 1000);
            return puppeteerBrowser;
        } catch (e) {
            console.error('[Puppeteer] 启动失败:', e.message);
            browserLaunchPromise = null;
            throw e;
        }
    })();
    return browserLaunchPromise;
}

/**
 * 抓取立创商城商品信息
 * @param {string} productCode - 商品编号 (如 C8728)
 * @returns {Object} 商品信息 { productCode, brand, model, pkg, params, datasheetUrl }
 */
async function scrapeProductInfo(productCode) {
    const browser = await getPuppeteerBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    try {
        // 步骤0: 访问首页（建立会话，解决 WAF 挑战）
        await page.goto('https://www.szlcsc.com/', {
            waitUntil: 'networkidle2', timeout: 30000
        });

        // 检查首页是否正常（不是登录页面）
        const homeTitle = await page.title();
        if (homeTitle.includes('登录') || homeTitle.includes('login') || homeTitle.includes('Login')) {
            console.warn(`[Puppeteer] 首页为登录页面，会话已过期，正在重置浏览器...`);
            setImmediate(async () => {
                try { await puppeteerBrowser.close().catch(() => {}); } catch (ce) {}
                puppeteerBrowser = null;
                browserLaunchPromise = null;
            }).unref();
            console.warn(`[Puppeteer] ${productCode}: 跳过搜索，直接返回`);
            return { success: false, error: '登录页面' };
        }

        // 步骤1: 搜索商品
        // 尝试多种搜索方式
        let searchSuccess = false;

        // 方式1: 直接访问 so.szlcsc.com 搜索页
        try {
            await page.goto(`https://so.szlcsc.com/global.html?k=${productCode}`, {
                waitUntil: 'domcontentloaded', timeout: 15000
            });
            await new Promise(r => setTimeout(r, 3000));
            searchSuccess = page.url().includes('so.szlcsc.com') && !page.url().includes('404');
        } catch (e) {
            console.warn(`[Puppeteer] ${productCode}: so.szlcsc.com 搜索失败`, e.message);
        }

        // 方式2: 使用首页搜索框
        if (!searchSuccess) {
            try {
                await page.goto('https://www.szlcsc.com/', {
                    waitUntil: 'networkidle2', timeout: 20000
                });
                const searchInput = await page.$('input[type="text"]');
                if (searchInput) {
                    await searchInput.click();
                    await searchInput.type(productCode, { delay: 10 });
                    await page.keyboard.press('Enter');
                    await new Promise(r => setTimeout(r, 5000));
                    searchSuccess = !page.url().includes('404');
                }
            } catch (e) {
                console.warn(`[Puppeteer] ${productCode}: 首页搜索失败`, e.message);
            }
        }

        // 方式3: 直接构造可能的 item.szlcsc.com 链接（尝试猜数字ID）
        // 这个方式成功率低，但作为最后手段
        if (!searchSuccess) {
            console.warn(`[Puppeteer] ${productCode}: 所有搜索方式均失败，尝试直接访问已知 URL`);
        }

        // 等待页面稳定
        await new Promise(r => setTimeout(r, 2000));

        // 调试：检查当前页面 URL 和内容
        const currentUrl = page.url();
        const pageTitle = await page.title();

        // 提取搜索结果中的 numeric ID 列表（取多个，备用）
        const numericIds = await page.evaluate(() => {
            const links = document.querySelectorAll('a[href*="item.szlcsc.com/"]');
            const ids = [];
            const seen = new Set();
            for (const a of links) {
                const match = a.href.match(/item\.szlcsc\.com\/(\d+)\.html/);
                if (match && !seen.has(match[1])) {
                    seen.add(match[1]);
                    ids.push(match[1]);
                }
            }
            return ids.slice(0, 5);
        });

        if (!numericIds || numericIds.length === 0) {
            console.warn(`[Puppeteer] ${productCode}: 搜索无结果`, { url: currentUrl, title: pageTitle });
            throw new Error(`未找到商品 ${productCode} 的页面 (${pageTitle || currentUrl})`);
        }

        // 逐个尝试 numeric ID，直到找到正确的商品
        let itemUrl = null;
        let matchedId = null;
        for (const id of numericIds) {
            const testUrl = `https://item.szlcsc.com/${id}.html`;
            await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await new Promise(r => setTimeout(r, 1000));

            const title = await page.title();
            if (title.includes('没有找到') || title.includes('404')) {
                console.warn(`[Puppeteer] ${productCode}: ID ${id} 无效 (${title})`);
                continue;
            }

            // 检查页面是否包含正确的商品编号
            const pageCode = await page.evaluate((code) => {
                const xpath = "//*[text()='商品编号']/following-sibling::*[1]";
                const result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const el = result.singleNodeValue;
                return el ? el.textContent.trim() : '';
            }, productCode);

            if (pageCode === productCode) {
                matchedId = id;
                itemUrl = testUrl;
                console.log(`[Puppeteer] ${productCode}: 匹配成功 ID=${id}`);
                break;
            } else {
                console.warn(`[Puppeteer] ${productCode}: ID ${id} 的编号为 ${pageCode}，不匹配`);
            }
        }

        if (!matchedId) {
            // 没有精确匹配的，用第一个有效页面作为备选
            for (const id of numericIds) {
                const testUrl = `https://item.szlcsc.com/${id}.html`;
                await page.goto(testUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await new Promise(r => setTimeout(r, 1000));
                const title = await page.title();
                if (!title.includes('没有找到') && !title.includes('404')) {
                    matchedId = id;
                    itemUrl = testUrl;
                    console.warn(`[Puppeteer] ${productCode}: 使用备选ID ${id}`);
                    break;
                }
            }
        }

        if (!matchedId) {
            throw new Error(`未找到商品 ${productCode} 的有效页面`);
        }

        // 步骤3: 提取信息
        const result = await page.evaluate(() => {
            // 使用 DOM 提取基本信息（页面使用 label/div 结构，不是同一行文本）
            const getLabelValue = (labelText) => {
                // 用 XPath 查找 label 的下一个兄弟元素
                const xpath = `//*[text()='${labelText}']/following-sibling::*[1]`;
                const result = document.evaluate(xpath, document, null,
                    XPathResult.FIRST_ORDERED_NODE_TYPE, null);
                const el = result.singleNodeValue;
                if (el) return el.textContent.trim();

                // 备选：查找包含 labelText 的元素的下一个兄弟
                const allElements = document.querySelectorAll('span, div, td, label, p, li');
                for (const el of allElements) {
                    if (el.textContent.trim() === labelText) {
                        const next = el.nextElementSibling;
                        if (next) return next.textContent.trim();
                        const parent = el.parentElement;
                        if (parent) {
                            const children = Array.from(parent.children);
                            const idx = children.indexOf(el);
                            if (idx >= 0 && idx + 1 < children.length) {
                                return children[idx + 1].textContent.trim();
                            }
                        }
                    }
                }
                return '';
            };

            const productCode = getLabelValue('商品编号');
            const brand = getLabelValue('品牌名称') || getLabelValue('品牌');
            const model = getLabelValue('商品型号');
            const pkg = getLabelValue('商品封装');

            // 提取商品参数表（从页面文本中解析）
            const params = [];
            const bodyText = document.body.innerText;
            // 找第二个"商品参数"（第一个在标题"商品参数数据手册PDF买了又买"中）
            let paramStart = bodyText.indexOf('商品参数');
            if (paramStart >= 0) {
                // 找第二个"商品参数"（如果存在）
                const second = bodyText.indexOf('商品参数', paramStart + 5);
                if (second >= 0) paramStart = second;
            }
            if (paramStart >= 0) {
                const paramText = bodyText.substring(paramStart, paramStart + 800);
                const lines = paramText.split('\n');
                let inParam = false;
                for (let i = 0; i < lines.length; i++) {
                    const line = lines[i];
                    // 跳过前几行（商品参数、资料纠错、查看类似商品）
                    if (!inParam && (line.trim() === '商品参数' || line.trim() === '资料纠错' ||
                        line.trim() === '查看类似商品' || line.trim() === '属性' || line.trim() === '参数值')) {
                        continue;
                    }
                    // 遇到"数据手册"或"买了又买"或"商品概"停止
                    if (line.includes('数据手册') || line.includes('买了又买') ||
                        line.includes('替代料') || line.includes('商品概')) {
                        break;
                    }
                    // 参数行以 \t 开头，包含 属性\t值 对
                    if (line.includes('\t')) {
                        const parts = line.split('\t').filter(p => p.trim());
                        if (parts.length >= 2) {
                            const label = parts[0].trim();
                            const value = parts[1].trim();
                            if (label && value &&
                                label !== '属性' && label !== '参数值' && label !== '对比' &&
                                !label.includes('厂家型号') && !label.includes('相似度')) {
                                params.push({ label, value });
                                inParam = true;
                            }
                        }
                    }
                }
            }

            // 提取数据手册链接
            let datasheetUrl = '';
            const pdfLinks = document.querySelectorAll('a[href*="datasheet"], a[href*=".pdf"]');
            if (pdfLinks.length > 0) {
                datasheetUrl = pdfLinks[0].href;
            }

            // 提取商品图片
            let imageUrl = '';
            // 从 meta 标签中提取
            const metaImg = document.querySelector('meta[itemprop="image"]');
            if (metaImg) {
                imageUrl = metaImg.getAttribute('content') || '';
            }
            if (!imageUrl) {
                const mainImg = document.querySelector('.product-img img, [class*="preview"] img, [class*="product"] img');
                if (mainImg) {
                    const src = mainImg.getAttribute('src') || mainImg.getAttribute('data-src') || '';
                    if (src) imageUrl = src.startsWith('http') ? src : 'https:' + src;
                }
            }

            // 提取描述
            const descMeta = document.querySelector('meta[itemprop="description"]');
            const description = descMeta ? descMeta.getAttribute('content').substring(0, 200) : '';

            return {
                productCode, brand, model, pkg, description, imageUrl, datasheetUrl, params
            };
        });

        // 从页面标题提取商品名称（标题格式: "RCA030RLF中文资料_最新报价_...HKR(香港电阻)-贴片电阻-立创商城"）
        const productPageTitle = await page.title();
        let productName = result.model || '';
        if (!productName) {
            const nameMatch = productPageTitle.match(/^([^_\-]+)/);
            if (nameMatch) productName = nameMatch[1].trim();
        }

        // 步骤4: 将参数映射到系统格式
        const mappedParams = mapLcscParamsToSystem(result.params);

        return {
            success: true,
            data: {
                ...result,
                productName: productName || result.model || '',
                productUrl: itemUrl,
                params: result.params,
                mappedParams
            }
        };

    } catch (e) {
        console.error(`[Puppeteer] 抓取 ${productCode} 失败:`, e.message);
        // 如果检测到登录页面，说明浏览器会话过期，需要重启
        if (e.message && (e.message.includes('登录') || e.message.includes('login') || e.message.includes('401') || e.message.includes('403'))) {
            console.warn('[Puppeteer] 检测到登录页面，正在重置浏览器...');
            try {
                puppeteerBrowser = null;
                browserLaunchPromise = null;
                await page.close().catch(() => {});
            } catch (ce) {}
        }
        return { success: false, error: e.message };
    } finally {
        await page.close().catch(() => {});
    }
}

/**
 * 立创参数 → 系统参数格式映射
 */
function mapLcscParamsToSystem(lcscParams) {
    if (!lcscParams || !Array.isArray(lcscParams)) return [];

    // 分类参数映射
    const categoryKeywords = {
        resistor: ['电阻', '阻值', '功率', '额定电压'],
        capacitor: ['电容', '容值', '容量', '耐压', '额定电压'],
        inductor: ['电感', '电感量', '电流'],
        diode: ['二极管', '反向耐压', '正向电流'],
        transistor: ['三极管', '晶体管', 'Vceo', 'Ic'],
        mosfet: ['MOS', '场效应', 'Vdss', '漏极电流'],
        led: ['LED', '发光', '颜色', '色温'],
        crystal: ['晶振', '频率', '负载电容']
    };

    // 判断品类
    let category = 'other';
    const allValues = lcscParams.map(p => (p.label + p.value).toLowerCase()).join(' ');
    for (const [cat, keywords] of Object.entries(categoryKeywords)) {
        if (keywords.some(kw => allValues.includes(kw.toLowerCase()))) {
            category = cat;
            break;
        }
    }

    // 参数名称映射
    const paramNameMap = {
        '阻值': 'p1', '电阻值': 'p1', '电阻': 'p1',
        '容值': 'p1', '容量': 'p1', '标称容量': 'p1',
        '电感量': 'p1', '电感值': 'p1',
        '频率': 'p1', '标称频率': 'p1',
        '功率': 'p2', '额定功率': 'p2',
        '耐压': 'p2', '额定电压': 'p2', '工作电压': 'p2',
        '电流': 'p2', '额定电流': 'p2', '正向电流': 'p2',
        '精度': 'p3', '容差': 'p3', '误差': 'p3',
        'Vdss': 'p1', '漏源击穿电压': 'p1',
        '漏极电流': 'p2', '最大漏极电流': 'p2',
        '反向耐压': 'p1', '反向重复峰值电压': 'p1',
        '正向压降': 'p3', 'Vf': 'p3',
        '颜色': 'p4', '发光颜色': 'p4',
        '色温': 'p5',
        'CPU内核': 'p1',
        'CPU最大主频': 'p2',
        '程序存储容量': 'p3',
        'RAM容量': 'p4',
        '工作温度': 'p5',
        '封装': 'pkg',
        '商品目录': 'category'
    };

    // 提取参数值（去掉单位）
    function extractValueAndUnit(str) {
        const match = str.match(/^([\d.]+)\s*(.*)$/);
        if (match) return { value: match[1], unit: match[2].trim() };
        return { value: str, unit: '' };
    }

    const mapped = [];
    lcscParams.forEach(p => {
        const paramId = paramNameMap[p.label];
        if (paramId && paramId !== 'pkg' && paramId !== 'category') {
            const { value, unit } = extractValueAndUnit(p.value);
            mapped.push({
                id: paramId,
                label: p.label,
                value: value,
                unit: unit || p.value.replace(/^[\d.]+/, '').trim()
            });
        }
    });

    return mapped;
}

// =============== Puppeteer 抓取 API 路由 ===============

// 抓取商品信息
app.post('/api/lcsc/product/scrape', async (req, res) => {
    try {
        const { productCode } = req.body;
        if (!productCode) {
            return res.status(400).json({ success: false, message: '缺少商品编号' });
        }

        const result = await scrapeProductInfo(productCode);
        res.json(result);
    } catch (e) {
        console.error('[Scrape] 错误:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// 批量抓取商品信息
app.post('/api/lcsc/product/scrape-batch', async (req, res) => {
    try {
        const { productCodes } = req.body;
        if (!productCodes || !Array.isArray(productCodes) || productCodes.length === 0) {
            return res.status(400).json({ success: false, message: '缺少商品编号列表' });
        }

        // 限制并发数，避免浏览器过载
        const CONCURRENT = 3;
        const results = [];
        for (let i = 0; i < productCodes.length; i += CONCURRENT) {
            const batch = productCodes.slice(i, i + CONCURRENT);
            const batchResults = await Promise.all(
                batch.map(code => scrapeProductInfo(code).then(r => ({ code, ...r })))
            );
            results.push(...batchResults);
        }

        res.json({ success: true, data: results });
    } catch (e) {
        console.error('[Scrape-Batch] 错误:', e.message);
        res.status(500).json({ success: false, message: e.message });
    }
});

// Puppeteer 健康检查
app.get('/api/lcsc/scrape-health', async (req, res) => {
    try {
        const browser = await getPuppeteerBrowser();
        const version = await browser.version();
        res.json({ status: 'ok', browser: version });
    } catch (e) {
        res.json({ status: 'error', message: e.message });
    }
});

// =============== 静态文件服务 ===============

app.use(express.static(PROJECT_ROOT));

// SPA fallback: 默认返回 index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(PROJECT_ROOT, 'index.html'));
});

// =============== 启动 ===============

app.listen(PORT, '127.0.0.1', () => {
    console.log(`\n  🚀 Component Hub 服务启动成功！`);
    console.log(`  ───────────────────────────────────`);
    console.log(`  地址: http://localhost:${PORT}`);
    console.log(`  静态文件服务: ✓`);
    console.log(`  LCSC API 代理: ✓`);
    console.log(`  Puppeteer 抓取: ✓ (延迟启动，首次请求时初始化)`);
    console.log(`  ───────────────────────────────────`);
    console.log(`  使用 python 方式仍可用: python -m http.server ${PORT}`);
    console.log(`  使用本服务: node server.js`);
    console.log(`\n`);
});

// 优雅关闭
process.on('SIGINT', async () => {
    console.log('\n[Server] 正在关闭...');
    if (puppeteerBrowser) {
        try {
            await puppeteerBrowser.close();
            console.log('[Puppeteer] 浏览器已关闭');
        } catch (e) {
            console.error('[Puppeteer] 关闭失败:', e.message);
        }
    }
    process.exit(0);
});

process.on('SIGTERM', async () => {
    if (puppeteerBrowser) {
        try { await puppeteerBrowser.close(); } catch (e) {}
    }
    process.exit(0);
});
