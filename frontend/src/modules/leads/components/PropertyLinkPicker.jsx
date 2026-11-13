import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Check, ChevronDown, MapPin, Search, X } from "lucide-react";

/*
 * Searchable property picker for linking a property to a lead. Replaces a
 * native <select> whose one-line options ran off the screen and could not be
 * searched.
 *
 * items: [{ id, propertyId, name, location, details, listing, price }]
 * Search matches every typed word against property ID, name, location,
 * details, listing type and price, so "palasia office 1500" narrows quickly.
 * Keyboard: Up / Down to move, Enter to pick, Escape to close.
 */

const MAX_RESULTS = 200;
const PANEL_MAX_HEIGHT = 380;

const PropertyLinkPicker = ({
  items = [],
  value = "",
  onChange,
  isDark = false,
  disabled = false,
  placeholder = "Search and select a property",
  emptyLabel = "No properties available",
  className = "",
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef(null);
  const panelRef = useRef(null);
  const listRef = useRef(null);
  // The list is drawn on document.body so a card with overflow hidden cannot
  // cut it off; it follows the field and opens upwards when there is no room below.
  const [panelBox, setPanelBox] = useState(null);

  const selected = items.find((item) => item.id === value) || null;

  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return items;
    return items.filter((item) => {
      const haystack = [item.propertyId, item.name, item.location, item.details, item.listing, item.price]
        .join(" ")
        .toLowerCase();
      return words.every((word) => haystack.includes(word));
    });
  }, [items, query]);
  const visible = filtered.slice(0, MAX_RESULTS);

  useLayoutEffect(() => {
    if (!open) return undefined;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;
      const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
      setPanelBox({
        left: rect.left,
        width: rect.width,
        top: openUp ? undefined : rect.bottom + 4,
        bottom: openUp ? window.innerHeight - rect.top + 4 : undefined,
        maxHeight: Math.max(180, Math.min(PANEL_MAX_HEIGHT, openUp ? spaceAbove : spaceBelow)),
      });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnOutsideClick = (event) => {
      const inField = rootRef.current && rootRef.current.contains(event.target);
      const inPanel = panelRef.current && panelRef.current.contains(event.target);
      if (!inField && !inPanel) setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const openPicker = () => {
    if (disabled || !items.length) return;
    setActive(0);
    setOpen(true);
  };

  const choose = (item) => {
    onChange?.(item.id);
    setOpen(false);
    setQuery("");
  };

  const handleKeyDown = (event) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(visible.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (visible[active]) choose(visible[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  };

  const muted = isDark ? "text-slate-400" : "text-slate-500";
  const field = isDark
    ? "border-slate-700 bg-slate-950 text-slate-100"
    : "border-slate-300 bg-white text-slate-800";

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <div
        role="combobox"
        aria-expanded={open}
        aria-haspopup="listbox"
        tabIndex={disabled ? -1 : 0}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (!open && ["Enter", " ", "ArrowDown"].includes(event.key)) {
            event.preventDefault();
            openPicker();
          }
        }}
        className={`flex min-h-10 w-full cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 text-left text-sm ${field} ${
          disabled || !items.length ? "cursor-not-allowed opacity-60" : ""
        }`}
      >
        <Building2 size={15} className={`shrink-0 ${muted}`} />
        {selected ? (
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">
              {selected.propertyId ? <span className={isDark ? "text-blue-300" : "text-blue-700"}>{selected.propertyId}</span> : null}
              {selected.propertyId && selected.name ? " · " : ""}
              {selected.name}
            </span>
            <span className={`block truncate text-xs ${muted}`}>
              {[selected.location, selected.listing, selected.price].filter(Boolean).join(" · ")}
            </span>
          </span>
        ) : (
          <span className={`min-w-0 flex-1 truncate ${muted}`}>{items.length ? placeholder : emptyLabel}</span>
        )}
        {selected && !disabled ? (
          <button
            type="button"
            aria-label="Clear selected property"
            onClick={(event) => {
              event.stopPropagation();
              onChange?.("");
            }}
            className={`rounded p-0.5 ${isDark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}
          >
            <X size={14} className={muted} />
          </button>
        ) : null}
        <ChevronDown size={15} className={`shrink-0 ${muted}`} />
      </div>

      {open && panelBox ? createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", left: panelBox.left, width: panelBox.width, top: panelBox.top, bottom: panelBox.bottom, maxHeight: panelBox.maxHeight }}
          className={`z-[200] flex flex-col overflow-hidden rounded-xl border shadow-2xl ${
            isDark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
          }`}
        >
          <div className={`flex items-center gap-2 border-b px-3 py-2 ${isDark ? "border-slate-700" : "border-slate-100"}`}>
            <Search size={15} className={muted} />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search by ID, name, area, city, size, type or price…"
              className={`w-full bg-transparent text-sm outline-none ${isDark ? "text-slate-100 placeholder:text-slate-500" : "text-slate-800 placeholder:text-slate-400"}`}
            />
            <span className={`whitespace-nowrap text-xs ${muted}`}>
              {filtered.length === items.length ? `${items.length}` : `${filtered.length} of ${items.length}`}
            </span>
          </div>

          <div ref={listRef} role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
            {visible.map((item, index) => {
              const isActive = index === active;
              const isSelected = item.id === value;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                  className={`flex w-full items-start gap-3 px-3 py-2 text-left ${
                    isActive ? (isDark ? "bg-slate-800" : "bg-blue-50") : ""
                  }`}
                >
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate text-sm font-semibold ${isDark ? "text-slate-100" : "text-slate-900"}`}>
                      {item.propertyId ? <span className={isDark ? "text-blue-300" : "text-blue-700"}>{item.propertyId}</span> : null}
                      {item.propertyId && item.name ? " · " : ""}
                      {item.name}
                    </span>
                    <span className={`mt-0.5 flex items-center gap-1 truncate text-xs ${muted}`}>
                      {item.location ? <MapPin size={11} className="shrink-0" /> : null}
                      <span className="truncate">{[item.location, item.details].filter(Boolean).join(" · ")}</span>
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    {item.listing ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${isDark ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-600"}`}>
                        {item.listing}
                      </span>
                    ) : null}
                    {item.price ? (
                      <span className={`whitespace-nowrap text-xs font-semibold ${isDark ? "text-slate-200" : "text-slate-800"}`}>{item.price}</span>
                    ) : null}
                  </span>
                  {isSelected ? <Check size={15} className={`mt-0.5 shrink-0 ${isDark ? "text-blue-300" : "text-blue-600"}`} /> : null}
                </button>
              );
            })}
            {!visible.length ? (
              <p className={`px-3 py-6 text-center text-sm ${muted}`}>No property matches “{query.trim()}”.</p>
            ) : null}
            {filtered.length > MAX_RESULTS ? (
              <p className={`px-3 py-2 text-center text-xs ${muted}`}>
                Showing {MAX_RESULTS} of {filtered.length}. Type more to narrow the list.
              </p>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}
    </div>
  );
};

export default PropertyLinkPicker;
