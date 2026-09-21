# Phase 4 任务清单

范围：Focus Mode、静音管理、高亮、全屏、搜索。

## 完成定义

- 单击卡片高亮；双击进入 Focus（主画面 + 侧栏预览）。
- Focus 仅聚焦 POV 可出声；`Esc` 返回网格；`F` 全屏聚焦卡片；`M` 切换当前出声。
- Grid 默认全静音；点 🔊 设为唯一 solo。
- 「参与」按钮控制解码器挂载；与高亮/Focus 分离。
- 顶栏搜索按 `playerName` 子串筛选（不改 `enabled`）。

## 验证记录

| 项 | 结果 | 备注 |
| --- | --- | --- |
| shouldMutePov | 通过 | Grid solo / Focus+M |
| matchesPlayerQuery | 通过 | 大小写不敏感子串 |
| typecheck / 单元测试 | 通过 | 42 tests |
| Focus 布局与快捷键 | 待手动 | Esc / F / M / 双击 |
