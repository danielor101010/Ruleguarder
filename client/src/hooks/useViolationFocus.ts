import { useCallback, useEffect, useRef, useState } from "react";
import { FLASH_MS, scrollBehavior } from "../lib/motion";
import type { Violation } from "../types";

export interface Flash {
  blockId: number;
  /** Changes on every click, so a keyed overlay remounts and the CSS animation restarts. */
  nonce: number;
}

/**
 * The selected ("active") violation and the paragraph flash.
 * - From the list: scroll the paragraph into view (smooth), mark it active and flash it for FLASH_MS.
 * - From the document (clicking a highlight): mark it active and scroll its card into view in the list.
 * Document-level violations (block_id null) only become active.
 */
export function useViolationFocus() {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);
  const blocks = useRef(new Map<number, HTMLElement>());
  const items = useRef(new Map<string, HTMLElement>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nonce = useRef(0);

  useEffect(() => () => clearTimeout(timer.current), []);

  const selectFromList = useCallback((v: Violation) => {
    setActiveId(v.id);
    if (v.block_id === null) return;
    const blockId = v.block_id;
    blocks.current.get(blockId)?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    nonce.current += 1;
    setFlash({ blockId, nonce: nonce.current });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setFlash(null), FLASH_MS);
  }, []);

  const selectFromDocument = useCallback((v: Violation) => {
    setActiveId(v.id);
    items.current.get(v.id)?.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
  }, []);

  const registerBlock = useCallback(
    (id: number) => (el: HTMLElement | null) => {
      if (el) blocks.current.set(id, el);
      else blocks.current.delete(id);
    },
    [],
  );

  const registerItem = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      if (el) items.current.set(id, el);
      else items.current.delete(id);
    },
    [],
  );

  return { activeId, flash, selectFromList, selectFromDocument, registerBlock, registerItem };
}
