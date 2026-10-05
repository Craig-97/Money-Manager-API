// What a person chose for the app's theme; SYSTEM follows the device's light or dark setting
export const ThemePreference = {
  DARK: 'DARK',
  LIGHT: 'LIGHT',
  SYSTEM: 'SYSTEM'
} as const;

export type ThemePreference = (typeof ThemePreference)[keyof typeof ThemePreference];
