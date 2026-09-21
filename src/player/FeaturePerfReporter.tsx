import { useEffect } from 'react'
import { useArmedCount } from './playbackArm'
import { drainPerfRates } from './perfCounters'
import { usePreviewQuality } from './previewQuality'

/** Pushes feature activity rates to the main process for the GPU debug window. */
export function FeaturePerfReporter({ playing }: { playing: boolean }): null {
  const { settings } = usePreviewQuality()
  const armedCount = useArmedCount()

  useEffect(() => {
    const id = window.setInterval(() => {
      const rates = drainPerfRates()
      window.povApi.reportFeaturePerf({
        ts: Date.now(),
        playbackMode: settings.playbackMode,
        preset: settings.preset,
        maxFps: settings.maxFps,
        playing,
        armedCount,
        sampleSeeksPerSec: rates.sampleSeeksPerSec,
        continuousPlayCallsPerSec: rates.continuousPlayCallsPerSec,
        hardSeeksPerSec: rates.hardSeeksPerSec,
        note:
          settings.playbackMode === 'sampled'
            ? '采样模式：关注 sampleSeeks/s 与参与路数；连续硬解应接近 0。'
            : '连续模式：关注 continuousPlay 与硬 seek；路数上升通常会推高 GPU 进程负载。'
      })
    }, 500)
    return () => window.clearInterval(id)
  }, [armedCount, playing, settings.maxFps, settings.playbackMode, settings.preset])

  return null
}
