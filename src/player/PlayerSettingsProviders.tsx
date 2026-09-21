import type { ReactNode } from 'react'
import { PreviewQualityProvider } from './previewQuality'

export function PlayerSettingsProviders({ children }: { children: ReactNode }) {
  return <PreviewQualityProvider>{children}</PreviewQualityProvider>
}
