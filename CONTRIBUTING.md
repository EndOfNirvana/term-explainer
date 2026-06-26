# 贡献指南

感谢你对术语解释器项目的关注！无论你是开发者还是非开发者，都可以参与协作。

## 非开发者可以做什么

你不需要写代码也能为项目做贡献：

### 报告 Bug

在 [Issues](https://github.com/EndOfNirvana/term-explainer/issues) 页面点击「New issue」，选择「Bug 报告」模板，描述你遇到的问题：

- 你做了什么操作
- 预期发生什么
- 实际发生了什么
- 附上截图（如果有的话）

### 提出功能建议

同样在 Issues 页面，选择「功能建议」模板，描述你希望增加的功能。

### 测试反馈

下载最新版本试用，把使用体验和发现的问题反馈给我们。

---

## 开发者贡献指南

### 开发环境准备

```bash
# 1. Fork 仓库到你自己的 GitHub 账号
# 2. Clone 到本地
git clone https://github.com/<你的用户名>/term-explainer.git
cd term-explainer

# 3. 安装依赖
npm install

# 4. 启动开发
npm start
```

### 开发流程

1. **拉取最新代码**

```bash
git checkout main
git pull upstream main
```

2. **创建功能分支**

```bash
# 分支命名规范
# 功能：feature/功能描述
# 修复：fix/问题描述
git checkout -b feature/add-dark-mode
```

3. **开发并测试**

修改代码后用 `npm start` 本地测试。确保功能正常、无报错。

4. **提交代码**

```bash
git add -A
git commit -m "feature: 添加深色模式"
```

提交信息规范：
- `feature:` 新功能
- `fix:` Bug 修复
- `docs:` 文档更新
- `refactor:` 代码重构
- `chore:` 构建/配置变更

5. **推送并创建 Pull Request**

```bash
git push origin feature/add-dark-mode
```

然后到 GitHub 页面点击「Compare & pull request」，填写 PR 描述。

### Pull Request 要求

- 一个 PR 只做一件事，不要混合多个功能
- 确保代码能正常启动运行（`npm start` 无报错）
- 如果新增功能，请更新 README.md
- 提交信息清晰描述做了什么

### 代码结构说明

| 文件 | 职责 | 改动频率 |
|------|------|---------|
| `main.js` | 主进程：快捷键注册、IPC 通信、API 调用、网络诊断 | 高 |
| `preload-popup.js` | 弹窗预加载：暴露 IPC 接口给渲染进程 | 中 |
| `preload-settings.js` | 设置页预加载：暴露设置读写和测试接口 | 中 |
| `renderer/popup.html` | 弹窗 UI + 交互逻辑 | 高 |
| `renderer/settings.html` | 设置页 UI + 诊断面板 | 中 |

### 关键注意事项

- API 调用使用 Node.js 原生 `https` 模块，不要引入 `node-fetch` 等外部库
- 不要硬编码 `temperature` / `max_tokens` 等模型参数，不同模型要求不同
- 不要设置默认模型，用户必须自己填写
- 快捷键注册需先 `unregister` 旧的再注册新的
- 弹窗窗口属性：`frame: false, transparent: true, alwaysOnTop: true`

## 协作沟通

- **Bug 和功能建议**：通过 [Issues](https://github.com/EndOfNirvana/term-explainer/issues) 提交
- **代码讨论**：在 Pull Request 中 review 讨论
- **紧急问题**：直接在 Issue 中 @ 仓库管理员

## 行为准则

- 尊重每位贡献者
- 友善讨论，对事不对人
- 欢迎新手提问，耐心解答
