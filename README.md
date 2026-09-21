# Minecraft POV Viewer

Windows 桌面应用，把多名 Minecraft 玩家的 POV 放在同一条时间轴上查看。产品规则见 `spec.md`。

当前是 Phase 2：导入 POV 后可用底部 Master Timeline 播放、暂停、拖动、±10s 和倍速。所有画面位置由 `masterTime - offset` 推导。

## 开发

```text
npm install
npm run dev
npm test
```

需要 Node.js 20。`npm run dev` 会打开标题为 Minecraft POV Viewer 的窗口。关闭窗口后进程退出。
