"use client";
import React, { useEffect, useMemo, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";
import type { Action, Rect, ToolType } from "@/hooks/useCanvasHistory";

type Props = {
  pdfDocument: PDFDocumentProxy | null;
  baseImage: HTMLImageElement | null;
  currentPage: number;
  actions: Action[];
  tool: ToolType;
  blurRadius: number;
  pixelSize: number;
  color: string;
  onAddAction: (action: Action) => void;
  onRequestText: (rect: Rect, sample: { color: string; textColor: string }) => void;
};

export default function CanvasStage(props: Props) {
  const { pdfDocument, baseImage, currentPage, actions, tool, blurRadius, pixelSize, color, onAddAction, onRequestText } = props;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [stageSize, setStageSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [previewRect, setPreviewRect] = useState<Rect | null>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<number | null>(null);
  const prevMidRef = useRef<{ x: number; y: number } | null>(null);

  const hasBase = useMemo(() => !!baseImage || !!pdfDocument, [baseImage, pdfDocument]);

  const applyAction = (ctx: CanvasRenderingContext2D, base: ImageBitmap, act: Action) => {
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
      ctx.font = "600 16px Inter, system-ui, -apple-system, Segoe UI, Roboto";
      const tx = act.rect.x + act.rect.w / 2;
      const ty = act.rect.y + act.rect.h / 2;
      ctx.fillText(act.text ?? "", tx, ty, act.rect.w - 8);
      ctx.restore();
      return;
    }
    if (act.type === "blur") {
      ctx.save();
      ctx.beginPath();
      ctx.rect(act.rect.x, act.rect.y, act.rect.w, act.rect.h);
      ctx.clip();
      ctx.filter = `blur(${act.blurRadius ?? 12}px)`;
      ctx.drawImage(base, 0, 0);
      ctx.restore();
      return;
    }
    if (act.type === "pixelate") {
      const px = act.pixelSize ?? 12;
      const sx = Math.max(1, Math.floor(act.rect.w / px));
      const sy = Math.max(1, Math.floor(act.rect.h / px));
      const tmp = document.createElement("canvas");
      tmp.width = sx;
      tmp.height = sy;
      const tctx = tmp.getContext("2d") as CanvasRenderingContext2D;
      tctx.imageSmoothingEnabled = false;
      tctx.drawImage(base as unknown as CanvasImageSource, act.rect.x, act.rect.y, act.rect.w, act.rect.h, 0, 0, sx, sy);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tmp, 0, 0, sx, sy, act.rect.x, act.rect.y, act.rect.w, act.rect.h);
      return;
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const off = offscreenRef.current ?? document.createElement("canvas");
    if (!offscreenRef.current) offscreenRef.current = off;
    if (!canvas || !hasBase) return;

    async function render() {
      const ctxOff = off.getContext("2d");
      if (!ctxOff) return;
      if (pdfDocument) {
        const page = await pdfDocument.getPage(currentPage + 1);
        const viewport = page.getViewport({ scale: 2 });
        off.width = Math.floor(viewport.width);
        off.height = Math.floor(viewport.height);
        const ctmp = document.createElement("canvas");
        ctmp.width = off.width;
        ctmp.height = off.height;
        // 注意：在花括号 } 后面加上 as any
await page.render({ canvasContext: ctmp.getContext("2d") as CanvasRenderingContext2D, viewport } as any).promise;
        ctxOff.clearRect(0, 0, off.width, off.height);
        ctxOff.drawImage(ctmp, 0, 0);
        setStageSize({ w: off.width, h: off.height });
      } else if (baseImage) {
        off.width = baseImage.naturalWidth;
        off.height = baseImage.naturalHeight;
        ctxOff.clearRect(0, 0, off.width, off.height);
        ctxOff.drawImage(baseImage, 0, 0);
        setStageSize({ w: off.width, h: off.height });
      }
      const baseBitmap = await createImageBitmap(off);
      const ctxOff2 = off.getContext("2d");
      if (!ctxOff2) return;
      ctxOff2.clearRect(0, 0, off.width, off.height);
      ctxOff2.drawImage(baseBitmap, 0, 0);
      for (const act of actions) {
        applyAction(ctxOff2, baseBitmap, act);
      }
      if (!canvas) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      canvas.width = Math.max(1, canvas.clientWidth);
      canvas.height = Math.max(1, canvas.clientHeight);
      ctx.setTransform(scale, 0, 0, scale, offset.x, offset.y);
      ctx.clearRect(-offset.x / scale, -offset.y / scale, canvas.width / scale, canvas.height / scale);
      ctx.drawImage(off, 0, 0);
      if (previewRect) {
        ctx.save();
        ctx.strokeStyle = "rgba(0,0,0,0.8)";
        ctx.lineWidth = 1;
        ctx.strokeRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
        ctx.restore();
      }
    }
    render();
    return () => {};
  }, [baseImage, pdfDocument, currentPage, actions, scale, offset, previewRect, hasBase]);

  

  function toStageCoords(clientX: number, clientY: number) {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const x = (clientX - rect.left - offset.x) / scale;
    const y = (clientY - rect.top - offset.y) / scale;
    return { x, y };
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!hasBase) return;
    if (e.isPrimary) {
      const p = toStageCoords(e.clientX, e.clientY);
      setStartPoint(p);
      setPreviewRect({ x: p.x, y: p.y, w: 0, h: 0 });
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      pinchStartRef.current = dist;
      prevMidRef.current = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = Array.from(pointers.current.values());
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.hypot(dx, dy);
      const start = pinchStartRef.current ?? dist;
      const factor = dist / Math.max(1, start);
      setScale((s) => Math.min(5, Math.max(0.2, s * factor)));
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const prev = prevMidRef.current ?? mid;
      setOffset((o) => ({ x: o.x + (mid.x - prev.x), y: o.y + (mid.y - prev.y) }));
      prevMidRef.current = mid;
      return;
    }
    if (startPoint && previewRect) {
      const p = toStageCoords(e.clientX, e.clientY);
      setPreviewRect({ x: Math.min(startPoint.x, p.x), y: Math.min(startPoint.y, p.y), w: Math.abs(p.x - startPoint.x), h: Math.abs(p.y - startPoint.y) });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    pointers.current.delete(e.pointerId);
    if (!startPoint || !previewRect) return;
    const rect = previewRect;
    setStartPoint(null);
    setPreviewRect(null);
    if (tool === "text") {
      const sample = sampleBorderColor(rect);
      onRequestText(rect, sample);
      return;
    }
    if (tool === "block") {
      onAddAction({ type: "block", rect, color });
      return;
    }
    if (tool === "blur") {
      onAddAction({ type: "blur", rect, blurRadius });
      return;
    }
    if (tool === "pixelate") {
      onAddAction({ type: "pixelate", rect, pixelSize });
      return;
    }
  }

  function sampleBorderColor(rect: Rect) {
    const off = offscreenRef.current;
    const ctx = off?.getContext("2d") ?? null;
    let r = 0, g = 0, b = 0, c = 0;
    if (off && ctx) {
      const bsz = 5;
      const regions: Rect[] = [
        { x: rect.x, y: rect.y - bsz, w: rect.w, h: bsz },
        { x: rect.x, y: rect.y + rect.h, w: rect.w, h: bsz },
        { x: rect.x - bsz, y: rect.y, w: bsz, h: rect.h },
        { x: rect.x + rect.w, y: rect.y, w: bsz, h: rect.h },
      ];
      for (const rg of regions) {
        const rx = Math.max(0, Math.floor(rg.x));
        const ry = Math.max(0, Math.floor(rg.y));
        const rw = Math.max(0, Math.min(Math.floor(rg.w), off.width - rx));
        const rh = Math.max(0, Math.min(Math.floor(rg.h), off.height - ry));
        if (rw <= 0 || rh <= 0) continue;
        const data = ctx.getImageData(rx, ry, rw, rh).data;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          c++;
        }
      }
    }
    if (c === 0) {
      const bgColor = "rgb(0, 0, 0)";
      const brightness = 0;
      const textColor = brightness > 128 ? "#000000" : "#ffffff";
      return { color: bgColor, textColor };
    }
    const rr = Math.round(r / c);
    const gg = Math.round(g / c);
    const bb = Math.round(b / c);
    const bgColor = `rgb(${rr}, ${gg}, ${bb})`;
    const brightness = (rr * 299 + gg * 587 + bb * 114) / 1000;
    const textColor = brightness > 128 ? "#000000" : "#ffffff";
    return { color: bgColor, textColor };
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    const delta = e.deltaY < 0 ? 1.1 : 0.9;
    setScale((s) => Math.min(5, Math.max(0.2, s * delta)));
  }

  return (
    <div ref={containerRef} style={{ touchAction: "none" }} className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-[60vh] rounded-md border border-neutral-700 bg-neutral-950"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
      />
    </div>
  );
}
