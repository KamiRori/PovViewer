/** Interval for writing an opened project.json when content has changed. */
export const PROJECT_AUTOSAVE_INTERVAL_MS = 30_000

/** True when the project has a path on disk and serialized content differs from last write. */
export function projectNeedsAutoSave(
  projectPath: string | null,
  currentJson: string,
  lastSavedJson: string | null
): projectPath is string {
  return projectPath != null && projectPath !== '' && currentJson !== lastSavedJson
}
