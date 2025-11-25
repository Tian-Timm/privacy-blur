"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Copy, Download, Undo2, ImagePlus, Sparkles, Grid2x2, Square, FileText, Type, Move, MousePointer2, Trash2 } from "lucide-react";
import { useLanguage } from "@/context/LanguageContext";
import { translations } from "@/lib/translations";
import { jsPDF } from "jspdf";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";

// 工具类型
type ToolType = "move" | "blur" | "pixelate" | "block" | "text";

type Rect = { x: number; y: number; w: number; h: number };

type Action = {
  type: Exclude<ToolType, "move">; 
  rect: Rect;
  blurRadius?: number;
  pixelSize?: number;
  color?: string;
  text?: string;
  textColor?: string;
  fontSize?: number;
};

// --- 图片加载辅助函数 ---
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

// ✨✨✨ 核心修复：从【原始图片】中计算平均色 (彻底解决叠加变黑问题)
function getAverageColorFromImage(image: HTMLImageElement, rect: Rect) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return { bgColor: "#000000", textColor: "#ffffff" };

  let totalR = 0;
  let totalG = 0;
  let totalB = 0;
  let count = 0;

  const topY = Math.max(0, Math.round(rect.y) - 1);
  const bottomY = Math.min(image.naturalHeight - 1, Math.round(rect.y + rect.h) + 1);
  const leftX = Math.max(0, Math.round(rect.x) - 1);
  const rightX = Math.min(image.naturalWidth - 1, Math.round(rect.x + rect.w) + 1);

  const topW = Math.max(0, Math.min(Math.round(rect.w), image.naturalWidth - Math.round(rect.x)));
  const leftH = Math.max(0, Math.min(Math.round(rect.h), image.naturalHeight - Math.round(rect.y)));

  const segments: { sx: number; sy: number; sw: number; sh: number }[] = [];
  if (topW > 0) {
    segments.push({ sx: Math.round(rect.x), sy: topY, sw: topW, sh: 1 });
    segments.push({ sx: Math.round(rect.x), sy: bottomY, sw: topW, sh: 1 });
  }
  if (leftH > 0) {
    segments.push({ sx: leftX, sy: Math.round(rect.y), sw: 1, sh: leftH });
    segments.push({ sx: rightX, sy: Math.round(rect.y), sw: 1, sh: leftH });
  }

  for (const seg of segments) {
    if (seg.sw <= 0 || seg.sh <= 0) continue;
    canvas.width = seg.sw;
    canvas.height = seg.sh;
    ctx.clearRect(0, 0, seg.sw, seg.sh);
    ctx.drawImage(image, seg.sx, seg.sy, seg.sw, seg.sh, 0, 0, seg.sw, seg.sh);
    const data = ctx.getImageData(0, 0, seg.sw, seg.sh).data;
    for (let i = 0; i < data.length; i += 4) {
      totalR += data[i];
      totalG += data[i + 1];
      totalB += data[i + 2];
      count++;
    }
  }

  if (count === 0) return { bgColor: "#000000", textColor: "#ffffff" };
  const r = Math.round(totalR / count);
  const g = Math.round(totalG / count);
  const b = Math.round(totalB / count);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  const textColor = brightness > 128 ? "#000000" : "#ffffff";
  const bgColor = `rgb(${r}, ${g}, ${b})`;
  return { bgColor, textColor };
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
  
  const [tool, setTool] = useState<ToolType>("move"); // 默认 Move 工具
  
  // 参数状态
  const [blurRadius, setBlurRadius] = useState(12);
  const [pixelSize, setPixelSize] = useState(12);
  const [color, setColor] = useState("#000000");
  
  // 交互状态
  const [isDragging, setIsDragging] = useState(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  
  // ✨✨✨ 选中 & 编辑 状态
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null); // 当前选中的 Action (用于移动/删除)
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number } | null>(null);
  
  // 文本弹窗状态
  const [textInputRect, setTextInputRect] = useState<Rect | null>(null);
  const [textInputValue, setTextInputValue] = useState("");
  const [fontSize, setFontSize] = useState(16);
  // 专门用于区分：当前弹窗是在编辑哪个旧 Item，还是在新建
  const [editingTextIndex, setEditingTextIndex] = useState<number | null>(null); 
  const [inputBackgroundColor, setInputBackgroundColor] = useState<string>("#000000");

  const canvasSize = useMemo(() => {
    if (!image) return { width: 0, height: 0 };
    return { width: image.naturalWidth, height: image.naturalHeight };
  }, [image]);

  // --- 渲染逻辑 ---
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
      ctx.fillStyle = act.textColor ?? "#000000";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `600 ${act.fontSize ?? 16}px Inter, system-ui, -apple-system, Segoe UI, Roboto`;
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
    
    // 预览新画的框
    if (options?.preview && tool !== 'move') {
        applyAction(ctx, options.preview);
    }
    
    // 画新框时的绿色虚线
    if (previewRect && tool !== 'move') {
      ctx.save();
      ctx.strokeStyle = "#22c55e";
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      ctx.strokeRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
      ctx.restore();
    }

    // ✨✨✨ 选中框的高亮 (蓝色实线 + 锚点提示)
    if (selectedIndex !== null && tool === "move") {
      const act = actions[selectedIndex];
      if (act) {
        ctx.save();
        ctx.strokeStyle = "#3b82f6"; // Tailwind Blue 500
        ctx.lineWidth = 2;
        ctx.strokeRect(act.rect.x, act.rect.y, act.rect.w, act.rect.h);
        // 画个简单的角标表示被选中
        ctx.fillStyle = "#3b82f6";
        const r = act.rect;
        const s = 6; // 锚点大小
        ctx.fillRect(r.x - s/2, r.y - s/2, s, s); // 左上
        ctx.fillRect(r.x + r.w - s/2, r.y + r.h - s/2, s, s); // 右下
        ctx.restore();
      }
    }

  }, [image, actions, previewRect, applyAction, tool, selectedIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;
    canvas.width = canvasSize.width;
    canvas.height = canvasSize.height;
    render();
  }, [image, actions, canvasSize, render]);

  // --- 事件监听 ---
  
  // 粘贴图片
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
            setSelectedIndex(null);
            break;
          }
        }
      }
    };
    window.addEventListener("paste", handler);
    return () => window.removeEventListener("paste", handler);
  }, []);

  // 撤销 (Ctrl+Z)
  const undo = React.useCallback(() => {
    setPages((prev) => {
      if (!prev.length) return prev;
      const copy = [...prev];
      const p = copy[current];
      copy[current] = { ...p, actions: p.actions.slice(0, -1) };
      return copy;
    });
    setSelectedIndex(null);
  }, [current]);

  // 删除选中项 (Delete/Backspace)
  const deleteSelected = React.useCallback(() => {
    if (selectedIndex === null) return;
    setPages((prev) => {
      const copy = [...prev];
      const p = copy[current];
      const newActions = [...p.actions];
      newActions.splice(selectedIndex, 1);
      copy[current] = { ...p, actions: newActions };
      return copy;
    });
    setSelectedIndex(null);
  }, [current, selectedIndex]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
      // ✨ 监听删除键
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedIndex !== null && !textInputRect) { // 只有在没打开输入框时才删除
             e.preventDefault();
             deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, deleteSelected, selectedIndex, textInputRect]);


  function getRelativeCoords(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    return { x, y };
  }

  // --- 鼠标交互核心逻辑 ---

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!image) return;
    const pos = getRelativeCoords(e);

    // 模式 1：Move 工具 - 负责选中和拖拽
    if (tool === "move") {
      // 倒序查找，优先选中最上层
      for (let i = actions.length - 1; i >= 0; i--) {
        const act = actions[i];
        const r = act.rect;
        if (pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h) {
          setSelectedIndex(i); // ✨ 选中它！
          setDragOffset({ x: pos.x - r.x, y: pos.y - r.y });
          setStartPoint(pos);
          return;
        }
      }
      // 如果点在空白处，取消选中
      setSelectedIndex(null);
      return;
    }

    // 模式 2：绘图工具 - 负责画新框
    setSelectedIndex(null); // 画新框时取消之前的选中
    setDragOffset(null);
    setStartPoint(pos);
    setIsDragging(true);
    setPreviewRect({ x: pos.x, y: pos.y, w: 0, h: 0 });
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const pos = getRelativeCoords(e);

    // 拖拽移动
    if (tool === "move") {
      if (selectedIndex !== null && dragOffset) {
        setPages(prev => {
          const copy = [...prev];
          const p = copy[current];
          const newActions = [...p.actions];
          
          const movingAct = { ...newActions[selectedIndex] };
          movingAct.rect = {
            ...movingAct.rect,
            x: pos.x - dragOffset.x,
            y: pos.y - dragOffset.y
          };
          
          newActions[selectedIndex] = movingAct;
          copy[current] = { ...p, actions: newActions };
          return copy;
        });
      }
      return;
    }

    // 画新框
    if (!isDragging || !startPoint) return;
    const x = Math.min(pos.x, startPoint.x);
    const y = Math.min(pos.y, startPoint.y);
    const w = Math.abs(pos.x - startPoint.x);
    const h = Math.abs(pos.y - startPoint.y);
    setPreviewRect({ x, y, w, h });
    render({ preview: { type: tool as Exclude<ToolType, "move">, rect: { x, y, w, h } } });
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    // 模式 1：Move 工具松手
    if (tool === "move") {
      if (selectedIndex !== null && startPoint) {
        const pos = getRelativeCoords(e);
        const dist = Math.sqrt(Math.pow(pos.x - startPoint.x, 2) + Math.pow(pos.y - startPoint.y, 2));

        if (dist >= 5) {
          // 🔹 拖拽结束：重新计算变色龙背景 (如果是文本)
          const act = actions[selectedIndex];
          if (act.type === "text") {
             // ✨✨✨ 关键修复：传入 image (原始图) 而不是 ctx (脏画布)
             const { bgColor, textColor } = getAverageColorFromImage(image, act.rect);
             setPages(prev => {
                const copy = [...prev];
                const p = copy[current];
                const newActions = [...p.actions];
                newActions[selectedIndex] = {
                  ...newActions[selectedIndex],
                  color: bgColor,
                  textColor: textColor
                };
                copy[current] = { ...p, actions: newActions };
                return copy;
              });
          }
        }
      }
      setDragOffset(null);
      setStartPoint(null);
      return;
    }

    // 模式 2：画框结束
    if (!isDragging || !previewRect) return;
    if (previewRect.w < 5 || previewRect.h < 5) {
      setIsDragging(false);
      setStartPoint(null);
      setPreviewRect(null);
      return;
    }

    const action: Action = {
      type: tool as Exclude<ToolType, "move">,
      rect: previewRect,
      blurRadius,
      pixelSize,
      color,
    };

    if (tool === "text") {
      setTextInputRect(previewRect);
      setTextInputValue("");
      setEditingTextIndex(null);
      setFontSize(16);
      if (image) {
        const { bgColor } = getAverageColorFromImage(image, previewRect);
        setInputBackgroundColor(bgColor);
      }
    } else {
      setPages((prev) => {
        const copy = [...prev];
        const p = copy[current];
        copy[current] = { ...p, actions: [...p.actions, action] };
        return copy;
      });
      // 画完自动切回 move 工具，方便调整 (可选，看个人喜好)
      // setTool("move"); 
      // setSelectedIndex(actions.length); // 选中刚画的
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
    setSelectedIndex(null);
  }

  async function onCopy() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // 渲染时不带选中框
    render();
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      const item = new ClipboardItem({ [blob.type]: blob });
      await navigator.clipboard.write([item]);
      setToast(t.copied_toast);
      setTimeout(() => setToast(null), 1500);
      // 恢复选中框显示
      render();
    }, "image/png");
  }

  function onDownload(format: "png" | "jpg" | "pdf") {
    // 临时清除选中状态再下载，避免把蓝色边框下载下来
    const savedSelection = selectedIndex;
    setSelectedIndex(null);
    // 强制同步渲染一帧不带框的
    setTimeout(() => {
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
        } else {
          const link = document.createElement("a");
          link.download = `privacyblur.${format}`;
          link.href = format === "png"
            ? canvas.toDataURL("image/png")
            : canvas.toDataURL("image/jpeg", 0.92);
          link.click();
        }
        // 恢复选中
        setSelectedIndex(savedSelection);
    }, 0);
  }

  async function loadFile(file: File) {
    if (file.type === "application/pdf") {
      GlobalWorkerOptions.workerSrc = '/pdf.worker.min.js';
      const data = await file.arrayBuffer();
      const pdf = await getDocument({ data }).promise;
      const newPages: { id: string; image: HTMLImageElement; actions: Action[] }[] = [];
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const c = document.createElement("canvas");
        c.width = viewport.width;
        c.height = viewport.height;
        await page.render({ canvasContext: c.getContext("2d") as CanvasRenderingContext2D, viewport } as any).promise;
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
              onDoubleClick={(e) => {
                const rect = canvasRef.current?.getBoundingClientRect();
                if (!rect) return;
                const canvas = canvasRef.current!;
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                const x = (e.clientX - rect.left) * scaleX;
                const y = (e.clientY - rect.top) * scaleY;
                for (let i = actions.length - 1; i >= 0; i--) {
                  const act = actions[i];
                  const r = act.rect;
                  if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
                    if (act.type === "text") {
                      setEditingTextIndex(i);
                      setTextInputRect(r);
                      setTextInputValue(act.text || "");
                      setFontSize(act.fontSize || 16);
                      setInputBackgroundColor(act.color || "#000000");
                    }
                    break;
                  }
                }
              }}
              className={`w-full h-auto block touch-none ${tool === "move" ? "cursor-move" : "cursor-crosshair"}`}
            />
          </div>
          
          {/* 工具栏 */}
          <div className="sticky bottom-4 mt-4 flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-900/60 px-3 py-3 backdrop-blur">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTool("move")}
                className={`inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm ${
                  tool === "move" ? "bg-emerald-600 text-white" : "bg-neutral-800 text-neutral-200"
                }`}
                title="Move & Select"
              >
                <MousePointer2 className="w-4 h-4" /> Move
              </button>

              <div className="w-px h-6 bg-neutral-700 mx-1" />

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
              {/* 参数滑块 */}
              {tool === "blur" && (
                <div className="flex items-center gap-2 text-neutral-300">
                  <span className="text-xs">{t.slider_blur}</span>
                  <input
                    type="range" min={2} max={40}
                    value={blurRadius} onChange={(e) => setBlurRadius(Number(e.target.value))}
                  />
                </div>
              )}
              {tool === "pixelate" && (
                <div className="flex items-center gap-2 text-neutral-300">
                  <span className="text-xs">{t.slider_pixel}</span>
                  <input
                    type="range" min={4} max={64}
                    value={pixelSize} onChange={(e) => setPixelSize(Number(e.target.value))}
                  />
                </div>
              )}
              {tool === "block" && (
                <div className="flex items-center gap-2 text-neutral-300">
                  <input
                    type="color" value={color} onChange={(e) => setColor(e.target.value)}
                    className="w-8 h-8 rounded-md border border-neutral-700 bg-neutral-800"
                  />
                </div>
              )}
              {/* ✨ 如果当前选中了元素，显示删除按钮 */}
              {tool === "move" && selectedIndex !== null && (
                 <button 
                    onClick={deleteSelected}
                    className="inline-flex items-center gap-1 rounded-md bg-red-900/50 px-3 py-2 text-sm text-red-200 hover:bg-red-900/70 border border-red-800"
                 >
                    <Trash2 className="w-4 h-4" /> Delete
                 </button>
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
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
          
          <div className="mt-2 flex items-center justify-center gap-2">
            {pages.map((p, idx) => (
              <button
                key={p.id}
                onClick={() => setCurrent(idx)}
                className={`h-7 min-w-10 rounded-md border px-2 text-xs ${idx === current ? "border-emerald-500 bg-neutral-800 text-white" : "border-neutral-700 bg-neutral-900 text-neutral-300"}`}
              >
                {idx + 1}
              </button>
            ))}
          </div>
        </div>
      )}

      {selectedIndex !== null && actions[selectedIndex]?.type === "text" && image && (
        (() => {
          const act = actions[selectedIndex]!;
          const canvas = canvasRef.current!;
          const rect = canvas.getBoundingClientRect();
          const scaleX = rect.width / canvas.width;
          const scaleY = rect.height / canvas.height;
          const left = rect.left + act.rect.x * scaleX;
          const top = rect.top + (act.rect.y + act.rect.h) * scaleY + 8;
          const style: React.CSSProperties = {
            position: "fixed",
            left,
            top,
            zIndex: 50,
          };
          return (
            <div style={style} className="bg-neutral-800/90 backdrop-blur border border-neutral-700 rounded-lg p-2 flex gap-3 items-center shadow-xl">
              <div className="flex items-center gap-2 text-neutral-200 text-xs">
                <span>Font</span>
                <input
                  type="range"
                  min={10}
                  max={80}
                  value={act.fontSize ?? 16}
                  onChange={(e) => {
                    const fs = Number(e.target.value);
                    setPages((prev) => {
                      const copy = [...prev];
                      const p = copy[current];
                      const na = [...p.actions];
                      na[selectedIndex!] = { ...na[selectedIndex!], fontSize: fs };
                      copy[current] = { ...p, actions: na };
                      return copy;
                    });
                  }}
                />
              </div>
              <div className="flex items-center gap-2 text-neutral-200 text-xs">
                <span>Background</span>
                <input
                  type="color"
                  value={act.color ?? "#000000"}
                  onChange={(e) => {
                    const bg = e.target.value;
                    const m = bg.match(/#([0-9a-f]{6})/i);
                    let r = 0, g = 0, b = 0;
                    if (m) {
                      const hex = m[1];
                      r = parseInt(hex.slice(0,2), 16);
                      g = parseInt(hex.slice(2,4), 16);
                      b = parseInt(hex.slice(4,6), 16);
                    }
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    const tc = brightness > 128 ? "#000000" : "#ffffff";
                    setPages((prev) => {
                      const copy = [...prev];
                      const p = copy[current];
                      const na = [...p.actions];
                      na[selectedIndex!] = { ...na[selectedIndex!], color: bg, textColor: tc };
                      copy[current] = { ...p, actions: na };
                      return copy;
                    });
                  }}
                />
              </div>
              <button
                onClick={deleteSelected}
                className="inline-flex items-center gap-1 rounded-md bg-red-900/50 px-2 py-1 text-xs text-red-200 hover:bg-red-900/70 border border-red-800"
              >
                Delete
              </button>
              <button
                onClick={() => {
                  const a = actions[selectedIndex!];
                  setEditingTextIndex(selectedIndex!);
                  setTextInputRect(a.rect);
                  setTextInputValue(a.text || "");
                  setFontSize(a.fontSize || 16);
                  setInputBackgroundColor(a.color || "#000000");
                }}
                className="inline-flex items-center gap-1 rounded-md bg-neutral-700 px-2 py-1 text-xs text-neutral-100 hover:bg-neutral-600"
              >
                Edit
              </button>
            </div>
          );
        })()
      )}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-md bg-neutral-800 px-3 py-2 text-sm text-white shadow">
          {toast}
        </div>
      )}
      
      <input ref={fileInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFileSelect} />
      
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
      
      {/* 文本编辑弹窗 */}
      {textInputRect && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40 z-50">
          <div className="rounded-lg border border-neutral-700 bg-neutral-900 p-4 shadow-2xl">
            <div className="text-sm mb-2 text-neutral-200 font-medium">
              {editingTextIndex !== null ? "Edit Text" : t.enter_text}
            </div>
            
            <div className="flex flex-col gap-3">
              <input
                autoFocus
                value={textInputValue}
                onChange={(e) => setTextInputValue(e.target.value)}
                placeholder="Type something..."
                className="w-72 rounded-md border border-neutral-700 bg-neutral-800 px-3 py-2 text-neutral-100 outline-none focus:border-emerald-500 transition-colors"
              />
              
              <div className="flex items-center gap-2 text-neutral-400 text-xs">
                <Type className="w-3 h-3" />
                <span>Font Size: {fontSize}px</span>
                <input 
                  type="range" 
                  min={10} max={80} 
                  value={fontSize} 
                  onChange={(e) => setFontSize(Number(e.target.value))} 
                  className="flex-1"
                />
                <span className="ml-3">Background</span>
                <input
                  type="color"
                  value={inputBackgroundColor}
                  onChange={(e) => setInputBackgroundColor(e.target.value)}
                  className="w-8 h-8 rounded-md border border-neutral-700 bg-neutral-800"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => {
                  setTextInputRect(null);
                  setTextInputValue("");
                  setEditingTextIndex(null);
                }}
                className="rounded-md bg-neutral-800 px-3 py-1.5 text-sm text-neutral-200 hover:bg-neutral-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const rect = textInputRect!;
                  const tc = (() => {
                    const c = inputBackgroundColor.toLowerCase();
                    let r = 0, g = 0, b = 0;
                    if (c.startsWith("#") && (c.length === 7)) {
                      r = parseInt(c.slice(1,3), 16);
                      g = parseInt(c.slice(3,5), 16);
                      b = parseInt(c.slice(5,7), 16);
                    } else if (c.startsWith("rgb")) {
                      const m = c.match(/rgb\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)/);
                      if (m) { r = parseInt(m[1],10); g = parseInt(m[2],10); b = parseInt(m[3],10); }
                    }
                    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
                    return brightness > 128 ? "#000000" : "#ffffff";
                  })();
                  const action: Action = { 
                    type: "text", 
                    rect, 
                    color: inputBackgroundColor, 
                    text: textInputValue, 
                    textColor: tc,
                    fontSize
                  };
                  setPages((prev) => {
                    const copy = [...prev];
                    const p = copy[current];
                    if (editingTextIndex !== null) {
                      const newActions = [...p.actions];
                      newActions[editingTextIndex] = action;
                      copy[current] = { ...p, actions: newActions };
                    } else {
                      copy[current] = { ...p, actions: [...p.actions, action] };
                    }
                    return copy;
                  });
                  setTextInputRect(null);
                  setTextInputValue("");
                  setEditingTextIndex(null);
                  setSelectedIndex(null);
                }}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white hover:bg-emerald-500 transition-colors"
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
