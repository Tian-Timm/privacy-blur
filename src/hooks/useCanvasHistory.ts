import { useMemo, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist/types/src/display/api";

export type ToolType = "blur" | "pixelate" | "block" | "text";

export type Rect = { x: number; y: number; w: number; h: number };

export type Action = {
  type: ToolType;
  rect: Rect;
  blurRadius?: number;
  pixelSize?: number;
  color?: string;
  text?: string;
  textColor?: string;
};

export function useCanvasHistory() {
  const [actionsByPage, setActionsByPage] = useState<Record<number, Action[]>>({});
  const [pageCount, setPageCount] = useState(0);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [baseImage, setBaseImage] = useState<HTMLImageElement | null>(null);
  const [currentPage, setCurrentPage] = useState(0);

  const actions = useMemo(() => actionsByPage[currentPage] ?? [], [actionsByPage, currentPage]);

  function addAction(page: number, action: Action) {
    setActionsByPage((prev) => {
      const list = prev[page] ?? [];
      return { ...prev, [page]: [...list, action] };
    });
  }

  function undo(page: number) {
    setActionsByPage((prev) => {
      const list = prev[page] ?? [];
      return { ...prev, [page]: list.slice(0, Math.max(0, list.length - 1)) };
    });
  }

  function clearAll(page: number) {
    setActionsByPage((prev) => ({ ...prev, [page]: [] }));
  }

  return {
    actionsByPage,
    actions,
    addAction,
    undo,
    clearAll,
    pageCount,
    setPageCount,
    pdfDocument,
    setPdfDocument,
    baseImage,
    setBaseImage,
    currentPage,
    setCurrentPage,
  };
}

