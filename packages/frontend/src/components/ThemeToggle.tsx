import { Switch } from '@headlessui/react';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  const enabled = resolvedTheme === 'dark';

  return (
    <Switch
      checked={enabled}
      onChange={() => setTheme(enabled ? 'light' : 'dark')}
      className={`switch ${enabled ? 'on' : 'off'}`}
    >
      <span />
    </Switch>
  );
}
