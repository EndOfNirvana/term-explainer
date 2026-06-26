const {
  app, BrowserWindow, Tray, Menu, globalShortcut,
  clipboard, dialog, nativeImage, screen, shell, ipcMain
} = require('electron');
const path = require('path');
const { exec, execSync } = require('child_process');
const fs = require('fs');
const https = require('https');
const http = require('http');
const dns = require('dns');
const net = require('net');
const { URL } = require('url');

// ============ 配置 ============
const DEFAULT_CONFIG = {
  hotkey: 'CommandOrControl+Shift+D',
  translateHotkey: 'CommandOrControl+Shift+T',
  cancelKey: 'Escape',
  apiEndpoint: '',
  apiKey: '',
  apiModel: 'gpt-4o-mini'
};

// ============ 状态 ============
let tray = null;
let settingsWindow = null;
let popupWindows = [];
let currentHotkey = DEFAULT_CONFIG.hotkey;
let currentTranslateHotkey = DEFAULT_CONFIG.translateHotkey;
let isQuitting = false;

// ============ 配置存储 ============
const Store = {
  _file: null,
  _data: {},

  _getFile() {
    if (this._file) return this._file;
    this._file = path.join(app.getPath('userData'), 'config.json');
    return this._file;
  },

  load() {
    try {
      const f = this._getFile();
      if (fs.existsSync(f)) {
        this._data = JSON.parse(fs.readFileSync(f, 'utf8'));
      }
    } catch (e) {
      console.error('Load config error:', e);
      this._data = {};
    }
  },

  save() {
    try {
      fs.writeFileSync(this._getFile(), JSON.stringify(this._data, null, 2));
    } catch (e) {
      console.error('Save config error:', e);
    }
  },

  get(key, defaultValue) {
    return this._data[key] !== undefined ? this._data[key] : defaultValue;
  },

  set(key, value) {
    this._data[key] = value;
    this.save();
  },

  getAll() {
    return { ...DEFAULT_CONFIG, ...this._data };
  }
};

// ============ 原生 HTTP 请求（替代 node-fetch，零额外依赖）============

/**
 * 发送 HTTPS/HTTP 请求，返回 { status, headers, body, elapsed }
 * 使用 Node.js 内置模块，不依赖任何外部包
 */
function nativeRequest(method, urlStr, headers, body, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const isHttps = parsed.protocol === 'https:';
    const mod = isHttps ? https : http;
    const port = parsed.port || (isHttps ? 443 : 80);

    const startTime = Date.now();

    const options = {
      hostname: parsed.hostname,
      port: port,
      path: parsed.pathname + parsed.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
        'Content-Length': body ? Buffer.byteLength(body) : 0
      },
      timeout: timeoutMs,
      // 关键：不使用系统代理（绕过 VPN/代理干扰）
      // 如果环境变量 HTTP_PROXY/HTTPS_PROXY 存在，也忽略
      agent: false
    };

    const req = mod.request(options, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const rawBody = Buffer.concat(chunks).toString('utf8');
        const elapsed = Date.now() - startTime;

        let data;
        try {
          data = JSON.parse(rawBody);
        } catch {
          data = rawBody;
        }

        resolve({
          status: res.statusCode,
          headers: res.headers,
          body: rawBody,
          data,
          elapsed,
          ok: res.statusCode >= 200 && res.statusCode < 300
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('REQUEST_TIMEOUT'));
    });

    req.on('error', (err) => {
      // 给错误附加更多信息
      if (err.code === 'ENOTFOUND') {
        reject(new Error('DNS_NOT_FOUND:' + parsed.hostname));
      } else if (err.code === 'ECONNREFUSED') {
        reject(new Error('CONNECTION_REFUSED:' + parsed.hostname + ':' + port));
      } else if (err.code === 'ECONNRESET') {
        reject(new Error('CONNECTION_RESET'));
      } else if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        reject(new Error('TCP_TIMEOUT'));
      } else if (err.code === 'CERT_HAS_EXPIRED' || err.code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || err.code === 'DEPTH_ZERO_SELF_SIGNED_CERT') {
        reject(new Error('SSL_ERROR:' + (err.message || err.code)));
      } else {
        reject(new Error('NETWORK_ERROR:' + (err.code || 'unknown') + ':' + (err.message || '')));
      }
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

// ============ 选中文本获取 ============
async function simulateCopyWithKeybdEvent() {
  return new Promise((resolve) => {
    const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Threading;
public class KB {
  [DllImport("user32.dll")]
  static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  const uint KEYDOWN = 0;
  const uint KEYUP = 2;
  public static void SendCtrlC() {
    keybd_event(0x11, 0x1D, KEYDOWN, UIntPtr.Zero);
    keybd_event(0x43, 0x2E, KEYDOWN, UIntPtr.Zero);
    Thread.Sleep(50);
    keybd_event(0x43, 0x2E, KEYUP, UIntPtr.Zero);
    keybd_event(0x11, 0x1D, KEYUP, UIntPtr.Zero);
  }
}
"@
[KB]::SendCtrlC()
Start-Sleep -Milliseconds 200
`;

    const tmpFile = path.join(app.getPath('temp'), `term_copy_${Date.now()}.ps1`);
    fs.writeFileSync(tmpFile, psScript);

    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${tmpFile}"`, {
      timeout: 5000,
      windowsHide: true
    }, (err) => {
      try { fs.unlinkSync(tmpFile); } catch(e) {}
      resolve();
    });
  });
}

async function getSelectedText() {
  const oldText = clipboard.readText();
  clipboard.clear();
  await new Promise(r => setTimeout(r, 50));
  await simulateCopyWithKeybdEvent();

  return new Promise((resolve) => {
    let attempts = 0;
    const check = () => {
      const newText = clipboard.readText();
      if (newText && newText.trim()) {
        if (oldText) clipboard.writeText(oldText);
        resolve(newText.trim());
      } else if (attempts >= 10) {
        const fallback = clipboard.readText();
        if (fallback && fallback.trim() && fallback !== oldText) {
          resolve(fallback.trim());
        } else if (oldText && oldText.trim()) {
          resolve(oldText.trim());
        } else {
          resolve('');
        }
      } else {
        attempts++;
        setTimeout(check, 80);
      }
    };
    check();
  });
}

// ============ 多弹窗管理 ============
function createPopupWindow(term, mode = 'explain') {
  const cursor = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursor);
  const bounds = display.workArea;

  let x = cursor.x + 20;
  let y = cursor.y + 20;
  const width = 460;
  const height = 520;

  if (x + width > bounds.x + bounds.width) {
    x = cursor.x - width - 10;
  }
  if (y + height > bounds.y + bounds.height) {
    y = bounds.y + bounds.height - height - 10;
  }
  if (x < bounds.x) x = bounds.x + 10;
  if (y < bounds.y) y = bounds.y + 10;

  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload-popup.js')
    }
  });

  win.setAlwaysOnTop(true, 'floating');
  win.loadFile(path.join(__dirname, 'renderer', 'popup.html'));

  win.once('ready-to-show', () => {
    win.show();
    win.webContents.send('init-term', { term, mode });
    const cancelKey = Store.get('cancelKey', 'Escape');
    win.webContents.send('config-cancel-key', cancelKey);
  });

  win.on('closed', () => {
    popupWindows = popupWindows.filter(w => w !== win);
  });

  popupWindows.push(win);
  return win;
}

function closeAllPopups() {
  popupWindows.forEach(w => {
    try { w.close(); } catch(e) {}
  });
  popupWindows = [];
}

// ============ 快捷键处理 ============
async function handleShortcut() {
  if (settingsWindow && settingsWindow.isFocused()) {
    return;
  }

  const term = await getSelectedText();

  if (!term) {
    createPopupWindow('', 'explain');
    return;
  }

  createPopupWindow(term, 'explain');
}

async function handleTranslateShortcut() {
  if (settingsWindow && settingsWindow.isFocused()) {
    return;
  }

  const term = await getSelectedText();

  if (!term) {
    createPopupWindow('', 'translate');
    return;
  }

  createPopupWindow(term, 'translate');
}

function registerHotkey(hotkey, translateHotkey) {
  try {
    globalShortcut.unregisterAll();
  } catch(e) {}

  // 注册主快捷键（解释）
  const hk = hotkey || currentHotkey;
  const success1 = globalShortcut.register(hk, handleShortcut);
  if (success1) {
    currentHotkey = hk;
    console.log('Hotkey registered:', hk);
  } else {
    console.error('Failed to register hotkey:', hk);
    if (hk !== DEFAULT_CONFIG.hotkey) {
      if (globalShortcut.register(DEFAULT_CONFIG.hotkey, handleShortcut)) {
        currentHotkey = DEFAULT_CONFIG.hotkey;
      }
    }
  }

  // 注册翻译快捷键
  const thk = translateHotkey || currentTranslateHotkey;
  if (thk && thk !== hk) {
    const success2 = globalShortcut.register(thk, handleTranslateShortcut);
    if (success2) {
      currentTranslateHotkey = thk;
      console.log('Translate hotkey registered:', thk);
    } else {
      console.error('Failed to register translate hotkey:', thk);
    }
  }

  return success1;
}

// ============ 设置窗口 ============
function createSettingsWindow() {
  if (settingsWindow) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 560,
    height: 750,
    resizable: true,
    minimizable: false,
    maximizable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload-settings.js')
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'renderer', 'settings.html'));

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

// ============ 系统托盘 ============
function createTray() {
  let iconPath = path.join(__dirname, 'build', 'icon.png');
  if (!fs.existsSync(iconPath)) {
    iconPath = path.join(__dirname, 'build', 'icon.ico');
  }

  let trayIcon;
  try {
    trayIcon = nativeImage.createFromPath(iconPath);
  } catch(e) {
    trayIcon = nativeImage.createEmpty();
  }

  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '⚙ 设置',
      click: () => createSettingsWindow()
    },
    {
      label: '🔍 解释选中文本',
      accelerator: currentHotkey,
      click: () => handleShortcut()
    },
    {
      label: '🌐 翻译选中文本',
      accelerator: currentTranslateHotkey,
      click: () => handleTranslateShortcut()
    },
    { type: 'separator' },
    {
      label: '关闭所有弹窗',
      click: () => closeAllPopups()
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('术语解释器 - 选中文字按 ' + currentHotkey.replace('CommandOrControl+', 'Ctrl+'));
  tray.setContextMenu(contextMenu);

  tray.on('double-click', () => {
    createSettingsWindow();
  });
}

// ============ 网络诊断 ============

/**
 * 四级网络诊断：DNS → TCP → TLS → HTTP
 * 逐层检查，精确定位问题所在
 *
 * @param {string} urlStr - API 基础 URL
 * @returns {Array} 诊断步骤结果数组
 */
async function diagnoseNetwork(urlStr) {
  const results = [];
  const baseUrl = urlStr.replace(/\/$/, '');

  let hostname, port, isHttps;
  try {
    const parsed = new URL(baseUrl);
    hostname = parsed.hostname;
    port = parsed.port || (parsed.protocol === 'https:' ? 443 : 80);
    isHttps = parsed.protocol === 'https:';
  } catch {
    results.push({
      step: 'URL解析',
      status: 'fail',
      detail: 'base_url 格式不正确，无法解析域名。请检查 URL 是否以 https:// 或 http:// 开头'
    });
    return results;
  }

  results.push({
    step: 'URL解析',
    status: 'pass',
    detail: `${isHttps ? 'HTTPS' : 'HTTP'} → ${hostname}:${port}`
  });

  // ===== 第一级：DNS 解析 =====
  let dnsAddr;
  try {
    const addr = await new Promise((resolve, reject) => {
      dns.lookup(hostname, { family: 4 }, (err, address) => {
        if (err) reject(err);
        else resolve(address);
      });
    });
    dnsAddr = addr;
    results.push({
      step: '① DNS解析',
      status: 'pass',
      detail: `${hostname} → ${addr}`
    });
  } catch (e) {
    results.push({
      step: '① DNS解析',
      status: 'fail',
      detail: `无法解析域名 ${hostname}`,
      suggestion: '可能原因：\n  - DNS 服务器不可达\n  - VPN/代理劫持了 DNS\n  - 网络完全断开\n建议：关闭 VPN 后重试，或在浏览器地址栏访问 ' + baseUrl + ' 看是否能打开'
    });
    return results; // DNS 都解析不了，后面没必要测了
  }

  // ===== 第二级：TCP 连接 =====
  try {
    await new Promise((resolve, reject) => {
      const sock = new net.Socket();
      const timer = setTimeout(() => {
        sock.destroy();
        reject(new Error('TCP_TIMEOUT'));
      }, 5000);

      sock.connect(port, dnsAddr, () => {
        clearTimeout(timer);
        sock.destroy();
        resolve();
      });
      sock.on('error', (err) => {
        clearTimeout(timer);
        sock.destroy();
        reject(err);
      });
    });
    results.push({
      step: '② TCP连接',
      status: 'pass',
      detail: `${dnsAddr}:${port} 连接成功`
    });
  } catch (e) {
    if (e.message === 'TCP_TIMEOUT') {
      results.push({
        step: '② TCP连接',
        status: 'fail',
        detail: `TCP ${dnsAddr}:${port} 连接超时`,
        suggestion: '可能原因：\n  - VPN 代理拦截了到该端口的连接\n  - 防火墙屏蔽了该端口\n  - 网络路由不通\n建议：关闭 VPN 后重试，或更换网络环境'
      });
    } else {
      results.push({
        step: '② TCP连接',
        status: 'fail',
        detail: `TCP ${dnsAddr}:${port} 连接失败: ${e.message}`,
        suggestion: '可能原因：防火墙/代理/VPN 屏蔽了该连接'
      });
    }
    return results;
  }

  // ===== 第三级：TLS/SSL 握手（仅 HTTPS）=====
  if (isHttps) {
    try {
      await new Promise((resolve, reject) => {
        const req = https.request({
          hostname: hostname,
          port: port,
          path: '/',
          method: 'HEAD',
          timeout: 8000,
          agent: false, // 绕过系统代理
          rejectUnauthorized: false // 先不验证证书，只测 TLS 握手
        }, (res) => {
          res.resume(); // 消耗响应
          res.on('end', resolve);
        });
        req.on('timeout', () => { req.destroy(); reject(new Error('TLS_TIMEOUT')); });
        req.on('error', reject);
        req.end();
      });
      results.push({
        step: '③ TLS握手',
        status: 'pass',
        detail: 'SSL/TLS 连接建立成功'
      });
    } catch (e) {
      results.push({
        step: '③ TLS握手',
        status: 'fail',
        detail: `SSL/TLS 握手失败: ${e.message}`,
        suggestion: '可能原因：\n  - VPN/代理在中间拦截 HTTPS 流量（MITM）\n  - 系统时钟偏差过大导致证书验证失败\n  - 需要公司内部 CA 证书\n建议：关闭 VPN 后重试（这是最常见的原因）'
      });
      return results;
    }
  }

  // ===== 第四级：HTTP 可达性（HEAD 请求根路径）=====
  try {
    const resp = await nativeRequest('HEAD', baseUrl + '/', {}, null, 8000);
    results.push({
      step: '④ HTTP可达',
      status: resp.ok || resp.status === 404 || resp.status === 405 ? 'pass' : 'warn',
      detail: `服务器响应 HTTP ${resp.status}，${resp.elapsed}ms`
    });
  } catch (e) {
    results.push({
      step: '④ HTTP可达',
      status: 'warn',
      detail: `HEAD 请求失败: ${e.message}`,
      suggestion: '这可能正常——API 服务器不一定响应根路径的 HEAD 请求。继续测试 API 调用。'
    });
  }

  return results;
}

/**
 * 检测环境中的代理设置
 */
function detectProxySettings() {
  const warnings = [];

  // 检查环境变量代理
  const proxyVars = ['HTTP_PROXY', 'HTTPS_PROXY', 'http_proxy', 'https_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy'];
  const foundProxies = [];

  for (const v of proxyVars) {
    if (process.env[v]) {
      foundProxies.push(`${v}=${process.env[v]}`);
    }
  }

  if (foundProxies.length > 0) {
    warnings.push({
      type: 'proxy_env',
      title: '检测到系统代理环境变量',
      detail: foundProxies.join('\n'),
      suggestion: '如果使用了 VPN 或代理，这些环境变量会导致所有流量走代理。\n国内 API（如 MiniMax）可能无法通过代理访问。\n建议：关闭 VPN/代理后重试，或设置 NO_PROXY 排除国内域名。'
    });
  }

  return { foundProxies, warnings };
}

// ============ API 调用（使用原生 https，零外部依赖）============
async function callLLM(term) {
  const baseUrl = Store.get('apiEndpoint', '').replace(/\/$/, '');
  const apiKey = Store.get('apiKey', '');
  const model = Store.get('apiModel', 'MiniMax-M3');

  if (!baseUrl || !apiKey) {
    return { success: false, error: '未配置 API，请右键系统托盘 → 设置' };
  }

  if (!term || !term.trim()) {
    return { success: false, error: '术语为空' };
  }

  const prompt = `请严格按以下JSON格式解释术语（不要markdown代码块，不要任何额外文字，只输出纯JSON）：
{"definition":"学术定义","plain1":"通俗理解①","plain2":"通俗理解②"}

术语：「${term.trim()}」

其中：
- definition：准确严谨的定义，50-100字
- plain1：用大白话和生活化比喻解释，让完全不懂的人也能秒懂，50-100字
- plain2：换个角度或用另一种比喻解释，加深理解，50-100字

只输出JSON，不输出其他任何文字。`;

  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }]
  });

  const url = `${baseUrl}/chat/completions`;

  const maxRetries = 2;
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await nativeRequest('POST', url, {
        'Authorization': `Bearer ${apiKey}`
      }, body, 30000);

      if (!resp.ok) {
        let errDetail = '';
        if (resp.status === 401) {
          errDetail = 'API Key 无效或已过期，请检查 api_key 是否正确';
        } else if (resp.status === 403) {
          errDetail = 'API 访问被拒绝 (403)。可能是 API Key 权限不足，或账户欠费';
        } else if (resp.status === 429) {
          errDetail = '请求频率超限，请稍后重试';
        } else if (resp.status >= 500) {
          errDetail = 'API 服务器内部错误，可稍后重试';
        } else {
          errDetail = `HTTP ${resp.status}: ${resp.data.error?.message || resp.data.message || ''}`;
        }
        return { success: false, error: errDetail };
      }

      const content = resp.data.choices?.[0]?.message?.content || '';

      // 尝试多种方式解析 JSON
      const result = tryParseJson(content);

      if (result) {
        return { success: true, data: result, model: resp.data.model || model };
      }

      // JSON 解析失败，重试
      if (attempt < maxRetries) {
        console.log(`[LLM] Parse failed, retry ${attempt + 1}/${maxRetries}`);
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      // 所有重试失败，返回原始内容
      return { success: true, data: null, rawContent: content, model: resp.data.model || model };

    } catch (e) {
      lastError = e.message;
      if (attempt < maxRetries) {
        console.log(`[LLM] Error, retry ${attempt + 1}/${maxRetries}: ${lastError}`);
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      break;
    }
  }

  // 解析最后的错误信息
  if (lastError.startsWith('DNS_NOT_FOUND:')) {
    return { success: false, error: `DNS 解析失败: 无法找到 ${lastError.split(':')[1]}。\n请检查：\n  1. 网络是否正常\n  2. API域名是否拼写正确\n  3. 是否开启了 VPN（关闭后重试）` };
  }
  if (lastError.startsWith('CONNECTION_REFUSED:')) {
    const parts = lastError.split(':');
    return { success: false, error: `连接被拒绝: ${parts[1]}:${parts[2]}\n请检查：\n  1. base_url 是否正确\n  2. 是否为 HTTP 而应该用 HTTPS（或反过来）\n  3. 防火墙/VPN 是否屏蔽了该端口` };
  }
  if (lastError.startsWith('CONNECTION_RESET')) {
    return { success: false, error: `连接被重置。\n最可能原因：VPN/代理拦截了请求。\n请尝试关闭 VPN 后重试。` };
  }
  if (lastError.startsWith('TCP_TIMEOUT') || lastError.startsWith('REQUEST_TIMEOUT')) {
    return { success: false, error: `请求超时。\n请检查：\n  1. API 服务器是否可达（尝试在浏览器中打开 API 地址）\n  2. 是否开启了 VPN（关闭后重试）\n  3. 防火墙是否放行` };
  }
  if (lastError.startsWith('SSL_ERROR:')) {
    return { success: false, error: `SSL/TLS 证书错误。\n可能原因：VPN/代理在中间拦截了 HTTPS 流量。\n请关闭 VPN 后重试。` };
  }
  if (lastError.startsWith('NETWORK_ERROR:')) {
    return { success: false, error: `网络错误: ${lastError.slice('NETWORK_ERROR:'.length)}` };
  }
  return { success: false, error: `未知网络错误: ${lastError.slice(0, 150)}` };
}

function tryParseJson(content) {
  if (!content) return null;

  // 策略1：直接 parse
  try { return JSON.parse(content); } catch {}

  // 策略2：去掉 markdown 代码块
  const codeBlock = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1]); } catch {}
  }

  // 策略3：提取第一个 { ... } 块
  let depth = 0, start = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (content[i] === '}') { depth--; if (depth === 0 && start >= 0) {
      try { return JSON.parse(content.slice(start, i + 1)); } catch {}
      break;
    }}
  }

  // 策略4：宽松正则
  const def = extractField(content, ['学术定义', 'definition', '定义']);
  const p1 = extractField(content, ['通俗理解①', '通俗理解1', 'plain1', '理解①']);
  const p2 = extractField(content, ['通俗理解②', '通俗理解2', 'plain2', '理解②']);

  if (def || p1 || p2) {
    return {
      definition: def || '未能提取定义',
      plain1: p1 || '未能提取通俗理解①',
      plain2: p2 || '未能提取通俗理解②'
    };
  }

  // 策略5：段落切分
  const lines = content.split(/\n+/).filter(l => l.trim().length > 5);
  if (lines.length >= 3) {
    return {
      definition: lines[0].replace(/^(定义|学术定义|definition)[：:]\s*/i, '').trim(),
      plain1: lines[1].replace(/^(通俗理解[①②12]|plain[12])[：:]\s*/i, '').trim(),
      plain2: lines[2].replace(/^(通俗理解[①②12]|plain[12])[：:]\s*/i, '').trim()
    };
  }

  return null;
}

function extractField(text, keys) {
  for (const key of keys) {
    const nextKeys = ['学术定义', '通俗理解', 'definition', 'plain1', 'plain2'];
    const stopPattern = nextKeys.filter(k => k !== key).join('|');
    const regex = new RegExp(`["']?${key}["']?\\s*[：:]\\s*["']?([\\s\\S]+?)(?=\\n\\s*["']?(${stopPattern})["']?\\s*[：:]|$)`, 'im');
    const m = text.match(regex);
    if (m) return m[1].trim().replace(/^["']|["']$/g, '').replace(/[，,。.]$/, '');
  }
  return null;
}

// ============ 翻译 + 解释（使用原生 https，零外部依赖）============
async function callLLMTranslate(term) {
  const baseUrl = Store.get('apiEndpoint', '').replace(/\/$/, '');
  const apiKey = Store.get('apiKey', '');
  const model = Store.get('apiModel', '');

  if (!baseUrl || !apiKey) {
    return { success: false, error: '未配置 API，请右键系统托盘 → 设置' };
  }

  if (!term || !term.trim()) {
    return { success: false, error: '内容为空' };
  }

  const prompt = `请严格按以下JSON格式翻译并解释（不要markdown代码块，不要任何额外文字，只输出纯JSON）：
{"translation":"中文翻译","definition":"学术定义","plain1":"通俗理解①","plain2":"通俗理解②"}

内容：「${term.trim()}」

其中：
- translation：准确的中文翻译（若已是中文则写"[中文]"）
- definition：基于中文翻译给出准确严谨的定义，50-100字
- plain1：用大白话和生活化比喻解释，让完全不懂的人也能秒懂，50-100字
- plain2：换个角度或用另一种比喻解释，加深理解，50-100字

只输出JSON，不输出其他任何文字。`;

  const body = JSON.stringify({
    model,
    messages: [{ role: 'user', content: prompt }]
  });

  const url = `${baseUrl}/chat/completions`;
  const maxRetries = 2;
  let lastError = '';

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const resp = await nativeRequest('POST', url, {
        'Authorization': `Bearer ${apiKey}`
      }, body, 30000);

      if (!resp.ok) {
        let errDetail = '';
        if (resp.status === 401) errDetail = 'API Key 无效或已过期';
        else if (resp.status === 403) errDetail = 'API 访问被拒绝 (403)，可能账户欠费';
        else if (resp.status === 429) errDetail = '请求频率超限，请稍后重试';
        else if (resp.status >= 500) errDetail = 'API 服务器内部错误';
        else errDetail = `HTTP ${resp.status}: ${resp.data.error?.message || resp.data.message || ''}`;
        return { success: false, error: errDetail };
      }

      const content = resp.data.choices?.[0]?.message?.content || '';
      const result = tryParseJsonTranslate(content);

      if (result) {
        return { success: true, data: result, model: resp.data.model || model };
      }

      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 300));
        continue;
      }

      return { success: true, data: null, rawContent: content, model: resp.data.model || model };

    } catch (e) {
      lastError = e.message;
      if (attempt < maxRetries) {
        await new Promise(r => setTimeout(r, 500));
        continue;
      }
      break;
    }
  }

  // 错误分析（复用同样逻辑）
  if (lastError.startsWith('DNS_NOT_FOUND:')) {
    return { success: false, error: `DNS 解析失败，请检查网络或关闭 VPN` };
  }
  if (lastError.startsWith('CONNECTION_RESET') || lastError.startsWith('CONNECTION_REFUSED:')) {
    return { success: false, error: `连接失败，VPN/代理可能拦截了请求，请关闭 VPN 重试` };
  }
  if (lastError.startsWith('TCP_TIMEOUT') || lastError.startsWith('REQUEST_TIMEOUT')) {
    return { success: false, error: `请求超时，请检查网络或关闭 VPN` };
  }
  if (lastError.startsWith('SSL_ERROR:')) {
    return { success: false, error: `SSL 错误，VPN 可能拦截了 HTTPS 流量，请关闭 VPN 重试` };
  }
  return { success: false, error: `网络错误: ${lastError.slice(0, 150)}` };
}

function tryParseJsonTranslate(content) {
  if (!content) return null;

  // 策略1：直接 parse
  try { return JSON.parse(content); } catch {}

  // 策略2：去掉 markdown 代码块
  const codeBlock = content.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1]); } catch {}
  }

  // 策略3：提取第一个 {...} 块
  let depth = 0, start = -1;
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '{') { if (depth === 0) start = i; depth++; }
    else if (content[i] === '}') { depth--; if (depth === 0 && start >= 0) {
      try { return JSON.parse(content.slice(start, i + 1)); } catch {}
      break;
    }}
  }

  // 策略4：段落切分
  const lines = content.split(/\n+/).filter(l => l.trim().length > 3);
  if (lines.length >= 3) {
    return {
      translation: lines[0].replace(/^(翻译|中文翻译|translation)[：:]\s*/i, '').trim(),
      definition: lines[1].replace(/^(定义|学术定义|definition)[：:]\s*/i, '').trim(),
      plain1: lines[2].replace(/^(通俗理解[①②12]|plain[12])[：:]\s*/i, '').trim(),
      plain2: lines[3] ? lines[3].replace(/^(通俗理解[①②12]|plain[12])[：:]\s*/i, '').trim() : lines[2].trim()
    };
  }

  return null;
}


async function testApiConnection(settings) {
  const baseUrl = (settings.apiEndpoint || '').replace(/\/$/, '');
  const apiKey = settings.apiKey || '';
  const model = settings.apiModel || 'gpt-4o-mini';

  if (!baseUrl || !apiKey) {
    return { success: false, error: '未配置 API' };
  }

  const startTime = Date.now();

  try {
    const resp = await nativeRequest('POST', `${baseUrl}/chat/completions`, {
      'Authorization': `Bearer ${apiKey}`
    }, JSON.stringify({
      model: model,
      messages: [{ role: 'user', content: '你好，请回复"连接成功"' }],
      max_tokens: 20
    }), 15000);

    if (!resp.ok) {
      if (resp.status === 401) {
        return { success: false, error: 'API Key 无效 (401)。请检查 api_key 是否正确' };
      }
      const serverMsg = resp.data.error?.message || resp.data.message || '';
      return { success: false, error: `HTTP ${resp.status}: ${serverMsg}` };
    }

    const elapsed = Date.now() - startTime;
    const actualModel = resp.data.model || model;
    return { success: true, model: actualModel, elapsed };

  } catch (e) {
    const msg = e.message || '';

    if (msg.startsWith('DNS_NOT_FOUND:')) {
      return {
        success: false,
        error: `DNS 解析失败: 无法找到服务器 ${msg.split(':')[1]}\n\n可能原因：\n  • 网络断开\n  • VPN 开启导致 DNS 被劫持\n\n请尝试：关闭 VPN 后重试`,
        suggestion: 'close_vpn'
      };
    }
    if (msg.startsWith('CONNECTION_REFUSED:')) {
      return {
        success: false,
        error: `服务器拒绝连接\n\n可能原因：\n  • base_url 拼写错误\n  • VPN 拦截了连接\n\n请尝试：检查 URL 或关闭 VPN`,
        suggestion: 'check_url'
      };
    }
    if (msg.startsWith('SSL_ERROR:')) {
      return {
        success: false,
        error: `SSL/TLS 证书验证失败\n\n最可能原因：VPN/代理正在中间拦截 HTTPS 流量\n\n请尝试：关闭 VPN 后重试`,
        suggestion: 'close_vpn'
      };
    }
    if (msg.startsWith('NETWORK_ERROR:') || msg.startsWith('REQUEST_TIMEOUT') || msg.startsWith('TCP_TIMEOUT')) {
      return {
        success: false,
        error: `网络错误: ${msg.split(':').slice(-2).join(':')}\n\n可能原因：\n  • 网络不通\n  • VPN/代理干扰\n\n请尝试：关闭 VPN 后重试`,
        suggestion: 'close_vpn'
      };
    }
    return { success: false, error: msg.slice(0, 200) };
  }
}

// ============ IPC 处理 ============
function setupIPC() {
  ipcMain.handle('get-settings', () => {
    return Store.getAll();
  });

  ipcMain.handle('save-settings', (event, settings) => {
    const oldHotkey = Store.get('hotkey', DEFAULT_CONFIG.hotkey);
    const oldTranslateHotkey = Store.get('translateHotkey', DEFAULT_CONFIG.translateHotkey);

    Store.set('apiEndpoint', settings.apiEndpoint || '');
    Store.set('apiKey', settings.apiKey || '');
    Store.set('apiModel', settings.apiModel || '');
    Store.set('hotkey', settings.hotkey || DEFAULT_CONFIG.hotkey);
    Store.set('translateHotkey', settings.translateHotkey || DEFAULT_CONFIG.translateHotkey);
    Store.set('cancelKey', settings.cancelKey || DEFAULT_CONFIG.cancelKey);

    const hotkeyChanged = settings.hotkey && settings.hotkey !== oldHotkey;
    const translateHotkeyChanged = settings.translateHotkey && settings.translateHotkey !== oldTranslateHotkey;

    if (hotkeyChanged || translateHotkeyChanged) {
      registerHotkey(
        settings.hotkey || currentHotkey,
        settings.translateHotkey || currentTranslateHotkey
      );
      if (tray) {
        tray.setToolTip('术语解释器 - 解释:' + (settings.hotkey || currentHotkey).replace('CommandOrControl+', 'Ctrl+'));
      }
    }

    return true;
  });

  ipcMain.handle('test-api', async (event, settings) => {
    try {
      const result = await testApiConnection(settings);
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // 网络诊断（新增）
  ipcMain.handle('diagnose-api', async (event, settings) => {
    const baseUrl = settings.apiEndpoint || Store.get('apiEndpoint', '');

    if (!baseUrl) {
      return {
        proxyWarnings: [],
        diagnostics: [{ step: '配置', status: 'fail', detail: '未配置 API 地址，无法诊断' }],
        summary: '请先填写 API 配置'
      };
    }

    // 检测代理
    const { warnings } = detectProxySettings();

    // 运行诊断
    const diagResults = await diagnoseNetwork(baseUrl);

    // 汇总判断
    const hasFail = diagResults.some(r => r.status === 'fail');
    const allPass = diagResults.every(r => r.status === 'pass');
    let summary = '';

    if (hasFail) {
      const failStep = diagResults.find(r => r.status === 'fail');
      summary = `诊断失败于「${failStep.step}」`;
      if (warnings.length > 0) {
        summary += '，且检测到代理环境变量，VPN/代理可能是根本原因';
      }
    } else if (allPass) {
      summary = '网络层面一切正常！现在可以测试 API 连通性';
    } else {
      summary = '网络基本可达，但有警告项，请查看详情';
    }

    return {
      proxyWarnings: warnings,
      diagnostics: diagResults,
      summary
    };
  });

  ipcMain.handle('call-llm', async (event, term) => {
    return await callLLM(term);
  });

  ipcMain.handle('call-llm-translate', async (event, term) => {
    return await callLLMTranslate(term);
  });

  ipcMain.on('close-popup', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
  });

  ipcMain.on('close-all-popups', () => {
    closeAllPopups();
  });
}

// ============ 应用生命周期 ============
app.whenReady().then(() => {
  Store.load();

  const hotkey = Store.get('hotkey', DEFAULT_CONFIG.hotkey);
  const translateHotkey = Store.get('translateHotkey', DEFAULT_CONFIG.translateHotkey);
  registerHotkey(hotkey, translateHotkey);

  createTray();
  setupIPC();

  const hasApi = Store.get('apiEndpoint') && Store.get('apiKey');
  if (!hasApi) {
    createSettingsWindow();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', (e) => {
  if (!isQuitting && process.platform !== 'darwin') {
    // 保持托盘运行
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createSettingsWindow();
  }
});
