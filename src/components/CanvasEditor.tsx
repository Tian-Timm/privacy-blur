"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Undo2, ImagePlus, Sparkles, Grid2x2, Square, Wand2, FileText } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/translations";
import { jsPDF } from "jspdf";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import Tesseract from "tesseract.js";

type ToolType = "blur" | "pixelate" | "block" | "text";

type Rect = { x: number; y: number; w: number; h: number };

type Action = {
  type: ToolType;
  rect: Rect;
  blurRadius?: number;
  pixelSize?: number;
  color?: string;
  text?: string;
};

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

function loadImageFromBlob(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export default function CanvasEditor() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { lang } = useLanguage();
  const t = translations[lang];
  const [pages, setPages] = useState<{ id: string; image: HTMLImageElement; actions: Action[] }[]>([]);
  const [current, setCurrent] = useState(0);
  const image = pages[current]?.image ?? null;
  const actions = pages[current]?.actions ?? [];
  const [tool, setTool] = useState<ToolType>("blur");
  const [blurRadius, setBlurRadius] = useState(12);
  const [pixelSize, setPixelSize] = useState(12);
  const [color, setColor] = useState("#000000");
  const [isDragging, setIsDragging] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [textInputRect, setTextInputRect] = useState<Rect | null>(null);
  const [textInputValue, setTextInputValue] = useState("");

  const canvasSize = useMemo(() => {
    if (!image) return { width: 0, height: 0 };
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, [image]);

  const applyAction = React.useCallback((ctx: CanvasRenderingContext2D, act: Action) => {
    if (!image) return;
    if (act.type === "blur") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(act.rect.x, act.rect.y, act.rect.w, act.rect.h);
      ctx.clip();
      ctx.filter = `blur(${act.blurRadius ?? 12}px)`;
      ctx.drawImage(image, 0, 0);
      ctx.filter = "none";
      ctx.restore();
      return;
    }
    if (act.type === "pixelate") {
      const tw = Math.max(1, Math.floor((act.rect.w || 1) / (act.pixelSize ?? 12)));
      const th = Math.max(1, Math.floor((act.rect.h || 1) / (act.pixelSize ?? 12)));
      const temp = document.createElement("canvas");
      temp.width = tw;
      temp.height = th;
      const tctx = temp.getContext("2d");
      if (!tctx) return;
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(image, act.rect.x, act.rect.y, act.rect.w, act.rect.h, 0, 0, tw, th);
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(temp, 0, 0, tw, th, act.rect.x, act.rect.y, act.rect.w, act.rect.h);
      ctx.imageSmoothingEnabled = true;
      ctx.restore();
      return;
    }
    if (act.type === "block") {
      ctx.save();
      ctx.fillStyle = act.color ?? "#000000";
      ctx.fillRect(act.rect.x, act.rect.y, act.rect.w, act.rect.h);
      ctx.restore();
      return;
    }
    if (act.type === "text") {
      ctx.save();
      ctx.fillStyle = act.color ?? "#000000";
      ctx.fillRect(act.rect.x, act.rect.y, act.rect.w, act.rect.h);
      ctx.fillStyle = (act.color && act.color.toLowerCase() === "#000000") ? "#ffffff" : "#000000";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "600 16px system-ui, -apple-system, Segoe UI, Roboto";
      const tx = act.rect.x + act.rect.w / 2;
      const ty = act.rect.y + act.rect.h / 2;
      ctx.fillText(act.text ?? "", tx, ty, act.rect.w - 8);
      ctx.restore();
      return;
    }
  }, [image]);

  const render = React.useCallback((options?: { preview?: Action }) => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0);
    for (const act of actions) applyAction(ctx, act);
    if (options?.preview) applyAction(ctx, options.preview);
    if (previewRect) {
      ctx.save();
      ctx.strokeStyle = "#22c55e";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
      ctx.restore();
    }
  }, [image, actions, previewRect, applyAction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    render();
  }, [image, actions, canvasSize, render]);

  useEffect(() => {
    const handler = async (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      for (const item of e.clipboardData.items) {
        if (item.type.startsWith("image/")) {
          const blob = item.getAsFile();
          if (blob) {
            const img = await loadImageFromBlob(blob);
            setPages([{ id: crypto.randomUUID(), image: img, actions: [] }]);
            setCurrent(0);
            setPreviewRect(null);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  const undo = React.useCallback(() => {
    setPages((prev) => {
      if (!prev.length) return prev;
      const copy = [...prev];
      const p = copy[current];
      copy[current] = { ...p, actions: p.actions.slice(0, -1) };
      return copy;
    });
  }, [current]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo]);

  function getRelativeCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    return { x, y };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!image) return;
    const pos = getRelativeCoords(e);
    setStartPoint(pos);
    setIsDragging(true);
    setPreviewRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDragging || !startPoint) return;
    const pos = getRelativeCoords(e);
    const x = Math.min(pos.x, startPoint.x);
    const y = Math.min(pos.y, startPoint.y);
    const w = Math.abs(pos.x - startPoint.x);
    const h = Math.abs(pos.y - startPoint.y);
    setPreviewRect({ x, y, w, h });
    render({ preview: { type: tool, rect: { x, y, w, h } } });
  }

  function onPointerUp() {
    if (!isDragging || !previewRect) return;
    const action: Action = {
      type: tool,
      rect: previewRect,
      blurRadius,
      pixelSize,
      color,
    };
    if (tool === "text") {
      setTextInputRect(previewRect);
      setTextInputValue("");
    } else {
      setPages((prev) => {
        const copy = [...prev];
        const p = copy[current];
        copy[current] = { ...p, actions: [...p.actions, action] };
        return copy;
      });
    }
    setIsDragging(false);
    setStartPoint(null);
    setPreviewRect(null);
  }

  function clearAll() {
    setPages((prev) => {
      if (!prev.length) return prev;
      const copy = [...prev];
      const p = copy[current];
      copy[current] = { ...p, actions: [] };
      return copy;
    });
  }

  

  

  async function onCopy() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      setToast(t.copied_toast);
      setTimeout(() => setToast(null), 1500);
    }, "image/png");
  }

  function onDownload(format: "png" | "jpg" | "pdf") {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (format === "pdf" && pages.length > 1) {
      const doc = new jsPDF({ unit: "px", format: [canvas.width, canvas.height] });
      pages.forEach((p, idx) => {
        const c = document.createElement("canvas");
        c.width = p.image.naturalWidth;
        c.height = p.image.naturalHeight;
        const ctx = c.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(p.image, 0, 0);
        for (const act of p.actions) applyAction(ctx, act);
        const data = c.toDataURL("image/jpeg", 0.92);
        if (idx > 0) doc.addPage([c.width, c.height]);
        doc.addImage(data, "JPEG", 0, 0, c.width, c.height);
      });
      doc.save("privacyblur.pdf");
      return;
    }
    const link = document.createElement("a");
    link.download = `privacyblur.${format}`;
    link.href =
      format === "png"
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", 0.92);
    link.click();
  }

  async function loadFile(file: File) {
    if (file.type === "application/pdf") {
      await import("pdfjs-dist/build/pdf.worker");
      GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
      const data = await file.arrayBuffer();
      const pdf = await getDocument({ data }).promise;
      const newPages: { id: string; image: HTMLImageElement; actions: Action[] }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const c = document.createElement("canvas");
        c.width = viewport.width;
        c.height = viewport.height;
        await page.render({ canvasContext: c.getContext("2d") as CanvasRenderingContext2D, viewport }).promise;
        const img = new Image();
        img.src = c.toDataURL("image/png");
        await new Promise<void>((res) => { img.onload = () => res(); });
        newPages.push({ id: crypto.randomUUID(), image: img, actions: [] });
      }
      setPages(newPages);
      setCurrent(0);
      return;
    }
    const img = await loadImageFromFile(file);
    setPages([{ id: crypto.randomUUID(), image: img, actions: [] }]);
    setCurrent(0);
  }

  async function onFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadFile(file);
  }

  function onDragEnter(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }
  function onDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(true);
  }
  function onDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
  }
  async function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await loadFile(file);
    }
  }

  return (
    <div className="w-full flex flex-col items-center gap-3">
      {!image && (
        <div
          ref={containerRef}
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={
            "relative w-full max-w-4xl h-[60vh] flex items-center justify-center rounded-xl border border-neutral-800/60 bg-neutral-900/50" +
            " " + (dragActive ? "ring-2 ring-emerald-500/70" : "")
          }
        >
          <div className="flex flex-col items-center text-center px-6">
            <div className="flex items-center gap-2 text-neutral-300">
              <ImagePlus className="w-5 h-5" />
              <span className="text-sm">{t.upload_text}</span>
            </div>
            <button
              onClick={() => {
                fileInputRef.current?.click();
              }}
              className="mt-4 inline-flex items-center gap-2 rounded-md bg-neutral-800 px-4 py-2 text-neutral-100 hover:bg-neutral-700"
            >
              {t.select_file}
            </button>
            <p className="mt-2 text-xs text-neutral-500">{t.paste_hint}</p>
          </div>
        </div>
      )}
      {image && (
        <div className="w-full max-w-5xl">
          <div className="relative w-full overflow-auto rounded-xl bg-neutral-950 shadow-lg">
            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              className="w-full h-auto block"
            />
          </div>
          <div className="sticky bottom-4 mt-4 flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTool("blur")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm ${
                  tool === "blur" ? "bg-emerald-600 text-white" : "bg-neutral-800 text-neutral-200"
                }`}
                title={t.tool_blur}
              >
                <Sparkles className="w-4 h-4" /> {t.tool_blur}
              </button>
              <button
                onClick={() => setTool("pixelate")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm ${
                  tool === "pixelate" ? "bg-emerald-600 text-white" : "bg-neutral-800 text-neutral-200"
                }`}
                title={t.tool_pixelate}
              >
                <Grid2x2 className="w-4 h-4" /> {t.tool_pixelate}
              </button>
              <button
                onClick={() => setTool("block")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm ${
                  tool === "block" ? "bg-emerald-600 text-white" : "bg-neutral-800 text-neutral-200"
                }`}
                title={t.tool_block}
              >
                <Square className="w-4 h-4" /> {t.tool_block}
              </button>
              <button
                onClick={() => setTool("text")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm ${
                  tool === "text" ? "bg-emerald-600 text-white" : "bg-neutral-800 text-neutral-200"
                }`}
                title={t.text_overlay}
              >
                <FileText className="w-4 h-4" /> {t.text_overlay}
              </button>
            </div>
            <div className="flex items-center gap-4">
              {tool === "blur" && (
                <div className="flex items-center gap-2 text-neutral-300">
                  <span className="text-xs">{t.slider_blur}</span>
                  <input
                    type="range"
                    min={2}
                    max={40}
                    value={blurRadius}
                    onChange={(e) => setBlurRadius(Number(e.target.value))}
                  />
                </div>
              )}
              {tool === "pixelate" && (
                <div className="flex items-center gap-2 text-neutral-300">
                  <span className="text-xs">{t.slider_pixel}</span>
                  <input
                    type="range"
                    min={4}
                    max={64}
                    value={pixelSize}
                    onChange={(e) => setPixelSize(Number(e.target.value))}
                  />
                </div>
              )}
              {tool === "block" && (
                <div className="flex items-center gap-2 text-neutral-300">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-8 h-8 rounded-md border border-neutral-700 bg-neutral-800"
                  />
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={undo}
                className="inline-flex items-center gap-1 rounded-md bg-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
                title={t.undo}
              >
                <Undo2 className="w-4 h-4" /> {t.undo}
              </button>
              <button
                onClick={async () => {
                  if (!image || scanning) return;
                  setScanning(true);
                  const canvas = canvasRef.current;
                  if (!canvas) { setScanning(false); return; }
                  const result = await Tesseract.recognize(canvas, "eng");
                  const words = (result.data.words ?? []) as { text?: string; bbox?: { x0: number; y0: number; x1: number; y1: number } }[];
                  const email = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
                  const phone = /(\+?\d[\d\s-]{7,}\d)/;
                  const toAdd: Action[] = [];
                  for (const w of words) {
                    const text = w.text ?? "";
                    const b = w.bbox;
                    if ((email.test(text) || phone.test(text)) && b) {
                      const rect: Rect = { x: b.x0, y: b.y0, w: b.x1 - b.x0, h: b.y1 - b.y0 };
                      toAdd.push({ type: "blur", rect, blurRadius });
                    }
                  }
                  if (toAdd.length) {
                    setPages((prev) => {
                      const copy = [...prev];
                      const p = copy[current];
                      copy[current] = { ...p, actions: [...p.actions, ...toAdd] };
                      return copy;
                    });
                  }
                  setScanning(false);
                }}
                className="inline-flex items-center gap-1 rounded-md bg-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
                title={t.magic_redact}
              >
                <Wand2 className="w-4 h-4" /> {scanning ? t.scanning : t.magic_redact}
              </button>
              <button
                onClick={onCopy}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-2 text-sm text-white hover:bg-emerald-500"
                title={t.copy}
              >
                <Copy className="w-4 h-4" /> {t.copy}
              </button>
              <button
                onClick={() => onDownload("png")}
                className="inline-flex items-center gap-1 rounded-md bg-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
                title={t.download_png}
              >
                <Download className="w-4 h-4" /> {t.download_png}
              </button>
              <button
                onClick={() => onDownload("jpg")}
                className="inline-flex items-center gap-1 rounded-md bg-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
                title={t.download_jpg}
              >
                <Download className="w-4 h-4" /> {t.download_jpg}
              </button>
              {pages.length > 1 && (
                <button
                  onClick={() => onDownload("pdf")}
                  className="inline-flex items-center gap-1 rounded-md bg-neutral-800 px-3 py-2 text-sm text-neutral-200 hover:bg-neutral-700"
                  title={t.download_pdf}
                >
                  <Download className="w-4 h-4" /> {t.download_pdf}
                </button>
              )}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            {pages.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => setCurrent(idx)}
                className={`h-7 min-w-10 rounded-md border px-2 text-xs ${idx === current ? "border-emerald-500 bg-neutral-800 text-white" : "border-neutral-700 bg-neutral-900 text-neutral-300"}`}
                title={`${t.page} ${idx + 1}`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-neutral-800 px-3 py-2 text-sm text-white shadow">
          {toast}
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileSelect} />
      {image && (
        <div className="mt-2 text-xs text-neutral-500">{t.undo_hint}</div>
      )}
      {image && (
        <div className="mt-1">
          <button
            onClick={clearAll}
            className="text-xs text-neutral-400 underline underline-offset-4 hover:text-neutral-200"
          >
            {t.clear_all}
          </button>
        </div>
      )}
      {textInputRect && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4">
            <div className="text-sm mb-2 text-neutral-200">{t.enter_text}</div>
            <input
              autoFocus
              value={textInputValue}
              onChange={(e) => setTextInputValue(e.target.value)}
              className="w-64 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 outline-none"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button
                onClick={() => {
                  setTextInputRect(null);
                  setTextInputValue("");
                }}
                className="rounded-md bg-neutral-800 px-3 py-1 text-neutral-200 hover:bg-neutral-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const rect = textInputRect!;
                  const action: Action = { type: "text", rect, color, text: textInputValue };
                  setPages((prev) => {
                    const copy = [...prev];
                    const p = copy[current];
                    copy[current] = { ...p, actions: [...p.actions, action] };
                    return copy;
                  });
                  setTextInputRect(null);
                  setTextInputValue("");
                }}
                className="rounded-md bg-emerald-600 px-3 py-1 text-white hover:bg-emerald-500"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
