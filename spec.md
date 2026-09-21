# Minecraft 多 POV 同步监看器 — 产品规格

状态：Phase 1–6 已落地（含 Windows 打包配置）。本文件仍是产品与验收的唯一依据。实现细节见 `docs/architecture.md`；各阶段任务见 `docs/phase-*-tasks.md`。

## 1. 产品定位

这是一个 Windows 桌面应用，用来把几十名 Minecraft 玩家各自用 OBS 录下的 POV 放到同一条时间轴上，并排查看同一真实时刻每个人在做什么。

它是 **Minecraft Event POV Investigation / Multi-POV Viewer**。

它不是剪辑软件。第一版只解决：

> 导入几十个 POV → 套用已有同步偏移 → 在统一时间轴上同步查看。

目标用户能在 5 分钟内完成：打开程序、导入 30～50 个 POV、导入 `sync.json`、开始播放、拖动时间轴、点开不同玩家。

## 2. 平台与交付

- 运行环境：Windows 桌面。
- 技术栈：Electron + React + TypeScript + Vite + CSS。播放使用 HTML5 Video。
- 交付物：可双击运行的 `MinecraftPOVViewer.exe`。用户不需要安装 Node.js。
- 媒体与项目数据全部留在本机。不上传视频，不接入云服务，不做网络多人协作。

## 3. 第一版明确不做

以下功能不进入第一版，也不在任何 Phase 里“顺手”实现：

- 视频剪辑、导出、作为默认行为的转码
- AI 识别玩家、OCR、人脸识别
- Minecraft 事件识别、击杀识别、游戏数据分析、自动精彩集锦
- 自动计算同步偏移（只预留接口，算法属于后续阶段）
- 网络协作、云端上传

修改用户原始视频文件是禁止行为。代理文件若在后续阶段生成，必须写到应用缓存目录，不得覆盖或改写源文件。

## 4. 使用场景与时间模型

每名玩家的录制起点不同。程序建立一条 **Master Timeline**，所有画面表示同一个真实时间。

```text
Player A: 00:00 ─────────────────────────
Player B:       00:00 ──────────────────
Player C:             00:00 ────────────
Player D:    00:00 ─────────────────────

Master Timeline
00:00 ───────────────────────────────>
A     ───────────────────────────────
B          ──────────────────────────
C               ─────────────────────
D       ─────────────────────────────
```

唯一时间基准是 `masterTime`，单位为秒，使用双精度浮点数，例如 `125.432`。

每个 POV 的画面时间只由下面的公式得出：

```text
videoTime = masterTime - offset
```

例：`masterTime = 100`

| 玩家 | offset | videoTime |
| --- | ---: | ---: |
| Alice | 0 | 100 |
| Bob | 13.42 | 86.58 |
| Charlie | -5.81 | 105.81 |

`offset` 的含义：该视频的 `t = 0` 落在 Master Timeline 的哪一秒。正偏移表示开录更晚，负偏移表示开录早于 Master 的 0 点。

边界：

| 条件 | 卡片状态 |
| --- | --- |
| `videoTime < 0` | `NOT STARTED` |
| `0 ≤ videoTime ≤ duration` | 播放中，显示该 POV 自己的时间 |
| `videoTime > duration` | `ENDED` |

播放、暂停、拖动、快进、后退、倍速全部作用于 `masterTime`。禁止给每个视频做独立时间轴，禁止把某个 `<video>.currentTime` 当作系统时间。

## 5. 数据模型

### 5.1 POV

持久化与运行时使用的核心字段：

```typescript
interface POV {
  id: string;
  playerName: string;
  filePath: string;
  duration: number;
  offset: number;
  enabled: boolean;
  muted: boolean;
}
```

规格允许的运行时扩展（不写入用户源视频，缺失状态在打开项目时重新探测）：

```typescript
interface POVRuntime extends POV {
  /** 元数据尚未读完时为 false。此时 duration 不得参与 ENDED 判断。 */
  metadataReady: boolean;
  /** 打开项目时路径不存在，或用户尚未重新定位。 */
  missing: boolean;
}
```

| 字段 | 规则 |
| --- | --- |
| `id` | 导入时生成，项目内稳定。重命名、改偏移、重新定位文件都不改变 `id`。 |
| `playerName` | 默认取文件名（不含扩展名）。用户可改。导入同步数据时按这个名字匹配。 |
| `filePath` | 本机绝对路径。项目文件只存路径，不内嵌视频。 |
| `duration` | 媒体真实时长（秒）。由文件元数据读出，不要求用户填写。 |
| `offset` | 秒。未导入同步数据时默认为 `0`。 |
| `enabled` | 为 false 时不出现在当前网格。 |
| `muted` | 该 POV 是否允许出声。真正能否出声还受第 8 节的声音策略约束。 |

同名玩家：自动在名称后加 ` (2)`、` (3)`。同步匹配用最终名称；用户应在导入 `sync.json` 前把名称改成与同步文件一致，或由同步导入按名字覆盖匹配。匹配失败的条目保持原 offset，并在界面标出未匹配名单。

### 5.2 同步结果

第一版只消费外部算好的结果，不计算偏移。类型必须独立存在，以便以后替换算法：

```typescript
interface SyncResult {
  playerName: string;
  offset: number;
  confidence?: number;
}
```

`sync.json`（version 1）：

```json
{
  "version": 1,
  "povs": [
    { "playerName": "Alice", "offset": 0 },
    { "playerName": "Bob", "offset": 13.42 },
    { "playerName": "Charlie", "offset": -5.81 }
  ]
}
```

应用规则：按 `playerName` 精确匹配（区分大小写，与文件名默认值一致）。匹配成功则写入 `offset`。`confidence` 在第一版可以忽略，但解析时必须保留，不能因为多了该字段而拒绝文件。

### 5.3 项目文件

`project.json`（version 1）：

```json
{
  "version": 1,
  "masterDuration": 3600,
  "povs": [
    {
      "id": "alice",
      "playerName": "Alice",
      "filePath": "D:/POV/Alice.mp4",
      "offset": 0,
      "enabled": true,
      "muted": true
    }
  ]
}
```

- 不复制、不内嵌视频。
- `duration` 不作为权威值持久化；每次打开项目从文件重新探测。文件里若带有 `duration`，加载时忽略。
- `masterDuration` 是方便字段。加载后按第 6 节重新计算；不一致时以计算结果为准。

路径失效时，该卡片显示：

```text
Missing File
Alice.mp4
[Locate File]
```

用户重新选择文件后更新 `filePath`，保留 `id`、`playerName`、`offset`、`enabled`、`muted`。

## 6. Master Timeline 范围

```text
timelineStart = min(0, 所有 POV 的 offset)
timelineEnd   = max(offset + duration)   // 仅统计 metadataReady 的 POV
masterDuration = timelineEnd - timelineStart
```

没有可用 POV 时，范围为 `0 … 0`，时间轴禁用。

`masterTime` 始终夹在 `[timelineStart, timelineEnd]`。负 offset 允许时间轴进入负数，这样开录早于 0 点的 POV 也能被看到。

界面时间格式：`HH:MM:SS.mmm`，不足一小时时可显示 `MM:SS.mmm`。内部计算始终用秒。

## 7. 播放与同步

### 7.1 主时钟

使用一个 Master Clock，由 `requestAnimationFrame` 驱动。禁止用 `setInterval` 充当精确同步源。

播放中：

```text
masterTime += deltaSeconds * playbackRate
```

然后每个处于有效区间的 POV 得到 `expectedTime = masterTime - offset`。

### 7.2 校正，而不是每帧赋值

禁止每一帧对所有 `video.currentTime` 赋值。

只在下列时机校正：

- 用户 seek（含时间轴拖动结束后的一次统一 seek）
- 从暂停进入播放
- `abs(video.currentTime - expectedTime) > 0.05`

阈值固定为 **0.05 秒**。性能优化不得放宽到破坏同步，也不得改成每帧硬写。

拖动时间轴时：

```text
拖动过程更新 masterTime 的显示
→ 合并到一帧
→ 松手或合并帧到达时，对所有有效 POV 统一 seek
```

拖动过程中不要对每个 `input` 事件各触发一轮 50 路 seek。

`videoTime` 越界的 POV 不 seek、不播放，只显示 `NOT STARTED` 或 `ENDED`。

### 7.3 控制

| 控制 | 行为 |
| --- | --- |
| Play / Pause | 切换 Master Clock。空格对当前高亮 POV 所在窗口生效。 |
| Seek | 设置 `masterTime`，并按 7.2 校正。 |
| −10s / +10s | `masterTime` 平移 10 秒，再夹紧到时间轴范围。 |
| Speed | 作用于 Master Clock。档位：`0.5`、`1`、`1.5`、`2`、`4`。默认 `1`。 |

## 8. 两种查看模式与性能

禁止的实现：50 个 `<video>` 同时 autoplay、同时解码 1080p、同时出声。

50 个 POV 能打开项目，不等于 50 路全分辨率解码。

### 8.1 Grid Mode

默认界面。用于快速扫视。

- 默认 4 列，行数随数量增长（4 × N）。
- 用户可选 2、3、4、5、6 列。
- 单元格显示尺寸约 320×180，不按源分辨率铺满屏幕。
- 默认全部静音。
- 只解码看清网格所需的画面。后续阶段用低分辨率代理承担网格解码；在代理出现之前，网格视频保持静音、禁止 autoplay 全分辨率硬解作为“能用就行”的实现。

### 8.2 Focus Mode

双击某个 POV 进入。

- 当前 POV 用较高分辨率播放，允许出声。
- 其余 POV 收进侧边栏，仍跟随 Master Clock，但是低优先级预览。
- 显示玩家名与当前 `masterTime`。
- 单击卡片：高亮该 POV。快捷键：空格播放/暂停，`M` 静音切换，`F` 全屏当前焦点。

### 8.3 声音

同一时刻最多一条音轨。

| 模式 | 规则 |
| --- | --- |
| Grid | 默认全部静音。用户点名打开某一个 🔊 时，只保留该 POV 出声，其余强制静音。 |
| Focus | 只有当前聚焦 POV 出声。离开 Focus 后回到 Grid 的静音策略。 |

## 9. 界面

```text
┌─────────────────────────────────────────────────────┐
│ Minecraft POV Viewer                                │
├─────────────────────────────────────────────────────┤
│ [Import POV] [Import Sync] [Save Project] [Open]    │
│ 列数 2 3 4 5 6          搜索玩家                     │
├─────────────────────────────────────────────────────┤
│  POV 卡片网格 / Focus 布局                           │
├─────────────────────────────────────────────────────┤
│ ▶  00:13:42.321                                     │
│ ────────────────●──────────────────────────────     │
│ ◀ −10s    ▶/Ⅱ    +10s     Speed 1.0x                │
└─────────────────────────────────────────────────────┘
```

Phase 1 只要求顶栏导入、列数和网格出现。时间轴、同步、Focus、保存在后续 Phase 按第 11 节接入，控件位置预留，不在 Phase 1 做成可操作的假功能。

每个卡片显示玩家名。进入同步播放之后还要显示该 POV 时间或 `NOT STARTED` / `ENDED`。

搜索/筛选按 `playerName` 子串匹配，不区分大小写。筛选只影响网格可见性，不改 `enabled`，也不改时间轴。

## 10. 导入

**Import POV**：系统文件框多选。接受 `.mp4`、`.mkv`、`.mov`。实现时可同时接受 Chromium 能直接播的 `.webm`，但规格承诺的是前三种。

导入后：

```text
Alice.mp4 → playerName = "Alice"
```

一次导入几十个文件时程序不得崩溃。重复路径不重复加入。

**浏览器兼容：** Chromium 对 MKV、以及对部分 MOV/MP4 编码（例如 HEVC）可能无法直接播放。处理原则：

1. 永远不改源文件。
2. 能直接播的文件，Viewer 直接播源文件。
3. 不能直接播的文件，后续阶段用 FFmpeg 在缓存目录生成临时代理，Viewer 播代理。
4. 网格性能不够时，再额外生成约 `320×180`、`15fps` 的预览代理；Focus 仍优先用可播放的原片。
5. 代理是优化与兼容手段，不是导入后的默认步骤。Phase 1 到 Phase 5 不生成代理。不能播放的文件在网格里显示明确占位（容器/编码不受支持），而不是静默失败。

## 11. 交付阶段

必须按顺序做。每个 Phase 结束都要在 Windows 上把应用跑起来，按该阶段的验证项看过，再进入下一阶段。

| Phase | 完成内容 |
| --- | --- |
| 1 | Electron、React、TypeScript、基础窗口、视频导入、POV 列表、视频网格 |
| 2 | Master Timeline、播放/暂停、Seek、倍速、Master Clock |
| 3 | offset、`sync.json`、全部 POV 同步播放、NOT STARTED / ENDED |
| 4 | Focus Mode、静音管理、高亮、全屏、搜索 |
| 5 | `project.json` 保存与加载、Missing File 与 Locate File |
| 6 | 网格性能：代理、解码预算、50 POV 压力验证 |

Phase 1 的任务拆分以 `docs/phase-1-tasks.md` 为准。

## 12. 验收标准

| 编号 | 标准 |
| --- | --- |
| A | 一次导入 50 个 1080p MP4，程序不崩溃。 |
| B | Alice offset 0、Bob offset 10，Master Time = 100 时，Alice 在 100 秒，Bob 在 90 秒。 |
| C | 时间轴从 00:01:00 拖到 00:05:00，所有处于有效区间的 POV 跳到由公式算出的位置。 |
| D | 点击 Play 后，有效区间内的 POV 跟随同一个 Master Clock。 |
| E | `masterTime - offset < 0` 时显示 `NOT STARTED`。 |
| F | `masterTime - offset > duration` 时显示 `ENDED`。 |
| G | 双击 POV 进入 Focus Mode。 |
| H | Grid 默认全静音；Focus 只有当前 POV 出声。 |
| I | 50 POV 的项目可以打开、拖动时间轴、切换 POV，且不同时全分辨率解码 50 路。 |

A 在 Phase 1 结束时就要成立（导入与网格不崩溃）。B–F 在 Phase 3 结束时成立。G–H 在 Phase 4 结束时成立。I 在 Phase 6 结束时按性能口径复验；Phase 1 只保证“加载与展示不崩溃”，不保证 50 路流畅解码。

## 13. 开发约束

1. 不要一次实现所有 Phase。
2. 每完成一个 Phase 先运行验证，再继续。
3. 不为了同步去改原始视频。
4. 不要把“全部转成新文件”当作默认路径。
5. 不要同时播放几十路音频。
6. 不要每一帧强制设置所有 `video.currentTime`。
7. Master Timeline 是唯一时间基准。
8. 播放位置一律由 `masterTime - offset` 推导。
9. 视频路径与项目配置分离，项目只存路径。
10. 性能优化不能破坏同步精度（0.05 秒校正阈值保持有效）。
11. 不引入云服务，不上传用户视频。
12. 同步算法与 Viewer 解耦，Viewer 只依赖 `SyncResult`。
