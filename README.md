# 术语解释器 (Term Explainer)

划词即查 — 选中任意术语，一键获得三种维度解释。

## 功能

- **划词查询**：在任意应用中选中文字，按 `Ctrl+Shift+D` 弹出解释
- **三种解释**：
  - 📘 学术定义 — 准确严谨的专业定义
  - 💡 通俗理解 ① — 大白话 + 生活化比喻
  - 💡 通俗理解 ② — 换个角度再解释一遍
- **嵌入式大模型**：支持所有 OpenAI 兼容接口（DeepSeek / 通义千问 / 智谱 / GPT 等）
- **系统托盘**：常驻后台，不占任务栏
- **点击复制**：点击任意卡片即可复制该解释

## 使用

```
1. 在任意应用中选中需要解释的术语
2. 按 Ctrl+Shift+D (Win) / Cmd+Shift+D (Mac)
3. 弹窗自动获取文本并调用 AI 解释
4. 点击任意卡片可复制该解释
```

## 首次配置

首次启动会自动打开设置页面，或右键系统托盘图标 → 设置：

| 字段 | 说明 |
|------|------|
| API Endpoint | OpenAI 兼容接口地址 |
| API Key | 你的 API 密钥 |
| 模型 | 模型名称 |

支持国产大模型：DeepSeek (`deepseek-chat`)、通义千问 (`qwen-turbo`)、智谱 (`glm-4-flash`) 等。

## 开发

```bash
npm install
npm start
```

## 打包

```bash
# Windows (.exe)
npm run build:win

# macOS (.dmg)
npm run build:mac
```

输出在 `dist/` 目录。

## 国内加速

```bash
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install
```
