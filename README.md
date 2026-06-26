# 术语解释器 (Term Explainer)

> 划词即查 — 选中任意术语，一键获得三种维度解释。支持英中翻译模式。

桌面端 AI 划词工具，基于 Electron 构建。在任何应用中选中文字，按下快捷键即可弹出解释弹窗，无需切换窗口。

## 核心功能

### 两种模式

| 模式 | 默认快捷键 | 说明 |
|------|-----------|------|
| 术语解释 | `Ctrl+Shift+D` | 学术定义 + 两种通俗理解 |
| 英文翻译 | `Ctrl+Shift+T` | 中文翻译 + 学术定义 + 两种通俗理解 |

### 特性

- **划词即查** — 任意应用中选中文字，快捷键触发，弹窗自动获取选中文本
- **三种解释** — 学术定义 + 两个角度的通俗理解，帮你真正看懂一个词
- **英文翻译** — 独立快捷键触发，翻译并解释英文术语
- **多弹窗并存** — 弹窗浮于桌面，可拖动，支持同时查多个词
- **自定义快捷键** — 查询键、翻译键、关闭键均可自定义
- **网络诊断** — 四级诊断（DNS / TCP / TLS / HTTP），帮你定位连接问题
- **VPN 检测** — 自动检测代理环境，提示 VPN 干扰
- **点击复制** — 点击任意卡片即可复制解释内容
- **系统托盘** — 常驻后台，不占任务栏
- **OpenAI 兼容** — 支持 DeepSeek / 通义千问 / 智谱 / Kimi / GPT 等所有 OpenAI 接口格式的大模型

## 下载使用

### 直接下载（推荐）

前往 [Releases 页面](https://github.com/EndOfNirvana/term-explainer/releases) 下载对应平台的压缩包：

| 平台 | 文件 | 说明 |
|------|------|------|
| Windows | `术语解释器-Windows-x64.zip` | 解压后双击 `.exe` |
| macOS (Apple Silicon) | `术语解释器-macOS-arm64.zip` | 解压后双击 `.app` |
| macOS (Intel) | `术语解释器-macOS-x64.zip` | 同上 |

**无需安装任何依赖，解压即用。**

### 首次配置

1. 启动后会自动打开设置页面（或右键托盘图标 → 设置）
2. 填写 API 配置：

| 字段 | 说明 | 示例 |
|------|------|------|
| API Endpoint | OpenAI 兼容接口地址 | `https://api.deepseek.com/v1` |
| API Key | 你的 API 密钥 | `sk-xxxxxxxx` |
| 模型 | 模型名称 | `deepseek-chat` |

3. 点击「测试连接」验证配置
4. 如遇连接问题，点击「诊断网络」逐层排查

### 常见模型配置

| 平台 | Endpoint | 模型 |
|------|----------|------|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-turbo` |
| 智谱 | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| MiniMax | `https://api.minimaxi.com/v1` | `MiniMax-M3` |

## 本地开发

### 环境要求

- Node.js >= 18
- npm >= 9

### 启动

```bash
# 安装依赖（国内用户可加镜像加速）
npm install

# 开发模式运行
npm start
```

### 国内加速 Electron 下载

```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
```

### 打包

```bash
# Windows
npx electron-packager . "术语解释器" --platform=win32 --arch=x64 --out=dist --overwrite --icon=build/icon.ico

# macOS (需在 Mac 上执行)
npx electron-packager . "术语解释器" --platform=darwin --arch=arm64 --out=dist --overwrite
```

推送代码到 GitHub 后，Actions 会自动打包所有平台版本。

## 项目结构

```
term-explainer/
├── main.js              # Electron 主进程（快捷键、IPC、API 调用、网络诊断）
├── preload-popup.js     # 弹窗预加载脚本
├── preload-settings.js  # 设置页预加载脚本
├── renderer/
│   ├── popup.html       # 解释/翻译弹窗 UI
│   ├── settings.html    # API 设置 + 快捷键设置 + 网络诊断
│   └── index.html       # 入口页
├── build/
│   ├── icon.ico         # Windows 图标
│   └── icon.png         # 通用图标
├── .github/workflows/
│   └── build.yml        # GitHub Actions 自动打包
└── package.json
```

## 技术栈

- **Electron** 33.x — 跨平台桌面框架
- **原生 https 模块** — 零外部依赖的 API 调用，绕过代理干扰
- **Win32 keybd_event** — 系统级按键注入，可靠读取选中文本
- **IPC 通信** — 主进程统一处理 API 调用，避免 CORS 和稳定性问题

## 参与贡献

欢迎提交 PR、报告 Bug、提出功能建议！请阅读 [贡献指南](CONTRIBUTING.md)。

## License

[MIT](LICENSE)
