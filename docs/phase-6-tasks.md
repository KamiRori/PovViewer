# Phase 6 任务清单

范围：网格预览代理（FFmpeg）、同时解码预算、视口外卸载，支撑约 50 POV 的可操作监看。

## 完成定义

- 内置 `ffmpeg-static`，代理写入 `userData/proxies/`，**不改写源文件**。
- 网格预览规格：约 320×180、15fps、无音频；缓存键含路径 + size + mtime + 配置标签。
- 工具栏 **生成预览代理**：对当前项目批量排队编码；网格/侧栏就绪后改播代理；Focus 主画面优先原片，原片失败时回退代理。
- `DecodeBudgetProvider`：播放时限制同时连续解码路数（可在时间轴调节）；超出预算显示静止帧 +「排队解码」。
- 视口外不挂载解码器（既有 IntersectionObserver + arm 逻辑保留）。
- `expectedTime` 计算不因代理或卸载而改变；重新进入视口按当前 `masterTime - offset` 校正。

## 任务顺序

1. 主进程 `ProxyService` + IPC（ensure / status / batch）。
2. 渲染：网格改播代理、Focus 回退。
3. 解码预算接入 `VideoSurface` + 时间轴「同时解码」控件。
4. 文档与 typecheck / 单元测试。

## 验证记录

| 项 | 结果 | 备注 |
| --- | --- | --- |
| proxy cache key | 通过 | size/mtime 变化换键 |
| typecheck / 单元测试 | 通过 | 47 tests |
| 生成预览代理（手动） | 待手动 | 缓存目录有 mp4；源文件未改 |
| 解码预算（手动） | 待手动 | 多路参与时超出上限显示排队 |
| 50 POV 打开/拖动/Focus | 待手动 | 规格验收 I |
