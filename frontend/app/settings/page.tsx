"use client";

import { useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { ChevronLeft, Globe, Volume2, Monitor, Bell, User, Shield, Check } from "lucide-react";

export default function SettingsPage() {
  const { t, locale, setLocale } = useI18n();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [theme, setTheme] = useState<'dark' | 'light' | 'system'>('dark');

  const Toggle = ({ enabled, onChange }: { enabled: boolean; onChange: (val: boolean) => void }) => (
    <button
      onClick={() => onChange(!enabled)}
      className={`relative w-14 h-7 rounded-full transition-all duration-300 ${enabled ? 'bg-white' : 'bg-white/10'}`}
    >
      <div className={`absolute top-1 w-5 h-5 rounded-full transition-all duration-300 ${enabled ? 'left-8 bg-black' : 'left-1 bg-white/40'}`} />
    </button>
  );

  return (
    <div className="min-h-screen bg-black text-white font-serif">
      {/* Header */}
      <header className="border-b border-white/10">
        <div className="max-w-2xl mx-auto px-6 py-6 flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-white/5 transition-colors rounded">
            <ChevronLeft size={24} className="text-white/60" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">{t.settings.title}</h1>
            <p className="text-xs text-white/40">{t.settings.version}</p>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        
        {/* Language */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 text-white/40">
            <Globe size={18} />
            <span className="text-xs uppercase tracking-widest font-bold">{t.settings.language.title}</span>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => setLocale('th')}
              className={`flex-1 py-4 text-center font-bold uppercase tracking-wider transition-all border
                ${locale === 'th' 
                  ? 'bg-white text-black border-white' 
                  : 'bg-white/5 text-white/60 border-white/10 hover:border-white/30'}`}
            >
              <div className="text-2xl mb-1">🇹🇭</div>
              <div className="text-sm">ไทย</div>
            </button>
            <button
              onClick={() => setLocale('en')}
              className={`flex-1 py-4 text-center font-bold uppercase tracking-wider transition-all border
                ${locale === 'en' 
                  ? 'bg-white text-black border-white' 
                  : 'bg-white/5 text-white/60 border-white/10 hover:border-white/30'}`}
            >
              <div className="text-2xl mb-1">🇺🇸</div>
              <div className="text-sm">English</div>
            </button>
          </div>
        </section>

        <div className="h-px bg-white/5" />

        {/* Theme */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 text-white/40">
            <Monitor size={18} />
            <span className="text-xs uppercase tracking-widest font-bold">{t.settings.display.title}</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {(['dark', 'light', 'system'] as const).map((themeOption) => (
              <button
                key={themeOption}
                onClick={() => setTheme(themeOption)}
                className={`py-3 text-center text-sm font-bold uppercase tracking-wider transition-all border
                  ${theme === themeOption 
                    ? 'bg-white text-black border-white' 
                    : 'bg-white/5 text-white/60 border-white/10 hover:border-white/30'}`}
              >
                {t.settings.display[themeOption]}
              </button>
            ))}
          </div>
        </section>

        <div className="h-px bg-white/5" />

        {/* Audio */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 text-white/40">
            <Volume2 size={18} />
            <span className="text-xs uppercase tracking-widest font-bold">{t.settings.audio.title}</span>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5">
              <div>
                <div className="text-sm font-medium">{t.settings.audio.effects}</div>
                <div className="text-xs text-white/40">{t.settings.audio.effectsDesc}</div>
              </div>
              <Toggle enabled={soundEnabled} onChange={setSoundEnabled} />
            </div>
            <div className="flex items-center justify-between p-4 bg-white/[0.02] border border-white/5">
              <div>
                <div className="text-sm font-medium">{t.settings.audio.notifications}</div>
                <div className="text-xs text-white/40">{t.settings.audio.notificationsDesc}</div>
              </div>
              <Toggle enabled={notificationsEnabled} onChange={setNotificationsEnabled} />
            </div>
          </div>
        </section>

        <div className="h-px bg-white/5" />

        {/* Account */}
        <section className="space-y-4">
          <div className="flex items-center gap-3 text-white/40">
            <User size={18} />
            <span className="text-xs uppercase tracking-widest font-bold">{t.settings.account.title}</span>
          </div>
          <div className="space-y-3">
            <button className="w-full flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors text-left">
              <div>
                <div className="text-sm font-medium">{t.settings.account.profile}</div>
                <div className="text-xs text-white/40">{t.settings.account.profileDesc}</div>
              </div>
              <ChevronLeft size={18} className="rotate-180 text-white/30" />
            </button>
            <button className="w-full flex items-center justify-between p-4 bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] transition-colors text-left">
              <div>
                <div className="text-sm font-medium">{t.settings.account.privacy}</div>
                <div className="text-xs text-white/40">{t.settings.account.privacyDesc}</div>
              </div>
              <ChevronLeft size={18} className="rotate-180 text-white/30" />
            </button>
          </div>
        </section>

      </main>
    </div>
  );
}
