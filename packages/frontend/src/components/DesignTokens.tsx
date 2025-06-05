import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import tokens from '../styles/tokens.json';

type Theme = keyof typeof tokens;

export default function DesignTokens() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const theme: Theme = (resolvedTheme as Theme) || 'light';
    const set = tokens[theme];
    for (const [key, value] of Object.entries(set)) {
      document.documentElement.style.setProperty(`--${key}`, value);
    }
  }, [resolvedTheme]);

  return null;
}
