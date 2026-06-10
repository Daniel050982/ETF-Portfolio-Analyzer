import { useState, useCallback, useRef, useEffect } from 'react';

interface SplitPaneProps {
  top: React.ReactNode;
  bottom: React.ReactNode;
  defaultTopPercent?: number;
  storageKey?: string;
}

export function SplitPane({ top, bottom, defaultTopPercent = 55, storageKey }: SplitPaneProps) {
  const [topPercent, setTopPercent] = useState(() => {
    if (storageKey) {
      try {
        const saved = localStorage.getItem(`pp-split-${storageKey}`);
        if (saved) return parseFloat(saved);
      } catch { /* */ }
    }
    return defaultTopPercent;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => {
    if (storageKey) {
      try { localStorage.setItem(`pp-split-${storageKey}`, String(topPercent)); } catch { /* */ }
    }
  }, [topPercent, storageKey]);

  const onMouseDown = useCallback(() => {
    dragging.current = true;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const pct = ((e.clientY - rect.top) / rect.height) * 100;
      setTopPercent(Math.max(10, Math.min(90, pct)));
    };

    const onMouseUp = () => {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, []);

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      <div style={{ height: `${topPercent}%` }} className="overflow-hidden flex flex-col">
        {top}
      </div>
      <div className="pp-split-handle" onMouseDown={onMouseDown} />
      <div style={{ height: `${100 - topPercent}%` }} className="overflow-hidden flex flex-col">
        {bottom}
      </div>
    </div>
  );
}
