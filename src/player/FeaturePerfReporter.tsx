import { useEffect } from 'react'
import { useArmedCount } from './playbackArm'
import { useLiveDecodeStats } from './decodeBudget'
import { drainPerfRates } from './perfCounters'
import { usePreviewQuality } from './previewQuality'

/** Pushes feature activity rates to the main process for the GPU debug window. */
export function FeaturePerfReporter({ playing }: { playing: boolean }): null {
  const { settings } = usePreviewQuality()
  const armedCount = useArmedCount()
  const liveStats = useLiveDecodeStats()

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
            ? '采样 seek 通常比连续播放更吃 GPU；请改用高/中/低连续预设。'
            : `连续播放 · 解码 ${liveStats.live}/${liveStats.max} · 校正松紧 ${settings.hardSeekSlack.toFixed(1)}x · softSync=${settings.softSync ? 'on' : 'off'}`
      })
    }, 500)
    return () => window.clearInterval(id)
  }, [
    armedCount,
    liveStats.live,
    liveStats.max,
    playing,
    settings.hardSeekSlack,
    settings.maxFps,
    settings.playbackMode,
    settings.preset,
    settings.softSync
  ])

  return null
}
