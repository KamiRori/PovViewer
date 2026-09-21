# Phase 2 任务清单

范围：Master Timeline、Play / Pause、Seek、Playback Speed、Master Clock。

本阶段不做：`sync.json`、offset 编辑、Focus、项目保存、代理。

## 完成定义

- 底部有唯一 Master Timeline。
- Play / Pause / ±10s / 倍速作用于 `masterTime`。
- 主时钟用 `requestAnimationFrame`，不用 `setInterval`。
- 视频只在 seek、开始播放、误差 > 0.05s 时校正 `currentTime`。
- 拖动时间轴时合并 seek，不在每个 input 上强制全量 seek。
- 卡片显示 `NOT STARTED` / 当前时间 / `ENDED`（offset 仍为 0，公式已按 `masterTime - offset`）。

## 验证记录

| 项 | 结果 | 备注 |
| --- | --- | --- |
| 时间轴范围 | 通过 | 有元数据后出现可拖动范围；单元测试覆盖负 offset。 |
| 播放 / 暂停 | 通过 | `00:00.000` → `00:00.908`；空格可切换。 |
| Seek / 拖动 | 通过 | 拖到约一半后显示 `00:02.528`。 |
| ±10s | 通过 | `+10s` 后夹到片尾 `00:05.055`。 |
| 倍速 | 通过 | UI 提供 0.5–4x；主时钟按 rate 推进。 |
| 校正阈值单元测试 | 通过 | `needsCorrection`：0.04 不校正，0.06 校正。 |
| 无每帧强制 seek | 通过 | 仅 `seekGeneration`、起播与漂移校正写入 `currentTime`。 |
