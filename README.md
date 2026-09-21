# Minecraft POV Viewer

Windows 桌面应用，把多名 Minecraft 玩家的 POV 放在同一条时间轴上查看。产品规则见 `spec.md`。

当前是 Phase 3：导入 POV 与 sync.json 后，各路按 `masterTime - offset` 同步查看。可用「重新同步」纠正播放漂移。

底部可调**预览画质**。点击视角卡片切换是否**参与播放**（描边=已选中）；**只有选中的卡片会挂载解码器**，其余只保留静态预览帧。新导入时默认仅第一路参与。工具栏 **GPU 调试** 可观察进程与功能活动。单路原片仍重时需后续低分辨率代理转码。

## 开发

```text
npm install
npm run dev
npm test
```

需要 Node.js 20。`samples/sync.example.json` 是同步文件示例。
