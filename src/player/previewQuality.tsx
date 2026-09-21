import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'

export type PreviewQualityPreset = 'high' | 'medium' | 'low'

/**
 * continuous = native video.play() (HW decode + overlay, usually cheaper).
 * sampled = paused + frequent currentTime seeks (often MORE expensive on GPU).
 */
export type PreviewPlaybackMode = 'continuous' | 'sampled'

export interface PreviewQualitySettings {
  preset: PreviewQualityPreset
  playbackMode: PreviewPlaybackMode
  /** Only used when playbackMode is sampled (advanced / not recommended). */
  maxFps: number
  /** Multiplier on hard-seek threshold; higher = fewer seeks, smoother under load. */
  hardSeekSlack: number
  /** Soft rate nudges; can cause churn when many videos fight the clock. */
  softSync: boolean
}

/**
 * Prefer continuous for all presets. Frequent seek-sampling was measured to push GPU
 * near 100% while continuous sat around ~30% on the same clips.
 */
export const PREVIEW_QUALITY_PRESETS: Record<PreviewQualityPreset, PreviewQualitySettings> = {
  high: {
    preset: 'high',
    playbackMode: 'continuous',
    maxFps: 60,
    hardSeekSlack: 1,
    softSync: true
  },
  medium: {
    preset: 'medium',
    playbackMode: 'continuous',
    maxFps: 30,
    hardSeekSlack: 1.6,
    softSync: true
  },
  low: {
    preset: 'low',
    playbackMode: 'continuous',
    maxFps: 15,
    hardSeekSlack: 2.4,
    softSync: false
  }
}

interface PreviewQualityApi {
  settings: PreviewQualitySettings
  setPreset: (preset: PreviewQualityPreset) => void
}

const PreviewQualityContext = createContext<PreviewQualityApi | null>(null)

export function PreviewQualityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PreviewQualitySettings>(PREVIEW_QUALITY_PRESETS.high)

  const setPreset = useCallback((preset: PreviewQualityPreset) => {
    setSettings(PREVIEW_QUALITY_PRESETS[preset])
  }, [])

  const api = useMemo(() => ({ settings, setPreset }), [settings, setPreset])

  return <PreviewQualityContext.Provider value={api}>{children}</PreviewQualityContext.Provider>
}

export function usePreviewQuality(): PreviewQualityApi {
  const api = useContext(PreviewQualityContext)
  if (!api) throw new Error('usePreviewQuality must be used within PreviewQualityProvider')
  return api
}
