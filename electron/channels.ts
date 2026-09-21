export const IpcChannel = {
  selectVideoFiles: 'dialog:selectVideoFiles',
  selectJsonFile: 'dialog:selectJsonFile',
  registerPaths: 'media:registerPaths',
  toMediaUrl: 'media:toUrl',
  probeMediaDurations: 'media:probeDurations',
  readTextFile: 'fs:readTextFile',
  openGpuDebug: 'debug:openGpuWindow',
  reportFeaturePerf: 'debug:reportFeaturePerf',
  getDebugSnapshot: 'debug:getSnapshot'
} as const
