import { useTheme } from 'next-themes';
import { useEffect } from 'react';
import tokens from '../styles/tokens.json';

type Theme = keyof typeof tokens;

export default function DesignTokens() {
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const theme: Theme = (resolvedTheme as Theme) || 'light';
    const sets = tokens[theme];

    Object.entries(sets).forEach(([category, values]) => {
      Object.entries(values as Record<string, string>).forEach(([key, value]) => {
        document.documentElement.style.setProperty(`--${category}-${key}`, value);
      });
    });
  }, [resolvedTheme]);

  return null;
}
