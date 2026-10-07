import { useLayoutEffect, useRef } from "react";

/**
 * Lets the parts of a list glide to their new places when the list is reordered.
 * Put the returned ref on a container and `data-flip="<id>"` on every part. `order` is any value that
 * changes when the order does. Under reduced motion the parts simply appear in place.
 */
export function useFlip<Container extends HTMLElement>(order: string) {
  const container = useRef<Container>(null);
  const places = useRef(new Map<string, { left: number; top: number }>());

  useLayoutEffect(() => {
    const parts = [...(container.current?.querySelectorAll<HTMLElement>("[data-flip]") ?? [])];
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const now = new Map(parts.map(part => {
      const box = part.getBoundingClientRect();
      return [part.dataset.flip!, { left: box.left + window.scrollX, top: box.top + window.scrollY }];
    }));
    for (const part of parts) {
      const was = places.current.get(part.dataset.flip!), is = now.get(part.dataset.flip!)!;
      if (still || !was || (Math.abs(was.left - is.left) < 1 && Math.abs(was.top - is.top) < 1)) continue;
      part.animate([{ transform: `translate(${was.left - is.left}px, ${was.top - is.top}px)` }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.22, 1, .36, 1)" });
    }
    places.current = now;
  }, [order]);

  return container;
}
