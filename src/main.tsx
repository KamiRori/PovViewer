import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { PlaybackArmProvider } from './player/playbackArm'
import { PlayerSettingsProviders } from './player/PlayerSettingsProviders'

import { ProjectProvider, useProject } from './project/store'
import { PlaybackProvider } from './timeline/store'
import './styles.css'

function PlaybackBridge({ children }: { children: ReactNode }) {
  const { state } = useProject()
  return <PlaybackProvider povs={state.povs}>{children}</PlaybackProvider>
}

const root = document.getElementById('root')
if (!root) throw new Error('root element is missing')

createRoot(root).render(
  <StrictMode>
    <ProjectProvider>
      <PlaybackBridge>
        <PlaybackArmProvider>
          <PlayerSettingsProviders>
            <App />
          </PlayerSettingsProviders>
        </PlaybackArmProvider>
      </PlaybackBridge>
    </ProjectProvider>
  </StrictMode>
)
