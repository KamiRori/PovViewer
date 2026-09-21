# Phase 6 任务清单

范围：网格预览代理（FFmpeg）、同时解码预算、视口外卸载，支撑约 50 POV 的可操作监看。

## 完成定义

- 内置 `ffmpeg-static`，代理写入项目目录 `minecraft-pov-viewer/proxies/`（gitignore），**不改写源文件**。
- 网格预览规格：约 320×180、15fps、无音频；缓存键含路径 + size + mtime + 配置标签。
- 工具栏 **生成预览代理**：批量排队编码；默认约一半逻辑 CPU 做文件并发，每任务多线程 `ultrafast`；Windows 中文路径经 ASCII 工作目录硬链/短路径中转。可用 `POV_PROXY_CONCURRENCY` 覆盖文件并发。
- 每张卡片可切换 **代理 | 原片**（默认原片）；选代理且未生成时提示「代理未生成」。
- `DecodeBudgetProvider`：播放时限制同时连续解码路数（可在时间轴调节）；超出预算显示静止帧 +「排队解码」。
- 视口外 / 未参与不挂载解码器；空闲网格用 JPEG 海报占位。
- `expectedTime` 计算不因代理或卸载而改变；重新进入视口按当前 `masterTime - offset` 校正。

## 任务顺序

1. 主进程 `ProxyService` + IPC（ensure / status / batch）。
2. 渲染：卡片片源切换、网格代理、Focus 原片优先。
3. 解码预算接入 `VideoSurface` + 时间轴「同时解码」控件。
4. 文档与 typecheck / 单元测试。

## 验证记录

| 项 | 结果 | 备注 |
| --- | --- | --- |
| proxy cache key | 通过 | size/mtime/标签变化换键 |
| ASCII / Unicode 路径编码 | 通过 | 单元测试 + Windows 桌面路径修复 |
| 片源默认原片 / 卡片切换 | 通过 | project.json 可持久化 `playbackSource` |
| typecheck / 单元测试 | 通过 | 67 tests |
| 生成预览代理（手动） | 待补测 | 看提示中的 proxies 路径；源文件未改 |
| 解码预算（手动） | 待补测 | 多路参与时超出上限显示排队 |
| 50 POV 打开/拖动/Focus | 待补测 | 规格验收 I |
