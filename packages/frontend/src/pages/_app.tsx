import type { AppProps } from 'next/app';
import { ThemeProvider } from 'next-themes';
import '../styles/globals.css';
// Use correct relative paths to the new lib files
import { AuthProvider } from '../lib/AuthProvider';
import { I18nProvider } from '../lib/I18nProvider';
import { ToastProvider } from '../lib/ToastProvider';
import DesignTokens from '../components/DesignTokens';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <DesignTokens />
      <I18nProvider>
        <ToastProvider>
          <AuthProvider>
            <Component {...pageProps} />
          </AuthProvider>
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
