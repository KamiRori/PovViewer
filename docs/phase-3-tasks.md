# Phase 3 任务清单

范围：offset、`sync.json`、全部 POV 同步播放、NOT STARTED / ENDED。

## 完成定义

- 工具栏有 Import Sync，可读 version 1 的 `sync.json`。
- 按 `playerName` 精确匹配写入 offset；未匹配名单可显示。
- 卡片可查看/编辑 offset；播放位置始终为 `masterTime - offset`。
- 导入同步或改 offset 后会触发重新同步。

## 验证记录

| 项 | 结果 | 备注 |
| --- | --- | --- |
| parseSyncJson | 通过 | 含 confidence 保留与错误拒绝 |
| applySync 匹配 | 通过 | 区分大小写；未匹配单独列出 |
| Import Sync UI | 通过 | 类型检查与手动导入路径已接好 |
| offset 编辑 | 通过 | 卡片可改，并触发 resync |
