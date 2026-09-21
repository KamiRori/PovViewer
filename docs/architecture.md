# 技术架构

本文件说明 Minecraft POV Viewer 怎么拆，以及哪些决定是为了让 Phase 1 的骨架能接上后面的同步和性能工作。产品规则以 `spec.md` 为准。Phase 1 只落地本文第 8 节标出的部分。

## 1. 进程划分

```text
┌──────────────────────────────────────────────┐
│ Electron 主进程                               │
│ 窗口、对话框、文件系统、自定义媒体协议          │
│ 以后：FFmpeg 代理调度（Phase 6）               │
└────────────────────┬─────────────────────────┘
                     │ contextBridge（白名单 IPC）
┌────────────────────▼─────────────────────────┐
│ Preload                                       │
└────────────────────┬─────────────────────────┘
                     │
┌────────────────────▼─────────────────────────┐
│ Renderer：React                                               │
│  ProjectStore          MasterClock（Phase 2 起）              │
│  POV 网格 / Focus      VideoSurface 校正（Phase 2 起）        │
│  sync.json 应用        project.json 读写（Phase 5）           │
└───────────────────────────────────────────────────────────────┘
```

安全基线从第一天启用，后面不放宽：

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- 渲染进程不直接使用 Node.js API
- 不关闭 `webSecurity` 来迁就 `file://`

本地视频通过主进程注册的自定义协议读出，例如 `pov://media/?path=<编码后的绝对路径>`。协议处理函数只接受“本次会话已导入或项目文件中列出”的路径，拒绝任意路径读取。

## 2. 目录

与规格建议一致，并用 electron-vite 组织主进程和渲染进程：

```text
MinecraftPOVViewer/
├── spec.md
├── docs/
│   ├── architecture.md
│   └── phase-1-tasks.md
├── electron/
│   ├── main.ts              窗口与 IPC
│   ├── preload.ts           contextBridge
│   └── mediaProtocol.ts     本地文件只读协议
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/          工具栏、网格、卡片
│   ├── player/              VideoSurface 与校正策略
│   ├── timeline/            Master Clock、时间轴控件
│   ├── sync/                SyncResult、解析与按名应用
│   ├── project/             POV 模型、store、导入
│   └── utils/               文件名、时间格式
├── index.html
├── package.json
├── electron.vite.config.ts
└── README.md                实现阶段再写，本次不创建
```

Phase 1 会创建 `player/`、`timeline/`、`sync/` 里的类型与空模块边界，避免以后把逻辑写进组件。这些目录在 Phase 1 不提供可操作的播放、seek 或同步导入。

## 3. 模块边界

| 模块 | 职责 | 不允许做的事 |
| --- | --- | --- |
| `project/` | POV 列表、导入、重命名、enabled、路径失效标记 | 不计算 offset，不操作 `<video>` |
| `sync/` | 解析 `sync.json`，产出 `SyncResult[]`，按 `playerName` 写回 offset | 不读像素、不跑音频算法 |
| `timeline/` | `masterTime`、播放状态、倍速、时间轴范围、rAF 时钟 | 不直接摸 DOM video |
| `player/` | 把 `expectedTime` 落到某个 `<video>`，执行 0.05 秒校正和 seek 合并 | 不保存第二套时间轴 |
| `components/` | 布局与输入 | 不内联同步公式 |

数据方向：

```text
用户输入
  → ProjectStore / MasterClock
  → 派生 expectedTime = masterTime - offset
  → VideoSurface 决定播、停、占位或校正
```

组件禁止写 `video.currentTime = <用户拖动的某个独立值>`。唯一合法赋值来源是 `masterTime - offset`。

## 4. 状态

Phase 1 用 React `useReducer` + Context，不引入状态库。

两个独立状态，避免把播放进度写进项目文件：

```typescript
interface ProjectState {
  povs: POVRuntime[];
  selectedId: string | null;
  columns: 2 | 3 | 4 | 5 | 6;   // 默认 4，仅界面状态
  query: string;                // Phase 4 才接入搜索框
}

interface PlaybackState {
  masterTime: number;
  playing: boolean;
  playbackRate: 0.5 | 1 | 1.5 | 2 | 4;
}
```

`POVRuntime` 见规格第 5.1 节。`missing` 与 `metadataReady` 是运行时字段。

导入一个文件时的初始值：

```text
id            = crypto.randomUUID()
playerName    = 文件名去掉扩展名，重名则追加 (2)、(3)
filePath      = 绝对路径
duration      = 0
metadataReady = false
offset        = 0
enabled       = true
muted         = true
missing       = false
```

元数据在 `<video>` 的 `loadedmetadata` 里写回 `duration`，并把 `metadataReady` 设为 true。未就绪时不做 `ENDED` 判断。

## 5. 媒体与兼容

```text
源文件（用户目录，只读）
    │
    ├─ Chromium 可直接播 ──→ VideoSurface 使用 pov:// URL
    │
    └─ 不能直接播（常见于 MKV、HEVC）
           │
           Phase 1–5：卡片占位 “无法直接播放”
           Phase 6：FFmpeg 写入 userData/proxies/，网格改播代理
```

代理缓存键：文件绝对路径 + 大小 + mtime + 代理配置（网格预览或兼容转封装）。缓存目录是 `app.getPath('userData')/proxies`。删除代理不能影响源文件。

Phase 6 的网格预览规格：约 320×180、15fps、无音频或音频被丢弃。Focus 优先播原片；原片不能播时才退回兼容代理。

网格里的 `<video>` 从 Phase 1 起遵守：

- `muted`
- `playsInline`
- `preload="metadata"`
- 不设置 `autoplay`
- 不在导入时调用 `play()`

这样 50 个文件的验收是“能列出并显示首帧或占位”，不是“50 路同时硬解”。

## 6. 时钟与校正（Phase 2 实现，此处固定设计）

```text
rAF tick
  masterTime += deltaSeconds * playbackRate
  clamp 到 [timelineStart, timelineEnd]

每个 VideoSurface
  expected = masterTime - offset
  若 expected 越界 → 暂停并显示 NOT STARTED / ENDED
  若正在 seek 合并窗口内 → 跳过
  若刚开始播放，或 abs(currentTime - expected) > 0.05
      → currentTime = expected
```

时间轴拖动把 seek 收成一帧：拖动中只更新 `masterTime` 和数字时钟；`requestAnimationFrame` 里对“当前已挂载且处于有效区间”的 surface 做一次校正。未挂载的卡片不 seek。

`setInterval` 不作为时钟。个别 UI 节流如果使用定时器，不得用它推进 `masterTime`。

## 7. 声音策略

`player/` 提供一个纯函数，输入为模式、聚焦 id、用户点名的 solo id、各 POV 的 `muted`，输出每个 id 是否静音。

规则：

- Grid 默认全静音。
- Grid 里用户打开某一路声音时，该路是唯一的 solo，其他路静音，并把它们的 `muted` 设为 true。
- Focus 时只有聚焦 POV 不静音。
- 不存在“多路同时 volume > 0”。

Phase 1 的卡片视频元素始终 muted，solo 按钮留到 Phase 4。

## 8. IPC（主进程白名单）

Phase 1 只实现前两项。其余在对应 Phase 再挂上，避免渲染进程以后自己碰文件系统。

| API | Phase | 作用 |
| --- | --- | --- |
| `selectVideoFiles()` | 1 | 多选 mp4/mkv/mov/webm，返回绝对路径 |
| `toMediaUrl(filePath)` | 1 | 登记路径并返回 `pov://` URL |
| `selectJsonFile()` | 3 和 5 | 打开 sync.json 或 project.json |
| `saveJsonFile(defaultName)` | 5 | 另存项目 |
| `readTextFile(filePath)` | 3 和 5 | 读 JSON 文本 |
| `writeTextFile(filePath, text)` | 5 | 写项目 |
| `pathExists(filePath)` | 5 | 判断源文件是否还在 |
| `selectReplacementFile()` | 5 | Locate File |

路径一律由主进程规范化。渲染进程只保存字符串和协议 URL。

## 9. 后续同步算法怎么接

Viewer 的入口停在：

```typescript
function applySync(povs: POV[], results: SyncResult[]): ApplySyncReport
```

返回值包含已更新的列表，以及未匹配的 `playerName`。Phase 3 的 Import Sync 调用它。将来的音频互相关、指纹或谱图流水线只负责生成 `SyncResult[]` 或 `sync.json`，不改网格、时钟和 VideoSurface。

预定流水线（不在第一版实现）：

```text
POV 文件 → 抽取音频 → 特征 → 互相关 → offset → SyncResult[] → applySync
```

优先手段是 FFmpeg、FFT、频谱、互相关、音频指纹。不使用大模型，也不把视频传到进程外的服务。

## 10. 性能预算

验证规模：10、20、50、100 个 POV。承诺线是 50 个 POV 能打开、拖动时间轴、切换 Focus。

手段按阶段叠加，前一阶段不预支后一阶段的复杂度：

| 阶段 | 手段 |
| --- | --- |
| Phase 1 | 导入不解码播放；`preload=metadata`；失败文件只占位 |
| Phase 2–3 | 校正阈值；seek 合并；越界 POV 不 seek |
| Phase 4 | Focus 提高一路清晰度；侧边栏保持小尺寸 |
| Phase 6 | 网格代理；视口外不挂 `<video>`；限制同时解码路数 |

视口外卸载和代理都不得改变 `expectedTime` 的计算。重新进入视口时，按当前 `masterTime - offset` 做一次校正，而不是从 0 播放。

## 11. 错误呈现

| 情况 | 界面 |
| --- | --- |
| 元数据读取失败 | 卡片写明无法读取，保留在列表中，可移除 |
| 容器或编码不能直接播 | 占位说明，Phase 6 前不偷偷转码 |
| `sync.json` 版本不是 1 或结构不符 | 不改现有 offset，提示文件无效 |
| 同步名匹配不上 | 列出未匹配名字，已匹配的仍然写入 |
| 项目路径不存在 | `Missing File` + 文件名 + Locate File |
| 时间轴无媒体 | 控件禁用 |

## 12. 构建

- 开发：electron-vite 启动主进程和渲染进程。
- 生产：electron-builder 打出 Windows 安装包或免安装 exe，产品名 `MinecraftPOVViewer`。
- 用户机器不需要 Node.js、不需要系统里预先安装 FFmpeg。若 Phase 6 需要 FFmpeg，把二进制打进应用，而不是调用用户 PATH 上的不确定版本。

Phase 1 不配置安装包，只要求 `dev` 脚本能打开窗口。打包放到 Phase 1 之后、功能冻结前，避免每个阶段都花时间在安装器上。建议在 Phase 5 结束后做第一次可分发构建，Phase 6 再把 FFmpeg 打进去。

## 13. 测试策略

纯函数用单元测试，不启动 Electron：

- 文件名 → `playerName`，含重名
- `videoTime = masterTime - offset` 与 NOT STARTED / ENDED
- 时间轴范围
- `applySync` 的匹配与未匹配
- 静音决策

这些测试在对应函数出现的那个 Phase 一起加上。Phase 1 至少覆盖文件名规则。

界面验收是手动的，按 `spec.md` 第 12 节和各 Phase 任务清单执行。仓库里没有现成的 50 路 1080p 样本时，Phase 1 用开发者本机的若干 MP4 做功能验证，并在清单里记录“50 路压力需在有样本时补测”。不能用伪造的通过结果代替这次补测。
