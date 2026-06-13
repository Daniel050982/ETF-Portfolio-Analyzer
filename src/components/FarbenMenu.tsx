import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { getColor, FALLBACK_PALETTE, ColorMarker } from './PPElements';

// Hover-Open mit kleiner Schließ-Verzögerung, damit das Wechseln zwischen
// Eintrag und (ggf. fixed positioniertem) Submenü das Menü nicht zuschnappt.
function useHoverOpen(delay = 140) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enter = () => { if (timer.current) clearTimeout(timer.current); setOpen(true); };
  const leave = () => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(() => setOpen(false), delay); };
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  return { open, enter, leave };
}

/* ══════════════════════════════════════════════════════════════════════
   Zusatzfeature (kein PP): Markerfarbe pro Konto/Depot anpassen.
   Erscheint als Menüeintrag im Spalten-Einstellungsmenü (direkt unter den
   Spalten-Gruppen). Öffnet sich beim Überfahren mit der Maus (wie die
   Spalten-Gruppen-Submenüs), Untermenüs ebenso.
   ══════════════════════════════════════════════════════════════════════ */

const ITEM_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
  cursor: 'pointer', color: 'var(--pp-text)', background: 'transparent',
  border: 'none', width: '100%', textAlign: 'left', fontSize: 11,
};
const SUBMENU_STYLE: React.CSSProperties = {
  background: 'var(--pp-content-bg)', border: '1px solid var(--pp-border)',
  borderRadius: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.4)', minWidth: 200,
  padding: '4px 0', whiteSpace: 'nowrap', maxHeight: 360, overflowY: 'auto',
};

// Wählbare Farben: Palette + Broker-Farben
const SWATCHES = [
  ...FALLBACK_PALETTE,
  '#FFCB05', '#003D7A', '#00D4AA', '#F7931A', '#e53935', '#43a047', '#fb8c00', '#8e24aa',
];

// Richtung bestimmen: nach rechts öffnen, außer es ist kein Platz → nach links.
// Das Spaltenmenü sitzt am rechten Rand, daher meist links.
function useFlipSide(open: boolean, submenuWidth: number) {
  const anchorRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<'left' | 'right'>('left');
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    setSide(rect.right + submenuWidth > window.innerWidth ? 'left' : 'right');
  }, [open, submenuWidth]);
  return { anchorRef, side };
}

const FARBWAEHLER_W = 168;

function FarbZeile({ name, farbe, onPick, onReset }: {
  name: string; farbe?: string;
  onPick: (farbe: string) => void;
  onReset: () => void;
}) {
  const { open, enter, leave } = useHoverOpen();
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const aktuelleFarbe = farbe ?? getColor(name);

  // Farbwähler-Popup FIXED zum Viewport positionieren, damit es NICHT vom
  // scrollbaren Listen-Container (overflow) abgeschnitten wird.
  useLayoutEffect(() => {
    if (!open || !rowRef.current) { setPos(null); return; }
    const r = rowRef.current.getBoundingClientRect();
    const openRight = r.right + FARBWAEHLER_W <= window.innerWidth;
    const left = openRight ? r.right : r.left - FARBWAEHLER_W;
    const top = Math.min(r.top, window.innerHeight - 110);
    setPos({ left: Math.max(4, left), top });
  }, [open]);

  return (
    <div ref={rowRef}
      onMouseEnter={enter}
      onMouseLeave={leave}>
      <button style={{ ...ITEM_STYLE, background: open ? 'var(--pp-selected-bg)' : 'transparent' }}>
        <ColorMarker color={aktuelleFarbe} />
        <span className="truncate" style={{ flex: 1 }}>{name}</span>
        <span style={{ fontSize: 8, color: 'var(--pp-text-muted)' }}>▶</span>
      </button>
      {open && pos && (
        <div
          onMouseEnter={enter}
          onMouseLeave={leave}
          style={{ ...SUBMENU_STYLE, position: 'fixed', left: pos.left, top: pos.top, minWidth: FARBWAEHLER_W, maxHeight: 'none', overflow: 'visible', padding: 8 }}>
          <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
            {SWATCHES.map(c => (
              <button key={c} title={c}
                onClick={() => onPick(c)}
                style={{
                  width: 18, height: 18, borderRadius: 3, background: c, cursor: 'pointer',
                  border: aktuelleFarbe.toLowerCase() === c.toLowerCase() ? '2px solid var(--pp-text)' : '1px solid var(--pp-border)',
                }} />
            ))}
          </div>
          <div className="flex items-center gap-2 mt-2 pt-2" style={{ borderTop: '1px solid var(--pp-border)' }}>
            <input type="color" value={aktuelleFarbe}
              onChange={e => onPick(e.target.value)}
              style={{ width: 28, height: 22, background: 'transparent', border: 'none', cursor: 'pointer', padding: 0 }} />
            <button onClick={onReset}
              style={{ ...ITEM_STYLE, padding: '2px 4px', width: 'auto', color: 'var(--pp-text-muted)' }}>
              Zurücksetzen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Menüeintrag fürs Spaltenmenü mit ausklappbarem Submenü, das alle
   Konten/Depots mit Farbwähler listet. Öffnet bei Hover. */
export function FarbenMenuFooter({ label, items, onSetFarbe }: {
  label: string;
  items: { name: string; farbe?: string }[];
  onSetFarbe: (name: string, farbe?: string) => void;
}) {
  const { open, enter, leave } = useHoverOpen();
  const { anchorRef, side } = useFlipSide(open, 220);
  const sidePos = side === 'right' ? { left: '100%' } : { right: '100%' };

  return (
    <div className="relative" ref={anchorRef}
      onMouseEnter={enter}
      onMouseLeave={leave}>
      <button style={{ ...ITEM_STYLE, background: open ? 'var(--pp-selected-bg)' : 'transparent' }}>
        <span style={{ flex: 1 }}>{label}</span>
        <span style={{ fontSize: 8, color: 'var(--pp-text-muted)' }}>▶</span>
      </button>
      {open && (
        <div
          onMouseEnter={enter}
          onMouseLeave={leave}
          style={{ ...SUBMENU_STYLE, position: 'absolute', ...sidePos, top: 0 }}>
          {items.length === 0 ? (
            <div style={{ padding: '4px 12px', fontSize: 11, color: 'var(--pp-text-muted)' }}>Keine Einträge</div>
          ) : items.map(it => (
            <FarbZeile key={it.name} name={it.name} farbe={it.farbe}
              onPick={f => onSetFarbe(it.name, f)}
              onReset={() => onSetFarbe(it.name, undefined)} />
          ))}
        </div>
      )}
    </div>
  );
}
