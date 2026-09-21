import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode
} from 'react'

export type PreviewQualityPreset = 'high' | 'medium' | 'low'

/** continuous = HTML5 play(); sampled = paused seek-to-clock (far less GPU). */
export type PreviewPlaybackMode = 'continuous' | 'sampled'

export interface PreviewQualitySettings {
  preset: PreviewQualityPreset
  playbackMode: PreviewPlaybackMode
  /** Sample refresh cap when playbackMode is sampled. */
  maxFps: number
}

export const PREVIEW_QUALITY_PRESETS: Record<PreviewQualityPreset, PreviewQualitySettings> = {
  high: {
    preset: 'high',
    playbackMode: 'continuous',
    maxFps: 60
  },
  medium: {
    preset: 'medium',
    playbackMode: 'sampled',
    maxFps: 10
  },
  low: {
    preset: 'low',
    playbackMode: 'sampled',
    maxFps: 5
  }
}

interface PreviewQualityApi {
  settings: PreviewQualitySettings
  setPreset: (preset: PreviewQualityPreset) => void
  setMaxFps: (value: number) => void
}

const PreviewQualityContext = createContext<PreviewQualityApi | null>(null)

export function PreviewQualityProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<PreviewQualitySettings>(PREVIEW_QUALITY_PRESETS.high)

  const setPreset = useCallback((preset: PreviewQualityPreset) => {
    setSettings(PREVIEW_QUALITY_PRESETS[preset])
  }, [])

  const setMaxFps = useCallback((value: number) => {
    const maxFps = Math.max(3, Math.min(30, Math.round(value)))
    setSettings((current) => ({
      ...current,
      preset: current.preset === 'high' ? 'medium' : current.preset,
      playbackMode: 'sampled',
      maxFps
    }))
  }, [])

  const api = useMemo(
    () => ({ settings, setPreset, setMaxFps }),
    [settings, setPreset, setMaxFps]
  )

  return <PreviewQualityContext.Provider value={api}>{children}</PreviewQualityContext.Provider>
}

export function usePreviewQuality(): PreviewQualityApi {
  const api = useContext(PreviewQualityContext)
  if (!api) throw new Error('usePreviewQuality must be used within PreviewQualityProvider')
  return api
}
