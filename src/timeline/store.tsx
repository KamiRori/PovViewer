import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type MutableRefObject,
  type ReactNode
} from 'react'
import type { POVRuntime } from '../project/types'
import type { PlaybackRate } from './playbackMath'
import { clampMasterTime, computeTimelineRange, type TimelineRange } from './range'

/** UI clock refresh while playing. Sync math uses the precise ref every frame. */
const UI_TICK_MS = 50

/** Hold the master clock while videos land a hard seek, so they do not immediately drift. */
const SEEK_SETTLE_MS = 220
/** Longer settle after a manual resync so soft-sync does not immediately fight again. */
const RESYNC_SETTLE_MS = 450

export interface PlaybackState {
  masterTime: number
  playing: boolean
  playbackRate: PlaybackRate
  /** Bumped when every VideoSurface must seek to masterTime - offset. */
  seekGeneration: number
}

type PlaybackAction =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'toggle' }
  | { type: 'setRate'; rate: PlaybackRate }
  | { type: 'setTime'; time: number; range: TimelineRange; seek: boolean }
  | { type: 'tick'; nextTime: number; range: TimelineRange }
  | { type: 'requestSeek' }

const initialPlaybackState: PlaybackState = {
  masterTime: 0,
  playing: false,
  playbackRate: 1,
  seekGeneration: 0
}

function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  switch (action.type) {
    case 'play':
      if (state.playing) return state
      return { ...state, playing: true, seekGeneration: state.seekGeneration + 1 }
    case 'pause':
      return state.playing ? { ...state, playing: false } : state
    case 'toggle':
      return state.playing
        ? { ...state, playing: false }
        : { ...state, playing: true, seekGeneration: state.seekGeneration + 1 }
    case 'setRate':
      return state.playbackRate === action.rate ? state : { ...state, playbackRate: action.rate }
    case 'setTime': {
      const masterTime = clampMasterTime(action.time, action.range)
      if (masterTime === state.masterTime && !action.seek) return state
      return {
        ...state,
        masterTime,
        seekGeneration: action.seek ? state.seekGeneration + 1 : state.seekGeneration
      }
    }
    case 'tick': {
      const masterTime = clampMasterTime(action.nextTime, action.range)
      if (masterTime >= action.range.end) {
        if (state.masterTime === action.range.end && !state.playing) return state
        return { ...state, masterTime: action.range.end, playing: false }
      }
      if (masterTime === state.masterTime) return state
      return { ...state, masterTime }
    }
    case 'requestSeek':
      return { ...state, seekGeneration: state.seekGeneration + 1 }
    default:
      return state
  }
}

interface PlaybackApi {
  state: PlaybackState
  range: TimelineRange
  disabled: boolean
  play: () => void
  pause: () => void
  toggle: () => void
  setRate: (rate: PlaybackRate) => void
  seek: (time: number) => void
  nudge: (delta: number) => void
  scrub: (time: number) => void
  commitScrub: () => void
  /** Realign every POV to masterTime and clear soft-sync fighting. */
  resync: () => void
}

const PlaybackContext = createContext<PlaybackApi | null>(null)

/** Stable across ticks — VideoSurface reads this without re-rendering every UI update. */
const MasterTimeRefContext = createContext<MutableRefObject<number> | null>(null)

interface PlaybackProviderProps {
  povs: readonly POVRuntime[]
  children: ReactNode
}

export function PlaybackProvider({ povs, children }: PlaybackProviderProps) {
  const [state, dispatch] = useReducer(playbackReducer, initialPlaybackState)
  const range = useMemo(() => computeTimelineRange(povs), [povs])
  const disabled = range.duration <= 0
  const stateRef = useRef(state)
  const rangeRef = useRef(range)
  const masterTimeRef = useRef(state.masterTime)
  const scrubbingRef = useRef(false)
  const clockFrozenUntilRef = useRef(0)
  stateRef.current = state
  rangeRef.current = range

  const freezeClock = useCallback((ms = SEEK_SETTLE_MS) => {
    clockFrozenUntilRef.current = performance.now() + ms
  }, [])

  useEffect(() => {
    const clamped = clampMasterTime(masterTimeRef.current, range)
    if (clamped !== masterTimeRef.current) {
      masterTimeRef.current = clamped
      freezeClock()
      dispatch({ type: 'setTime', time: clamped, range, seek: true })
    }
  }, [range, freezeClock])

  useEffect(() => {
    if (!state.playing || disabled) return

    let frame = 0
    let lastStamp = 0
    let lastUiStamp = 0

    const tick = (stamp: number) => {
      if (lastStamp === 0) {
        lastStamp = stamp
        lastUiStamp = stamp
      } else {
        const frozen =
          scrubbingRef.current || performance.now() < clockFrozenUntilRef.current
        if (frozen) {
          // Drop the delta so resuming does not jump forward by the settle duration.
          lastStamp = stamp
        } else {
          const deltaSeconds = ((stamp - lastStamp) / 1000) * stateRef.current.playbackRate
          lastStamp = stamp
          const next = clampMasterTime(masterTimeRef.current + deltaSeconds, rangeRef.current)
          masterTimeRef.current = next

          if (next >= rangeRef.current.end) {
            dispatch({ type: 'tick', nextTime: next, range: rangeRef.current })
            return
          }

          if (stamp - lastUiStamp >= UI_TICK_MS) {
            lastUiStamp = stamp
            dispatch({ type: 'tick', nextTime: next, range: rangeRef.current })
          }
        }
      }

      frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [state.playing, disabled])

  const play = useCallback(() => {
    if (disabled) return
    freezeClock()
    dispatch({ type: 'play' })
  }, [disabled, freezeClock])

  const pause = useCallback(() => {
    dispatch({
      type: 'setTime',
      time: masterTimeRef.current,
      range: rangeRef.current,
      seek: false
    })
    dispatch({ type: 'pause' })
  }, [])

  const toggle = useCallback(() => {
    if (disabled) return
    if (stateRef.current.playing) {
      dispatch({
        type: 'setTime',
        time: masterTimeRef.current,
        range: rangeRef.current,
        seek: false
      })
      dispatch({ type: 'pause' })
      return
    }
    freezeClock()
    dispatch({ type: 'toggle' })
  }, [disabled, freezeClock])

  const setRate = useCallback(
    (rate: PlaybackRate) => {
      if (stateRef.current.playbackRate === rate) return
      // High-speed playback often drifts; realign once when the rate changes.
      freezeClock()
      dispatch({ type: 'setRate', rate })
      dispatch({ type: 'requestSeek' })
    },
    [freezeClock]
  )

  const seek = useCallback(
    (time: number) => {
      if (disabled) return
      const next = clampMasterTime(time, rangeRef.current)
      masterTimeRef.current = next
      freezeClock()
      dispatch({ type: 'setTime', time: next, range: rangeRef.current, seek: true })
    },
    [disabled, freezeClock]
  )

  const nudge = useCallback(
    (delta: number) => {
      if (disabled) return
      const next = clampMasterTime(masterTimeRef.current + delta, rangeRef.current)
      masterTimeRef.current = next
      freezeClock()
      dispatch({ type: 'setTime', time: next, range: rangeRef.current, seek: true })
    },
    [disabled, freezeClock]
  )

  const scrub = useCallback(
    (time: number) => {
      if (disabled) return
      scrubbingRef.current = true
      const next = clampMasterTime(time, rangeRef.current)
      masterTimeRef.current = next
      dispatch({ type: 'setTime', time: next, range: rangeRef.current, seek: false })
    },
    [disabled]
  )

  const commitScrub = useCallback(() => {
    if (!scrubbingRef.current) return
    scrubbingRef.current = false
    freezeClock()
    dispatch({ type: 'requestSeek' })
  }, [freezeClock])

  const resync = useCallback(() => {
    if (disabled) return
    scrubbingRef.current = false
    const time = clampMasterTime(masterTimeRef.current, rangeRef.current)
    masterTimeRef.current = time
    freezeClock(RESYNC_SETTLE_MS)
    dispatch({ type: 'setTime', time, range: rangeRef.current, seek: false })
    dispatch({ type: 'requestSeek' })
  }, [disabled, freezeClock])

  const api = useMemo<PlaybackApi>(
    () => ({
      state,
      range,
      disabled,
      play,
      pause,
      toggle,
      setRate,
      seek,
      nudge,
      scrub,
      commitScrub,
      resync
    }),
    [state, range, disabled, play, pause, toggle, setRate, seek, nudge, scrub, commitScrub, resync]
  )

  return (
    <MasterTimeRefContext.Provider value={masterTimeRef}>
      <PlaybackContext.Provider value={api}>{children}</PlaybackContext.Provider>
    </MasterTimeRefContext.Provider>
  )
}

export function usePlayback(): PlaybackApi {
  const api = useContext(PlaybackContext)
  if (!api) throw new Error('usePlayback must be used within PlaybackProvider')
  return api
}

export function useMasterTimeRef(): MutableRefObject<number> {
  const ref = useContext(MasterTimeRefContext)
  if (!ref) throw new Error('useMasterTimeRef must be used within PlaybackProvider')
  return ref
}
