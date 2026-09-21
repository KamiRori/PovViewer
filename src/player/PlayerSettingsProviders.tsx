import type { ReactNode } from 'react'
import { PreviewQualityProvider } from './previewQuality'
import { ViewUiProvider } from './viewUi'

export function PlayerSettingsProviders({ children }: { children: ReactNode }) {
  return (
    <PreviewQualityProvider>
      <ViewUiProvider>{children}</ViewUiProvider>
    </PreviewQualityProvider>
  )
}
