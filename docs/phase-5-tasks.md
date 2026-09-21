# Phase 5 任务清单

范围：`project.json` 保存与加载、Missing File 与 Locate File。

## 完成定义

- 工具栏有 Save Project / Open Project。
- 项目文件 version 1：持久化 id、playerName、filePath、offset、enabled、muted；不把 duration 当权威值。
- 打开后重新探测元数据；路径不存在显示 Missing File + Locate File。
- Locate 后保留 id / playerName / offset / enabled / muted，只更新 filePath。

## 验证记录

| 项 | 结果 | 备注 |
| --- | --- | --- |
| serialize / parse | 通过 | 忽略 duration；拒绝非 v1 |
| typecheck / 单元测试 | 通过 | 45 tests |
| Save / Open / Locate | 待手动 | 工具栏与 Missing File 卡片 |
