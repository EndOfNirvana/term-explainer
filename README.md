# 术语解释器 (Term Explainer)

> 划词即查 · 三种模式 · 一键解释 —— 选中任意术语，AI 帮你从三个维度理解它。

桌面端 AI 划词工具，基于 Electron 构建。在任何应用中选中文字，按下快捷键即弹出解释弹窗，无需切换窗口。支持英文翻译和学术文献检索。

---

## 三种模式

| 模式 | 快捷键（默认） | 弹窗颜色 | 产出内容 |
|------|:-----------:|:--------:|----------|
| 解释 | `Ctrl+Shift+D` | 紫色 | 学术定义 + 两个通俗理解 |
| 翻译 | `Ctrl+Shift+T` | 绿色 | 中文翻译 + 学术定义 + 两个通俗理解 |
| 学术 | `Ctrl+Shift+S` | 蓝色 | 解释 + Semantic Scholar 文献 + OpenAlex 文献 |

所有快捷键均可在设置页自定义。三种模式共享同一套 API 配置（Endpoint / Key / Model）。

---

## 全部特性

**核心体验**
- 划词即查 —— 任意应用中选中文字 → 按快捷键 → 弹窗自动获取选中文本
- 三种解释 —— 学术定义 + 两个不同角度的通俗理解，拒绝堆砌术语
- 多弹窗并存 —— 浮于桌面，可拖动、可缩放，同时查多个词互不干扰
- 点击复制 —— 点击任意卡片即可复制解释内容
- 手动输入 —— 弹窗内可直接输入术语查询

**翻译模式**
- 选中英文词/句 → `Ctrl+Shift+T` → 中文翻译 + 解释
- 绿色主题弹窗，与解释模式一眼区分

**学术模式**
- 选中学术术语 → `Ctrl+Shift+S` → LLM 解释 + 两篇真实文献
- 三路并行请求：LLM（解释） + Semantic Scholar（英文文献）+ OpenAlex（全语种文献）
- 文献卡片标注来源数据库名称，点击在浏览器打开论文页
- 蓝色主题弹窗

**网络诊断**
- 四级逐层诊断：DNS 解析 → TCP 连接 → TLS 握手 → HTTP 可达
- 自动检测系统代理环境（HTTP_PROXY / HTTPS_PROXY）
- VPN/代理拦截时给出明确提示和修复建议

**系统集成**
- 系统托盘常驻，不占任务栏
- 托盘右键菜单：设置 / 解释 / 翻译 / 学术 / 关闭所有弹窗 / 退出
- 全局快捷键注册，应用后台运行即可使用

**兼容性**
- OpenAI 兼容接口 —— DeepSeek / 通义千问 / 智谱 / Kimi / GPT / MiniMax 均可
- 零外部依赖 —— API 调用使用 Node.js 原生 `https` 模块，不依赖 `node-fetch` 等第三方包
- 不硬编码 `temperature` / `max_tokens`，兼容各类模型参数限制

---

## 下载使用

### 直接下载

前往 Releases 页面下载对应平台压缩包，**解压即用，无需安装任何依赖**：

| 平台 | 文件 |
|------|------|
| Windows | `术语解释器-Windows-x64.zip` |
| macOS Apple Silicon | `术语解释器-macOS-arm64.zip` |
| macOS Intel | `术语解释器-macOS-x64.zip` |

### 首次配置

1. 启动后自动打开设置页面（或右键托盘图标 → 设置）
2. 填写 API 配置后点击「测试连接」
3. 如遇连接问题，点击「诊断网络」逐层排查

### 模型配置速查

| 平台 | Endpoint | 模型名 |
|------|----------|--------|
| DeepSeek | `https://api.deepseek.com/v1` | `deepseek-chat` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-turbo` |
| 智谱 GLM | `https://open.bigmodel.cn/api/paas/v4` | `glm-4-flash` |
| Kimi | `https://api.moonshot.cn/v1` | `moonshot-v1-8k` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o-mini` |
| MiniMax | `https://api.minimaxi.com/v1` | `MiniMax-M3` |

---

## 学术模式原理

```
选中术语 → 三路并行请求
  ├─ LLM API ────────→ 学术定义 + 通俗理解
  ├─ Semantic Scholar → 最高引英文论文（标题/作者/年份/DOI链接）
  └─ OpenAlex ───────→ 最相关论文（全语种，标题/作者/被引数/链接）
```

三路互不依赖，任一路失败不影响其他。文献卡片标注来源，点击在默认浏览器打开。

---

## 本地开发

**环境要求**：Node.js >= 18

```bash
# 安装依赖
npm install

# 启动开发模式
npm start

# 打包 Windows 版
npx electron-packager . "术语解释器" --platform=win32 --arch=x64 --out=dist --overwrite --icon=build/icon.ico

# 打包 macOS 版（需在 Mac 上执行）
npx electron-packager . "术语解释器" --platform=darwin --arch=arm64 --out=dist --overwrite
```

> 国内用户安装依赖慢？设置镜像：
> ```bash
> npm config set registry https://registry.npmmirror.com
> npm config set electron_mirror https://npmmirror.com/mirrors/electron/
> ```

---

## 项目结构

```
term-explainer/
├── main.js                  # Electron 主进程（快捷键/弹窗/API/诊断/文献检索）
├── preload-popup.js         # 弹窗预加载脚本（IPC 桥接）
├── preload-settings.js      # 设置页预加载脚本（IPC 桥接）
├── renderer/
│   ├── popup.html           # 解释弹窗 UI（三种模式共用）
│   └── settings.html        # API / 快捷键 / 诊断 设置页
├── build/
│   └── icon.ico             # Windows 图标
├── .github/workflows/
│   └── build.yml            # GitHub Actions 自动打包 Win + Mac
├── package.json
├── README.md
├── CONTRIBUTING.md
├── CHANGELOG.md
└── LICENSE                  # MIT
```

---

## 贡献

欢迎任何形式的贡献！详见 [CONTRIBUTING.md](./CONTRIBUTING.md)。

- 报 Bug / 提需求 → Issues 页面，模板已配好
- 改代码 → Fork → 创建分支 → 提交 PR
- 非开发者 → 测试反馈 / 文档改进 / 使用建议 同样重要

---

## 许可证

MIT License — 详见 [LICENSE](./LICENSE)。
