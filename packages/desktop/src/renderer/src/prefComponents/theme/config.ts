export interface ThemeDescriptor {
  name: string
}

export const themes: ReadonlyArray<ThemeDescriptor> = [
  { name: 'light' },
  { name: 'dark' },
  { name: 'paper' }
]

// getAutoSwitchThemeOptions removed - no longer needed
// We now use a boolean toggle for followSystemTheme instead of a dropdown
