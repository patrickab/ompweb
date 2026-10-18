"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";

const LIST_MAX_HEIGHT = 280;
const GAP = 4;
const VIEWPORT_PAD = 8;
const TYPEAHEAD_RESET_MS = 700;

type ListOption = { label: string; disabled: boolean; group: string | null };
type Placement = { left: number; minWidth: number; maxHeight: number } & ({ top: number } | { bottom: number });
type OpenList = { select: HTMLSelectElement; options: ListOption[]; highlighted: number; placement: Placement };

/** Single-choice native selects under a mouse: touch keeps the platform picker, which suits it better. */
function isEnhanceable(target: EventTarget | null): target is HTMLSelectElement {
  return target instanceof HTMLSelectElement && !target.multiple && target.size <= 1 && !target.disabled && matchMedia("(pointer: fine)").matches;
}

/**
 * Fixed position below the select, or above when there is more room there.
 *
 * - `--ui-scale` zooms `<html>`: rects are painted pixels, fixed coordinates get zoomed again
 */
function placeList(select: HTMLSelectElement): Placement {
  const scale = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ui-scale")) || 1;
  const rect = select.getBoundingClientRect();
  const viewportWidth = window.innerWidth / scale;
  const viewportHeight = window.innerHeight / scale;
  const spaceBelow = viewportHeight - rect.bottom / scale - GAP - VIEWPORT_PAD;
  const spaceAbove = rect.top / scale - GAP - VIEWPORT_PAD;
  const minWidth = rect.width / scale;
  const left = Math.max(VIEWPORT_PAD, Math.min(rect.left / scale, viewportWidth - minWidth - VIEWPORT_PAD));
  return spaceBelow >= Math.min(LIST_MAX_HEIGHT, spaceAbove)
    ? { left, minWidth, maxHeight: Math.min(LIST_MAX_HEIGHT, spaceBelow), top: rect.bottom / scale + GAP }
    : { left, minWidth, maxHeight: Math.min(LIST_MAX_HEIGHT, spaceAbove), bottom: viewportHeight - rect.top / scale + GAP };
}

function openListFor(select: HTMLSelectElement): OpenList {
  const options = [...select.options].map((option) => {
    const group = option.parentElement instanceof HTMLOptGroupElement ? option.parentElement : null;
    return { label: option.label, disabled: option.disabled || Boolean(group?.disabled), group: group?.label ?? null };
  });
  const firstEnabled = options.findIndex((option) => !option.disabled);
  return { select, options, highlighted: select.selectedIndex >= 0 ? select.selectedIndex : firstEnabled, placement: placeList(select) };
}

/** Next enabled option from `from` in `step` direction, `from` itself when none. */
function stepHighlight(options: ListOption[], from: number, step: 1 | -1): number {
  for (let index = from + step; index >= 0 && index < options.length; index += step) {
    if (!options[index].disabled) return index;
  }
  return from;
}

/** Choose like a user would: native setter plus input/change events, so React's onChange fires. */
function chooseOption(select: HTMLSelectElement, index: number) {
  if (select.selectedIndex === index) return;
  select.selectedIndex = index;
  select.dispatchEvent(new Event("input", { bubbles: true }));
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Replaces the native popup of every `<select>` with a Coolfrog listbox, without touching upstream markup.
 *
 * - The native select stays the source of truth: value, form state, closed-state keyboard and screen-reader role
 * - Opens on click, Space, Enter, F4 or Alt+Arrow. Arrows, Home/End, typeahead, Enter choose, Escape and Tab close
 * - Window capture listeners run before dialogs' document listeners, so presses in the list never dismiss a dialog
 */
export function SelectEnhancer() {
  const [list, setList] = useState<OpenList | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: "", at: 0 });

  useEffect(() => {
    const isInList = (target: EventTarget | null) => target instanceof Node && Boolean(listRef.current?.contains(target));

    const onPointerDown = (event: MouseEvent) => {
      if (isInList(event.target)) {
        event.preventDefault(); // keep focus on the select
        event.stopPropagation();
        return;
      }
      if (event.type === "mousedown" && event.button === 0 && isEnhanceable(event.target)) {
        const select = event.target;
        event.preventDefault();
        select.focus({ preventScroll: true });
        setList((current) => (current?.select === select ? null : openListFor(select)));
        return;
      }
      if (list && event.target !== list.select) setList(null);
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!list) {
        const opens = event.key === " " || event.key === "Enter" || event.key === "F4" || (event.altKey && event.key.startsWith("Arrow"));
        if (opens && isEnhanceable(event.target)) {
          event.preventDefault();
          setList(openListFor(event.target));
        }
        return;
      }
      if (event.target !== list.select) return;
      const { options, highlighted, select } = list;
      const highlight = (index: number) => setList({ ...list, highlighted: index });
      const handled: Record<string, () => void> = {
        ArrowDown: () => highlight(stepHighlight(options, highlighted, 1)),
        ArrowUp: () => highlight(stepHighlight(options, highlighted, -1)),
        Home: () => highlight(stepHighlight(options, -1, 1)),
        End: () => highlight(stepHighlight(options, options.length, -1)),
        Enter: () => { chooseOption(select, highlighted); setList(null); },
        " ": () => { chooseOption(select, highlighted); setList(null); },
        Escape: () => setList(null),
      };
      const now = Date.now();
      const isTyping = now - typeahead.current.at < TYPEAHEAD_RESET_MS;
      const isTypeaheadKey = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey && (event.key !== " " || isTyping);
      if (event.key === "Tab") {
        setList(null);
      } else if (isTypeaheadKey) {
        event.preventDefault();
        event.stopPropagation();
        const text = (isTyping ? typeahead.current.text : "") + event.key.toLowerCase();
        typeahead.current = { text, at: now };
        const match = options.findIndex((option) => !option.disabled && option.label.toLowerCase().startsWith(text));
        if (match >= 0) highlight(match);
      } else if (event.key in handled) {
        event.preventDefault();
        event.stopPropagation();
        handled[event.key]();
      }
    };

    const onScroll = (event: Event) => {
      if (list && !isInList(event.target)) setList(null);
    };
    const onResize = () => setList(null);
    const onFocusOut = (event: FocusEvent) => {
      if (list && event.target === list.select) setList(null);
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.addEventListener("focusout", onFocusOut, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("focusout", onFocusOut, true);
    };
  }, [list]);

  // Expose the open list on the select (its implicit role is combobox) and keep the highlight visible.
  useEffect(() => {
    if (!list) return;
    const { select } = list;
    select.setAttribute("aria-expanded", "true");
    select.setAttribute("aria-controls", "cf-select-list");
    select.setAttribute("aria-activedescendant", `cf-select-option-${list.highlighted}`);
    listRef.current?.querySelector("[data-highlighted]")?.scrollIntoView({ block: "nearest" });
    return () => {
      select.removeAttribute("aria-expanded");
      select.removeAttribute("aria-controls");
      select.removeAttribute("aria-activedescendant");
    };
  }, [list]);

  if (!list) return null;
  const { select, options, highlighted, placement } = list;
  return createPortal(
    <div ref={listRef} id="cf-select-list" role="listbox" className="cf-select-list" style={placement}>
      {options.map((option, index) => (
        <div key={index}>
          {option.group !== null && option.group !== options[index - 1]?.group && <div className="cf-select-group">{option.group}</div>}
          <div
            id={`cf-select-option-${index}`}
            role="option"
            aria-selected={index === select.selectedIndex}
            aria-disabled={option.disabled || undefined}
            data-highlighted={index === highlighted || undefined}
            onMouseMove={() => {
              if (index !== highlighted && !option.disabled) setList({ ...list, highlighted: index });
            }}
            className="cf-select-option"
            onClick={() => {
              if (option.disabled) return;
              chooseOption(select, index);
              setList(null);
            }}
          >
            <span className="cf-select-option-label">{option.label}</span>
            {index === select.selectedIndex && <Check size={14} strokeWidth={2} aria-hidden="true" />}
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}
