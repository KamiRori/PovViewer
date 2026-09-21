# Minecraft POV Viewer

Windows 桌面应用，把多名 Minecraft 玩家的 POV 放在同一条时间轴上查看。产品规则见 `spec.md`。

当前是 **Phase 6**：网格预览代理、解码预算、封面海报、项目 Save/Open。

- 单击高亮并参与，双击 Focus；`Esc` / `F` / `M` 快捷键可用。
- 卡片 **代理 | 原片** 切换片源（默认原片）；工具栏可批量 **生成预览代理**。
- 代理与封面缓存在项目目录 `minecraft-pov-viewer/`（已 gitignore），不改源文件。
- 🔊 为唯一出声；时间轴可调同时解码路数。
- 示例：`samples/sync.example.json`、`samples/project.example.json`。

## 开发

```text
npm install
npm run dev
npm test
```

需要 Node.js 20。

Windows CI：推送 / PR 到 `main` 时会跑 typecheck、测试与 `electron-vite` 构建。

## 打包（Windows）

```text
npm run dist
```

产物在 `release/`：免安装 `MinecraftPOVViewer-*-portable.exe`，以及可选 NSIS 安装包。内置 `ffmpeg-static`。用户机器不需要 Node.js。

本地真实项目请另存为 `samples/project.json`（已 gitignore）；仓库只保留 `project.example.json`。
