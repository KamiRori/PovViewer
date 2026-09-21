import { useEffect, useState } from 'react'
import type { DebugSnapshot } from '../env'

export function DebugApp() {
  const [snapshot, setSnapshot] = useState<DebugSnapshot | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void window.povApi
      .getDebugSnapshot()
      .then((next) => {
        if (!cancelled) setSnapshot(next)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })

    const unsubscribe = window.povApi.onDebugSnapshot((next) => {
      setSnapshot(next)
      setError(null)
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [])

  const feature = snapshot?.feature ?? null
  const gpuProcess = snapshot?.processes.find((row) => row.type === 'GPU') ?? null

  return (
    <div className="debug-app">
      <header>
        <h1>GPU / 功能占用调试</h1>
        <p className="meta">每 500ms 刷新 · 独立窗口不影响主界面布局</p>
      </header>

      {error ? <p className="error">{error}</p> : null}
      {snapshot ? <p className="limitation">{snapshot.limitation}</p> : <p>正在采集…</p>}

      <section>
        <h2>功能活动（归因代理）</h2>
        {feature ? (
          <div className="cards">
            <Stat label="画质预设" value={feature.preset} />
            <Stat label="播放模式" value={feature.playbackMode} />
            <Stat label="参与路数" value={String(feature.armedCount)} />
            <Stat label="主时钟播放" value={feature.playing ? '是' : '否'} />
            <Stat label="采样 seek/s" value={feature.sampleSeeksPerSec.toFixed(2)} accent />
            <Stat label="连续 play/s" value={feature.continuousPlayCallsPerSec.toFixed(2)} accent />
            <Stat label="硬 seek/s" value={feature.hardSeeksPerSec.toFixed(2)} />
            <Stat label="采样上限" value={`${feature.maxFps} fps`} />
          </div>
        ) : (
          <p className="empty">主窗口尚未上报（请保持主窗口打开并播放）。</p>
        )}
        {feature ? <p className="hint">{feature.note}</p> : null}
      </section>

      <section>
        <h2>GPU 进程（Electron）</h2>
        {gpuProcess ? (
          <div className="cards">
            <Stat label="GPU PID" value={String(gpuProcess.pid)} />
            <Stat label="GPU 进程 CPU%" value={`${gpuProcess.cpuPercent}%`} accent />
            <Stat label="GPU 进程内存" value={`${gpuProcess.memoryMb} MB`} />
          </div>
        ) : (
          <p className="empty">未找到 type=GPU 的进程行（部分平台指标不全）。</p>
        )}
        <p className="hint">
          这不是任务管理器里的「GPU 引擎 %」。对比实验时：只开 1 路参与 vs 3 路参与，观察采样
          seek/s 与 GPU 进程 CPU/内存是否同向变化。
        </p>
      </section>

      <section>
        <h2>适配器</h2>
        <ul className="list">
          {(snapshot?.gpuDevices ?? []).map((device) => (
            <li key={device}>{device}</li>
          ))}
        </ul>
      </section>

      <section>
        <h2>全部进程</h2>
        <table>
          <thead>
            <tr>
              <th>类型</th>
              <th>名称</th>
              <th>PID</th>
              <th>CPU%</th>
              <th>内存 MB</th>
            </tr>
          </thead>
          <tbody>
            {(snapshot?.processes ?? []).map((row) => (
              <tr key={`${row.pid}-${row.type}`} className={row.type === 'GPU' ? 'is-gpu' : undefined}>
                <td>{row.type}</td>
                <td>{row.name}</td>
                <td>{row.pid}</td>
                <td>{row.cpuPercent}</td>
                <td>{row.memoryMb}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>GPU 功能状态</h2>
        <table>
          <thead>
            <tr>
              <th>特性</th>
              <th>状态</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(snapshot?.gpuFeatureStatus ?? {}).map(([key, value]) => (
              <tr key={key}>
                <td>{key}</td>
                <td>{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  accent
}: {
  label: string
  value: string
  accent?: boolean
}) {
  return (
    <div className={`stat${accent ? ' accent' : ''}`}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  )
}
