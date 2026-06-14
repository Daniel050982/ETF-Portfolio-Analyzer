/* DashboardView — Dashboard-Framework (PP DashboardView).
   Gewichtete Spalten, Drag&Drop von Widgets, Konfig-Menü pro Widget,
   Spalten-Kontextmenü (neues Widget, Spalte hinzufügen/löschen/Breite),
   mehrere Dashboards mit Toolbar. */
import { useMemo, useRef, useState, useCallback } from 'react';
import { usePortfolio } from '../../store/PortfolioContext';
import { Toolbar } from '../../components/PPElements';
import { HierarchyMenu } from '../../components/HierarchyMenu';
import type { MenuNode } from '../../components/HierarchyMenu';
import type { Dashboard, DashboardColumn, DashboardWidget } from '../../types/portfolio';
import { DashboardCalc } from './dashboardData';
import type { DashboardContextData } from './dashboardData';
import { widgetByType, WIDGET_FACTORY, GROUP_ORDER } from './widgetFactory';
import { buildIndicatorDashboard, DASHBOARD_TEMPLATES, newDashboardId } from './dashboardTemplates';
import { SquarePlus } from 'lucide-react';

/* Tiefe Kopie eines Dashboards (für unveränderliche Updates). */
function cloneDashboard(d: Dashboard): Dashboard {
  return {
    ...d,
    configuration: { ...d.configuration },
    columns: d.columns.map(c => ({ weight: c.weight, widgets: c.widgets.map(w => ({ ...w, configuration: { ...w.configuration } })) })),
  };
}

/* Cursor-positioniertes Kontextmenü (nutzt HierarchyMenu, das sich am Parent
   ausrichtet — wir setzen einen 0-px-Anker an die Cursorposition). */
function ContextMenu({ x, y, nodes, onClose }: { x: number; y: number; nodes: MenuNode[]; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', left: x, top: y, width: 0, height: 0, zIndex: 9000 }}>
      <div style={{ position: 'relative' }}>
        <HierarchyMenu nodes={nodes} onClose={onClose} anchorRight={false} />
      </div>
    </div>
  );
}

export default function DashboardView() {
  const { state, setDashboards } = usePortfolio();

  /* Sicherstellen, dass mindestens ein Dashboard existiert. */
  const dashboards = state.dashboards.length > 0 ? state.dashboards : [buildIndicatorDashboard()];
  const [selectedId, setSelectedId] = useState<string>(dashboards[0].id);
  const active = dashboards.find(d => d.id === selectedId) ?? dashboards[0];

  const [menu, setMenu] = useState<{ x: number; y: number; nodes: MenuNode[] } | null>(null);
  const dragWidget = useRef<{ col: number; idx: number } | null>(null);

  /* Persistiert eine modifizierte Dashboard-Liste. */
  const commit = useCallback((next: Dashboard[]) => setDashboards(next), [setDashboards]);

  /* Aktualisiert das aktive Dashboard durch eine Mutationsfunktion. */
  const updateActive = useCallback((mut: (d: Dashboard) => void) => {
    const list = (state.dashboards.length > 0 ? state.dashboards : [active]).map(cloneDashboard);
    const target = list.find(d => d.id === active.id);
    if (!target) return;
    mut(target);
    commit(list);
  }, [state.dashboards, active, commit]);

  /* DashboardCalc (gecachte Kennzahlen). */
  const calc = useMemo(() => {
    const txDates = state.transaktionen.map(t => t.datum.getTime());
    const earliest = txDates.length ? new Date(Math.min(...txDates)) : new Date();
    const ctx: DashboardContextData = {
      transaktionen: state.transaktionen,
      wertpapiere: state.wertpapiere,
      konten: state.konten,
      depots: state.depots,
      basisWaehrung: state.basisWaehrung,
      today: new Date(),
      earliest,
      defaultReportingPeriod: active.configuration['REPORTING_PERIOD'] ?? 'ALL',
    };
    return new DashboardCalc(ctx);
  }, [state.transaktionen, state.wertpapiere, state.konten, state.depots, state.basisWaehrung, active.configuration]);

  /* ── Widget-Konfig ändern ── */
  const setWidgetConfig = useCallback((colIdx: number, widgetIdx: number, key: string, value: string | undefined) => {
    updateActive(d => {
      const w = d.columns[colIdx].widgets[widgetIdx];
      if (!w) return;
      if (value === undefined) delete w.configuration[key];
      else w.configuration[key] = value;
    });
  }, [updateActive]);

  /* ── Widget löschen ── */
  const deleteWidget = useCallback((colIdx: number, widgetIdx: number) => {
    updateActive(d => { d.columns[colIdx].widgets.splice(widgetIdx, 1); });
  }, [updateActive]);

  /* ── Neues Widget hinzufügen ── */
  const addWidget = useCallback((colIdx: number, type: string) => {
    const def = widgetByType(type);
    if (!def) return;
    updateActive(d => {
      d.columns[colIdx].widgets.push({ type, label: def.label, configuration: { ...(def.defaultConfig ?? {}) } });
    });
  }, [updateActive]);

  /* ── Spalten-Operationen ── */
  const addColumn = useCallback((refIdx: number, side: 'left' | 'right') => {
    updateActive(d => {
      const at = side === 'right' ? refIdx + 1 : refIdx;
      d.columns.splice(at, 0, { weight: 1, widgets: [] });
    });
  }, [updateActive]);
  const deleteColumn = useCallback((colIdx: number) => {
    updateActive(d => { if (d.columns.length > 1) d.columns.splice(colIdx, 1); });
  }, [updateActive]);
  const changeWeight = useCallback((colIdx: number, delta: number) => {
    updateActive(d => { d.columns[colIdx].weight = Math.max(1, d.columns[colIdx].weight + delta); });
  }, [updateActive]);
  const duplicateColumn = useCallback((colIdx: number) => {
    updateActive(d => {
      const c = d.columns[colIdx];
      d.columns.splice(colIdx + 1, 0, { weight: c.weight, widgets: c.widgets.map(w => ({ ...w, configuration: { ...w.configuration } })) });
    });
  }, [updateActive]);

  /* ── Drag&Drop von Widgets ── */
  const onDrop = useCallback((targetCol: number, targetIdx: number) => {
    const src = dragWidget.current;
    dragWidget.current = null;
    if (!src) return;
    updateActive(d => {
      const w = d.columns[src.col].widgets[src.idx];
      if (!w) return;
      d.columns[src.col].widgets.splice(src.idx, 1);
      let insertIdx = targetIdx;
      if (src.col === targetCol && src.idx < targetIdx) insertIdx -= 1;
      d.columns[targetCol].widgets.splice(insertIdx, 0, w);
    });
  }, [updateActive]);

  /* ── Dashboard-Operationen ── */
  const selectDashboard = (id: string) => setSelectedId(id);
  const newDashboard = (templateId: string) => {
    const tmpl = DASHBOARD_TEMPLATES.find(t => t.id === templateId);
    const d = tmpl ? tmpl.build() : { id: newDashboardId(), name: 'Dashboard', configuration: {}, columns: [{ weight: 1, widgets: [] }] };
    const list = (state.dashboards.length > 0 ? state.dashboards : dashboards).map(cloneDashboard);
    list.push(d);
    commit(list);
    setSelectedId(d.id);
  };
  const renameDashboard = (id: string) => {
    const name = window.prompt('Dashboard-Name', active.name);
    if (name == null) return;
    commit((state.dashboards.length > 0 ? state.dashboards : dashboards).map(cloneDashboard).map(d => d.id === id ? { ...d, name } : d));
  };
  const deleteDashboard = (id: string) => {
    const list = (state.dashboards.length > 0 ? state.dashboards : dashboards).filter(d => d.id !== id);
    const final = list.length ? list : [buildIndicatorDashboard()];
    commit(final);
    setSelectedId(final[0].id);
  };
  const duplicateDashboard = (id: string) => {
    const src = dashboards.find(d => d.id === id);
    if (!src) return;
    const copy = cloneDashboard(src);
    copy.id = newDashboardId();
    copy.name = `${src.name} (Kopie)`;
    const list = (state.dashboards.length > 0 ? state.dashboards : dashboards).map(cloneDashboard);
    list.push(copy);
    commit(list);
    setSelectedId(copy.id);
  };

  /* ── Spalten-Kontextmenü ── */
  const openColumnMenu = (e: React.MouseEvent, colIdx: number) => {
    e.preventDefault();
    const widgetSubmenu: MenuNode = {
      kind: 'submenu', label: 'Neues Widget',
      children: GROUP_ORDER.map(group => ({
        kind: 'submenu' as const, label: group,
        children: WIDGET_FACTORY.filter(w => w.group === group).map(w => ({
          kind: 'action' as const, label: w.label, onClick: () => { addWidget(colIdx, w.type); setMenu(null); },
        })),
      })),
    };
    const nodes: MenuNode[] = [
      widgetSubmenu,
      { kind: 'separator' },
      { kind: 'action', label: 'Neue Spalte links', onClick: () => { addColumn(colIdx, 'left'); setMenu(null); } },
      { kind: 'action', label: 'Neue Spalte rechts', onClick: () => { addColumn(colIdx, 'right'); setMenu(null); } },
      { kind: 'action', label: 'Spalte duplizieren', onClick: () => { duplicateColumn(colIdx); setMenu(null); } },
      { kind: 'submenu', label: 'Spaltenbreite', children: [
        { kind: 'action', label: 'Breiter', onClick: () => { changeWeight(colIdx, 1); setMenu(null); } },
        { kind: 'action', label: 'Schmaler', onClick: () => { changeWeight(colIdx, -1); setMenu(null); } },
      ] },
      { kind: 'separator' },
      { kind: 'action', label: 'Spalte löschen', danger: true, onClick: () => { deleteColumn(colIdx); setMenu(null); } },
    ];
    setMenu({ x: e.clientX, y: e.clientY, nodes });
  };

  /* ── Widget-Kontextmenü ── */
  const openWidgetMenu = (e: React.MouseEvent, colIdx: number, widgetIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    const w = active.columns[colIdx].widgets[widgetIdx];
    const def = widgetByType(w.type);
    const set = (key: string, value: string | undefined) => { setWidgetConfig(colIdx, widgetIdx, key, value); };
    const configNodes: MenuNode[] = (def?.configs ?? []).map(cfg => cfg.menu(w.configuration, (k, v) => { set(k, v); setMenu(null); }));
    const nodes: MenuNode[] = [
      { kind: 'action', label: 'Umbenennen', onClick: () => {
        const name = window.prompt('Widget-Bezeichnung', w.label);
        if (name != null) { updateActive(d => { d.columns[colIdx].widgets[widgetIdx].label = name; }); }
        setMenu(null);
      } },
      ...(configNodes.length ? [{ kind: 'separator' as const }, ...configNodes] : []),
      { kind: 'separator' },
      { kind: 'action', label: 'Widget löschen', danger: true, onClick: () => { deleteWidget(colIdx, widgetIdx); setMenu(null); } },
    ];
    setMenu({ x: e.clientX, y: e.clientY, nodes });
  };

  const totalWeight = active.columns.reduce((s, c) => s + c.weight, 0);

  return (
    <div className="flex flex-col h-full" onClick={() => menu && setMenu(null)}>
      <Toolbar title={active.name} showSearch={false} viewButtons={
        <DashboardTabs
          dashboards={dashboards}
          activeId={active.id}
          onSelect={selectDashboard}
          onNew={newDashboard}
          onRename={renameDashboard}
          onDelete={deleteDashboard}
          onDuplicate={duplicateDashboard}
        />
      } />

      <div className="flex-1 overflow-auto" style={{ padding: 8 }}>
        <div className="flex" style={{ gap: 10, alignItems: 'flex-start' }}>
          {active.columns.map((col, colIdx) => (
            <ColumnView
              key={colIdx}
              col={col}
              colIdx={colIdx}
              widthPct={(col.weight / totalWeight) * 100}
              calc={calc}
              onColumnMenu={openColumnMenu}
              onWidgetMenu={openWidgetMenu}
              onWidgetConfig={setWidgetConfig}
              onDragStart={(idx) => { dragWidget.current = { col: colIdx, idx }; }}
              onDropAt={(idx) => onDrop(colIdx, idx)}
            />
          ))}
        </div>
      </div>

      {menu && <ContextMenu x={menu.x} y={menu.y} nodes={menu.nodes} onClose={() => setMenu(null)} />}
    </div>
  );
}

/* ── Spalte ── */
function ColumnView({ col, colIdx, widthPct, calc, onColumnMenu, onWidgetMenu, onWidgetConfig, onDragStart, onDropAt }: {
  col: DashboardColumn;
  colIdx: number;
  widthPct: number;
  calc: DashboardCalc;
  onColumnMenu: (e: React.MouseEvent, colIdx: number) => void;
  onWidgetMenu: (e: React.MouseEvent, colIdx: number, widgetIdx: number) => void;
  onWidgetConfig: (colIdx: number, widgetIdx: number, key: string, value: string | undefined) => void;
  onDragStart: (idx: number) => void;
  onDropAt: (idx: number) => void;
}) {
  return (
    <div style={{ width: `${widthPct}%`, minWidth: 160, display: 'flex', flexDirection: 'column', gap: 8 }}>
      {col.widgets.map((w, widgetIdx) => (
        <WidgetCard
          key={widgetIdx}
          widget={w}
          calc={calc}
          onMenu={(e) => onWidgetMenu(e, colIdx, widgetIdx)}
          onConfig={(key, value) => onWidgetConfig(colIdx, widgetIdx, key, value)}
          onDragStart={() => onDragStart(widgetIdx)}
          onDrop={() => onDropAt(widgetIdx)}
        />
      ))}
      {/* Filler / Drop-Ziel am Spaltenende, öffnet das Spalten-Kontextmenü */}
      <div
        onContextMenu={(e) => onColumnMenu(e, colIdx)}
        onDragOver={(e) => e.preventDefault()}
        onDrop={() => onDropAt(col.widgets.length)}
        style={{ minHeight: 40, flex: 1, borderRadius: 4, border: '1px dashed var(--pp-border)', opacity: 0.4 }}
        title="Rechtsklick: Spaltenmenü"
      />
    </div>
  );
}

/* ── Widget-Karte (Container mit Titel-/Konfig-Menü, Drag-Handle) ── */
function WidgetCard({ widget, calc, onMenu, onConfig, onDragStart, onDrop }: {
  widget: DashboardWidget;
  calc: DashboardCalc;
  onMenu: (e: React.MouseEvent) => void;
  onConfig: (key: string, value: string | undefined) => void;
  onDragStart: () => void;
  onDrop: () => void;
}) {
  const def = widgetByType(widget.type);
  const Comp = def?.component;
  const bare = widget.type === 'HEADING' || widget.type === 'DESCRIPTION' || widget.type === 'VERTICAL_SPACER' || widget.type === 'COLLAPSIBLE_SECTION';

  const content = Comp ? <Comp widget={widget} calc={calc} setConfig={onConfig} /> : null;

  if (bare) {
    return (
      <div draggable onDragStart={onDragStart} onDragOver={(e) => e.preventDefault()} onDrop={onDrop}
        onContextMenu={onMenu} style={{ cursor: 'grab' }}>
        {content}
      </div>
    );
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onContextMenu={onMenu}
      style={{
        background: 'var(--pp-content-bg)',
        border: '1px solid var(--pp-border)',
        borderRadius: 4,
        cursor: 'grab',
      }}
    >
      {content}
    </div>
  );
}

/* ── Dashboard-Tabs in der Toolbar (PP createDashboardToolItems) ── */
function DashboardTabs({ dashboards, activeId, onSelect, onNew, onRename, onDelete, onDuplicate }: {
  dashboards: Dashboard[];
  activeId: string;
  onSelect: (id: string) => void;
  onNew: (templateId: string) => void;
  onRename: (id: string) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
}) {
  const [menu, setMenu] = useState<{ x: number; y: number; nodes: MenuNode[] } | null>(null);

  const openTabMenu = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    const nodes: MenuNode[] = [
      { kind: 'action', label: 'Anzeigen', onClick: () => { onSelect(id); setMenu(null); } },
      { kind: 'separator' },
      { kind: 'action', label: 'Duplizieren', onClick: () => { onDuplicate(id); setMenu(null); } },
      { kind: 'action', label: 'Umbenennen', onClick: () => { onRename(id); setMenu(null); } },
      { kind: 'action', label: 'Löschen', danger: true, onClick: () => { onDelete(id); setMenu(null); } },
    ];
    setMenu({ x: e.clientX, y: e.clientY, nodes });
  };
  const openNewMenu = (e: React.MouseEvent) => {
    const nodes: MenuNode[] = DASHBOARD_TEMPLATES.map(t => ({
      kind: 'action' as const, label: `Neu: ${t.label}`, onClick: () => { onNew(t.id); setMenu(null); },
    }));
    setMenu({ x: e.clientX, y: e.clientY, nodes });
  };

  return (
    <div className="flex items-center gap-1">
      {dashboards.map(d => {
        const isActive = d.id === activeId;
        return (
          <button
            key={d.id}
            onClick={() => onSelect(d.id)}
            onContextMenu={(e) => openTabMenu(e, d.id)}
            className="px-2 py-[2px] text-[11px] rounded"
            style={{
              background: isActive ? 'var(--pp-row-selected)' : 'transparent',
              color: isActive ? 'var(--pp-text)' : 'var(--pp-text-secondary)',
              border: '1px solid var(--pp-border)',
            }}
            title="Linksklick: anzeigen · Rechtsklick: Menü"
          >
            {d.name}
          </button>
        );
      })}
      <button onClick={openNewMenu} className="pp-toolbar-btn" title="Neues Dashboard"><SquarePlus size={14} /></button>
      {menu && (
        <div style={{ position: 'fixed', left: menu.x, top: menu.y, width: 0, height: 0, zIndex: 9000 }}>
          <div style={{ position: 'relative' }}>
            <HierarchyMenu nodes={menu.nodes} onClose={() => setMenu(null)} anchorRight={false} />
          </div>
        </div>
      )}
    </div>
  );
}
