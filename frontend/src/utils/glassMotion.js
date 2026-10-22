/*
 * Glass tab motion - one listener for the whole CRM.
 *
 * Any row of sibling buttons that behaves like tabs (segmented controls,
 * underline tabs, filter chips, view toggles...) gets the design's sliding
 * highlight: when a click moves the "active" look from one sibling to another,
 * a ghost copy of the old highlight glides to the new one with a soft spring,
 * and whatever content the switch brings in fades up into place.
 *
 * Nothing is wired per page. A switch is detected by comparing the siblings
 * before and after the click: if the clicked button and one other sibling both
 * changed their class / aria / data state, it was a tab switch. Buttons that
 * just do something (Edit, Delete...) change nothing on their siblings and are
 * left alone.
 */

const ITEM = 'button, a, [role="tab"], [role="button"], [role="radio"]';
const SPRING = "cubic-bezier(.34,1.36,.5,1)";
const EASE_OUT = "cubic-bezier(.2,.9,.25,1)";

const signature = (el) =>
  [
    el.className && typeof el.className === "string" ? el.className : el.getAttribute("class") || "",
    el.getAttribute("aria-selected"),
    el.getAttribute("aria-pressed"),
    el.getAttribute("aria-current"),
    el.getAttribute("data-state"),
    el.getAttribute("data-active"),
  ].join("|");

const look = (cs) => ({
  backgroundColor: cs.backgroundColor,
  backgroundImage: cs.backgroundImage,
  borderTop: `${cs.borderTopWidth} ${cs.borderTopStyle} ${cs.borderTopColor}`,
  borderRight: `${cs.borderRightWidth} ${cs.borderRightStyle} ${cs.borderRightColor}`,
  borderBottom: `${cs.borderBottomWidth} ${cs.borderBottomStyle} ${cs.borderBottomColor}`,
  borderLeft: `${cs.borderLeftWidth} ${cs.borderLeftStyle} ${cs.borderLeftColor}`,
  borderRadius: cs.borderRadius,
  boxShadow: cs.boxShadow,
});

const isVisibleLook = (l) =>
  !/rgba\(0, 0, 0, 0\)|transparent/.test(l.backgroundColor) ||
  l.backgroundImage !== "none" ||
  l.boxShadow !== "none" ||
  [l.borderTop, l.borderRight, l.borderBottom, l.borderLeft].some((b) => !/^0px|none|rgba\(0, 0, 0, 0\)/.test(b));

const tabItems = (group) => [...group.children].filter((el) => el instanceof HTMLElement && el.matches(ITEM));

function slideHighlight(group, from, to, fromRect, fromLook) {
  const toRect = to.getBoundingClientRect();
  if (!toRect.width || !fromRect.width) return;
  const groupRect = group.getBoundingClientRect();
  const offX = groupRect.left + group.clientLeft - group.scrollLeft;
  const offY = groupRect.top + group.clientTop - group.scrollTop;

  const restore = [];
  const setTemp = (el, prop, value) => {
    restore.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, value, "important");
  };

  if (getComputedStyle(group).position === "static") setTemp(group, "position", "relative");
  // Keep labels above the ghost.
  tabItems(group).forEach((el) => {
    if (getComputedStyle(el).position === "static") setTemp(el, "position", "relative");
    setTemp(el, "z-index", "1");
  });
  // The new tab's own highlight is hidden while the ghost travels to it.
  setTemp(to, "background-color", "transparent");
  setTemp(to, "background-image", "none");
  setTemp(to, "box-shadow", "none");
  setTemp(to, "border-color", "transparent");

  const ghost = document.createElement("span");
  ghost.setAttribute("aria-hidden", "true");
  Object.assign(ghost.style, {
    position: "absolute",
    zIndex: "0",
    pointerEvents: "none",
    boxSizing: "border-box",
    left: `${fromRect.left - offX}px`,
    top: `${fromRect.top - offY}px`,
    width: `${fromRect.width}px`,
    height: `${fromRect.height}px`,
    ...fromLook,
  });
  group.appendChild(ghost);

  const anim = ghost.animate(
    [
      { left: `${fromRect.left - offX}px`, top: `${fromRect.top - offY}px`, width: `${fromRect.width}px`, height: `${fromRect.height}px` },
      { left: `${toRect.left - offX}px`, top: `${toRect.top - offY}px`, width: `${toRect.width}px`, height: `${toRect.height}px` },
    ],
    { duration: 460, easing: SPRING, fill: "forwards" },
  );
  const done = () => {
    ghost.remove();
    restore.reverse().forEach(([el, prop, value, priority]) => {
      if (value) el.style.setProperty(prop, value, priority);
      else el.style.removeProperty(prop);
    });
  };
  anim.onfinish = done;
  anim.oncancel = done;
  setTimeout(() => ghost.isConnected && done(), 900);
}

function fadeIn(nodes, group) {
  const seen = new Set();
  let count = 0;
  nodes.forEach((node) => {
    if (count > 40 || !(node instanceof HTMLElement) || !node.isConnected) return;
    if (group.contains(node) || node.contains(group)) return;
    // Only the outermost added node of each subtree.
    for (let p = node.parentElement; p; p = p.parentElement) if (seen.has(p)) return;
    if (node.offsetHeight < 24 || getComputedStyle(node).position === "fixed") return;
    seen.add(node);
    count += 1;
    node.animate(
      [
        { opacity: 0, transform: "translateY(10px)", filter: "blur(4px)" },
        { opacity: 1, transform: "none", filter: "blur(0)" },
      ],
      { duration: 380, easing: EASE_OUT, delay: Math.min(count, 8) * 18 },
    );
  });
}

export function initGlassMotion() {
  if (typeof window === "undefined" || window.__glassMotion) return;
  window.__glassMotion = true;
  if (typeof Element.prototype.animate !== "function") return;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)");

  document.addEventListener(
    "pointerdown",
    (event) => {
      if (reduce?.matches || event.button !== 0) return;
      const target = event.target instanceof Element ? event.target.closest(ITEM) : null;
      if (!target || !target.closest(".gl-shell")) return;
      const group = target.parentElement;
      if (!group) return;
      const items = tabItems(group);
      if (items.length < 2 || items.length > 16 || !items.includes(target)) return;

      const before = items.map((el) => ({ el, sig: signature(el), rect: el.getBoundingClientRect(), look: look(getComputedStyle(el)) }));

      // Collect what the click adds to the page, to fade it in if it was a switch.
      const added = [];
      const scope = target.closest(".workspace-main-content") || document.body;
      const observer = new MutationObserver((records) => {
        records.forEach((r) => r.addedNodes.forEach((n) => added.push(n)));
      });

      const onClick = () => {
        observer.observe(scope, { childList: true, subtree: true });
        requestAnimationFrame(() => requestAnimationFrame(() => {
          const self = before.find((b) => b.el === target);
          const changedSelf = target.isConnected && signature(target) !== self.sig;
          const previous = before.find((b) => b.el !== target && b.el.isConnected && signature(b.el) !== b.sig);
          if (!changedSelf || !previous) {
            observer.disconnect();
            return;
          }
          if (isVisibleLook(previous.look)) slideHighlight(group, previous.el, target, previous.rect, previous.look);
          // Content that loads a moment later (a fetch) still gets the fade.
          fadeIn(added.splice(0), group);
          setTimeout(() => { fadeIn(added.splice(0), group); observer.disconnect(); }, 450);
        }));
      };
      target.addEventListener("click", onClick, { once: true });
      setTimeout(() => target.removeEventListener("click", onClick), 1500);
    },
    true,
  );
}
