"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n-context";
import { PlusCircle, Users, Sword, Settings } from "lucide-react";

export default function Home() {
  const { t } = useI18n();
  const [showLogin, setShowLogin] = useState(false);
  const [showRegister, setShowRegister] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setIsLoaded(true);
  }, []);

  const MenuButton = ({ 
    title, 
    sub, 
    icon, 
    onClick, 
    href,
    highlight = false 
  }: { 
    title: string; 
    sub: string; 
    icon: React.ReactNode; 
    onClick?: () => void;
    href?: string;
    highlight?: boolean;
  }) => {
    const className = `group relative p-8 flex flex-col items-center gap-4 transition-all duration-500 border overflow-hidden
      ${highlight 
        ? 'bg-white text-black border-white hover:bg-slate-200' 
        : 'bg-white/[0.02] text-white border-white/5 hover:border-white/30 hover:bg-white/[0.05]'}`;
    
    const content = (
      <>
        <div className={`transition-transform duration-500 group-hover:scale-110 ${highlight ? 'text-black' : 'text-white/40'}`}>
          {icon}
        </div>
        <div className="text-center">
          <div className="font-black uppercase tracking-[0.2em] text-sm">{title}</div>
          <div className={`text-[9px] uppercase tracking-widest mt-1 italic ${highlight ? 'text-black/50' : 'text-white/20'}`}>{sub}</div>
        </div>
        <div className={`absolute bottom-0 left-0 h-1 w-0 group-hover:w-full transition-all duration-700 ${highlight ? 'bg-black/20' : 'bg-white'}`}></div>
      </>
    );

    if (href) {
      return <Link href={href} className={className}>{content}</Link>;
    }
    return <button onClick={onClick} className={className}>{content}</button>;
  };

  return (
    <div className="h-screen w-screen overflow-hidden bg-black text-white font-serif relative flex flex-col items-center justify-center">
      {/* Background Image with Cinematic Overlay */}
      <div className="absolute inset-0 z-0">
        <div className="w-full h-full bg-gradient-to-br from-slate-900 via-black to-slate-900 opacity-100" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-white/5 via-transparent to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/60 to-black" />
      </div>

      {/* Floating particles */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-px h-px bg-white/30 rounded-full"
            style={{
              left: `${Math.random() * 100}%`,
              top: `${Math.random() * 100}%`,
              animation: `pulse ${2 + Math.random() * 3}s ease-in-out infinite`,
              animationDelay: `${Math.random() * 2}s`,
            }}
          />
        ))}
      </div>



      {/* Main Content */}
      <div className="relative z-10 text-center space-y-12 max-w-4xl px-8">
        {/* Title */}
        <div className={`space-y-4 transition-all duration-1000 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <span className="text-xs uppercase tracking-[1em] text-white/30 font-bold block">Legacy of the Old World</span>
          <h1 className="text-7xl md:text-9xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-b from-white via-white/80 to-slate-700 drop-shadow-[0_0_30px_rgba(255,255,255,0.15)]">
            DARK ODYSSEY
          </h1>
          <div className="flex items-center justify-center gap-6 mt-4 opacity-50">
            <div className="h-px w-24 bg-gradient-to-r from-transparent to-white" />
            <p className="text-sm italic tracking-[0.2em] uppercase font-sans">Enter the Shadow Realm</p>
            <div className="h-px w-24 bg-gradient-to-l from-transparent to-white" />
          </div>
        </div>

        {/* Menu Buttons */}
        <div className={`grid grid-cols-1 md:grid-cols-3 gap-6 transition-all duration-1000 delay-500 ${isLoaded ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
          <MenuButton 
            title="สร้างห้องใหม่" 
            sub="Host a Session" 
            icon={<PlusCircle size={24}/>} 
            onClick={() => setShowRegister(true)}
          />
          <MenuButton 
            title="เข้าร่วมผจญภัย" 
            sub="Join Adventure" 
            icon={<Users size={24}/>} 
            onClick={() => setShowLogin(true)}
          />
          <MenuButton 
            title="จัดการตัวละคร" 
            sub="Character Smith" 
            icon={<Sword size={24}/>} 
            href="/character/create"
            highlight
          />
        </div>

        {/* Footer Links */}
        <div className={`pt-8 transition-all duration-1000 delay-1000 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}>
          <Link href="/settings" className="text-[10px] uppercase tracking-[0.5em] text-white/20 hover:text-white/60 transition-colors flex items-center gap-2 mx-auto">
            <Settings size={12} />
            Settings • v3.0
          </Link>
        </div>
      </div>

      {/* Footer */}
      <footer className="absolute bottom-8 text-[9px] text-white/10 uppercase tracking-[1em]">
        Dark Odyssey Interactive
      </footer>

      {/* Login Modal */}
      {showLogin && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowLogin(false)}>
          <div className="bg-black border border-white/10 p-8 max-w-md w-full space-y-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <h2 className="text-2xl font-black uppercase tracking-widest">{t.auth.loginTitle}</h2>
              <p className="text-xs text-white/40 mt-1">Enter the realm</p>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder={t.auth.username} className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:border-white/30 focus:outline-none" />
              <input type="password" placeholder={t.auth.password} className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:border-white/30 focus:outline-none" />
            </div>
            <button className="w-full py-4 bg-white text-black font-black uppercase tracking-widest text-sm hover:bg-slate-200 transition-colors">
              {t.auth.loginTitle}
            </button>
            <p className="text-center text-xs text-white/40">
              {t.auth.noAccount} <button onClick={() => { setShowLogin(false); setShowRegister(true); }} className="text-white/60 hover:text-white">{t.auth.registerTitle}</button>
            </p>
          </div>
        </div>
      )}

      {/* Register Modal */}
      {showRegister && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6" onClick={() => setShowRegister(false)}>
          <div className="bg-black border border-white/10 p-8 max-w-md w-full space-y-6" onClick={e => e.stopPropagation()}>
            <div className="text-center">
              <h2 className="text-2xl font-black uppercase tracking-widest">{t.auth.registerTitle}</h2>
              <p className="text-xs text-white/40 mt-1">Begin your journey</p>
            </div>
            <div className="space-y-4">
              <input type="text" placeholder={t.auth.username} className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:border-white/30 focus:outline-none" />
              <input type="email" placeholder={t.auth.email} className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:border-white/30 focus:outline-none" />
              <input type="password" placeholder={t.auth.password} className="w-full bg-white/5 border border-white/10 p-3 text-sm focus:border-white/30 focus:outline-none" />
            </div>
            <button className="w-full py-4 bg-white text-black font-black uppercase tracking-widest text-sm hover:bg-slate-200 transition-colors">
              {t.auth.registerTitle}
            </button>
            <p className="text-center text-xs text-white/40">
              {t.auth.hasAccount} <button onClick={() => { setShowRegister(false); setShowLogin(true); }} className="text-white/60 hover:text-white">{t.auth.loginTitle}</button>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
