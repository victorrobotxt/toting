import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import en from '../translations/en.json';
import bg from '../translations/bg.json';

type Lang = 'en' | 'bg';
const dict: Record<Lang, Record<string,string>> = { en, bg };

const I18nContext = createContext<{ t:(k:string)=>string; lang:Lang; setLang:(l:Lang)=>void}>({ t:(k)=>k, lang:'en', setLang:()=>{} });

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>('en');
  useEffect(() => {
    const l = localStorage.getItem('lang') as Lang | null;
    if (l) setLang(l);
  }, []);
  const change = (l:Lang) => { setLang(l); localStorage.setItem('lang', l); };
  const t = (k:string) => dict[lang][k] || k;
  return <I18nContext.Provider value={{ t, lang, setLang: change }}>{children}</I18nContext.Provider>;
}

export function useI18n() { return useContext(I18nContext); }
