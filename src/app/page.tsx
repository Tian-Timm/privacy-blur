"use client";
import { Github } from "lucide-react";
// ✅ 添加这一行
import dynamic from 'next/dynamic';

// ✅ 使用 dynamic 定义组件，并强制关闭 SSR
const CanvasEditor = dynamic(() => import('@/components/CanvasEditor'), {
  ssr: false, // 关键！告诉 Next.js 这部分只在客户端渲染
  loading: () => <div className="flex items-center justify-center h-64 text-gray-500">Loading Editor...</div>, // 可选：加载时的占位符
});
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/translations";

export default function Home() {
  const { lang, setLang } = useLanguage();
  const t = translations[lang];
  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-50">
      <header className="sticky top-0 z-20 flex h-14 w-full items-center justify-between border-b border-neutral-800 bg-neutral-950/80 px-4 backdrop-blur">
        <div className="text-sm font-semibold tracking-wide">{t.title}</div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLang(lang === "en" ? "zh" : "en")}
            className="inline-flex items-center gap-1 rounded-md bg-neutral-900 px-3 py-1 text-neutral-300 hover:bg-neutral-800"
            aria-label="Language"
            title="Language"
          >
            <span className={lang === "en" ? "text-white" : "text-neutral-400"}>{t.lang_toggle_en}</span>
            <span>/</span>
            <span className={lang === "zh" ? "text-white" : "text-neutral-400"}>{t.lang_toggle_zh}</span>
          </button>
          <a
            href="https://github.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-neutral-900 px-3 py-1 text-neutral-300 hover:bg-neutral-800"
          >
            <Github className="h-4 w-4" />
            <span className="text-xs">{t.github}</span>
          </a>
        </div>
      </header>
      <main className="mx-auto flex w-full max-w-6xl flex-col items-center gap-6 px-4 py-6">
        <CanvasEditor />
      </main>
    </div>
  );
}
