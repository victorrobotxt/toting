// packages/frontend/src/lib/I18nProvider.tsx
import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useRouter } from 'next/router';
import en from '../translations/en.json';
import bg from '../translations/bg.json';

const translations: Record<string, any> = { en, bg };

interface I18nContextType {
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

export const I18nProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { locale } = useRouter();
  const currentLocale = locale || 'en';

  const t = useMemo(() => (key: string): string => {
    // Simple key lookup, can be expanded for nested objects
    return translations[currentLocale]?.[key] || key;
  }, [currentLocale]);

  return <I18nContext.Provider value={{ t }}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (context === undefined) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
