import { useEffect } from 'react'
import { useArmedCount } from './playbackArm'
import { drainPerfRates } from './perfCounters'
import { usePreviewQuality } from './previewQuality'

/** Pushes feature activity rates to the main process for the GPU debug window. */
export function FeaturePerfReporter({ playing }: { playing: boolean }): null {
  const { settings } = usePreviewQuality()
  const armedCount = useArmedCount()

  useEffect(() => {
    const payload = () => {
      const rates = drainPerfRates()
      return {
        ts: Date.now(),
        playbackMode: settings.playbackMode,
        preset: settings.preset,
        maxFps: settings.maxFps,
        playing,
        armedCount,
        sampleSeeksPerSec: rates.sampleSeeksPerSec,
        continuousPlayCallsPerSec: rates.continuousPlayCallsPerSec,
        hardSeeksPerSec: rates.hardSeeksPerSec,
        note: playing
          ? settings.playbackMode === 'sampled'
            ? '采样模式：关注 sampleSeeks/s 与参与路数；连续硬解应接近 0。'
            : '连续模式：关注 continuousPlay 与硬 seek；路数上升通常会推高 GPU 进程负载。'
          : '空闲：已停止周期上报，解码器应已卸载。'
      }
    }

    // Idle: one snapshot then stop — a 500ms IPC loop alone keeps the process awake.
    if (!playing) {
      window.povApi.reportFeaturePerf(payload())
      return
    }

    const id = window.setInterval(() => {
      window.povApi.reportFeaturePerf(payload())
    }, 500)
    return () => window.clearInterval(id)
  }, [armedCount, playing, settings.maxFps, settings.playbackMode, settings.preset])

  return null
}
