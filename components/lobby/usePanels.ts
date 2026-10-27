// Раскладка боковой колонки и выбранный инструмент. Помним их в браузере:
// это про привычку игрока, а не про склад.

import { useEffect, useRef, useState } from "react";
import { DEFAULT_PANELS, PANELS_KEY, readPanels, type Tool } from "./tools";

export function usePanels() {
  const [tool, setTool] = useState<Tool>("area");
  /** Выбранный инструмент помним между заходами — он тоже настройка. */
  const toolRef = useRef<Tool>("area");
  toolRef.current = tool;
  const [panelOrder, setPanelOrder] = useState(DEFAULT_PANELS);
  const [hidden, setHidden] = useState<Record<string, boolean>>({});
  const [dragPanel, setDragPanel] = useState<string | null>(null);

  useEffect(() => {
    const saved = readPanels();
    setPanelOrder(saved.order);
    setHidden(saved.hidden);
    if (saved.tool) setTool(saved.tool);
  }, []);

  const savePanels = (
    order: string[],
    next: Record<string, boolean>,
    activeTool: Tool = toolRef.current
  ) => {
    try {
      window.localStorage.setItem(
        PANELS_KEY,
        JSON.stringify({ order, hidden: next, tool: activeTool })
      );
    } catch {
      // приватный режим — переживём, просто не запомним
    }
  };

  const togglePanel = (id: string) => {
    setHidden((cur) => {
      const next = { ...cur, [id]: !cur[id] };
      savePanels(panelOrder, next);
      return next;
    });
  };

  /** Перетаскивание: тащим одну панель поверх другой — они меняются местами. */
  const movePanel = (over: string) => {
    setPanelOrder((cur) => {
      if (!dragPanel || dragPanel === over) return cur;
      const from = cur.indexOf(dragPanel);
      const to = cur.indexOf(over);
      if (from < 0 || to < 0) return cur;
      const next = cur.slice();
      next.splice(from, 1);
      next.splice(to, 0, dragPanel);
      savePanels(next, hidden);
      return next;
    });
  };

  const chooseTool = (id: Tool) => {
    setTool(id);
    toolRef.current = id;
    savePanels(panelOrder, hidden, id);
  };

  return { tool, chooseTool, panelOrder, hidden, dragPanel, setDragPanel, togglePanel, movePanel };
}
