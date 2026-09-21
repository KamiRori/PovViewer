# Minecraft POV Viewer

Windows 桌面应用，把多名 Minecraft 玩家的 POV 放在同一条时间轴上查看。产品规则见 `spec.md`。

当前是 Phase 5：可 **Save / Open Project**（`project.json`）；路径失效时卡片显示 Missing File，可用 Locate File 重新定位。

- 单击高亮，双击 Focus；`Esc` / `F` / `M` 快捷键可用。
- **参与** 控制解码器挂载；🔊 为唯一出声。
- 示例：`samples/sync.example.json`、`samples/project.example.json`。

## 开发

```text
npm install
npm run dev
npm test
```

需要 Node.js 20。
