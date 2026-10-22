/*
 * Glass loading screen, in the active theme (wallpaper, accent and light/dark
 * all come from the glass tokens). No spinner - the layout itself shimmers.
 *
 *   variant="app"     whole app while the shell or session loads: sidebar,
 *                     header and content placeholders on the wallpaper.
 *   variant="content" just the content area, used inside the shell while a
 *                     page's code loads, so the sidebar and header stay put.
 *   compact           sign-in and public pages: a single centred glass card.
 */

const Bar = ({ className = "", style }) => <div aria-hidden="true" className={`gl-skeleton ${className}`} style={style} />;

const glassCard = "rounded-[22px] border border-[var(--g-line)] bg-[var(--g-glass)] shadow-[var(--g-shadow)]";

const ContentPlaceholder = () => (
  <div className="flex flex-col gap-3.5">
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${glassCard} flex items-center gap-3 px-4 py-3.5`}>
          <Bar className="h-9 w-9 shrink-0 rounded-xl" />
          <div className="flex flex-1 flex-col gap-2"><Bar className="h-2.5 w-24 rounded-full" /><Bar className="h-3 w-40 max-w-full rounded-full" /></div>
        </div>
      ))}
    </div>
    <div className="flex flex-col gap-2 px-1 pt-1">
      <Bar className="h-6 w-64 max-w-[70%] rounded-lg" />
      <Bar className="h-3 w-80 max-w-[85%] rounded-full" />
    </div>
    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className={`${glassCard} flex flex-col gap-3 p-4`}>
          <div className="flex items-center gap-2.5"><Bar className="h-[38px] w-[38px] rounded-[13px]" /><Bar className="h-3 w-24 rounded-full" /></div>
          <Bar className="h-7 w-20 rounded-lg" />
          <Bar className="h-2.5 w-32 max-w-full rounded-full" />
        </div>
      ))}
    </div>
    <div className={`${glassCard} flex flex-col gap-3 p-4`}>
      <Bar className="h-4 w-40 rounded-full" />
      {[0, 1, 2, 3].map((i) => <Bar key={i} className="h-12 rounded-2xl" style={{ opacity: 1 - i * 0.15 }} />)}
    </div>
  </div>
);

const RouteLoadingSkeleton = ({ compact = false, variant = "app" }) => {
  if (variant === "content") {
    return (
      <div className="ui-page-shell h-full overflow-hidden" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading…</span>
        <ContentPlaceholder />
      </div>
    );
  }

  if (compact) {
    return (
      <div className="gl-loading-wall flex min-h-screen flex-1 items-center justify-center p-6" aria-busy="true" aria-live="polite">
        <span className="sr-only">Loading…</span>
        <div className={`${glassCard} flex w-[min(360px,100%)] flex-col items-center gap-4 p-6 [backdrop-filter:blur(var(--g-blur))_saturate(180%)]`}>
          <div className="flex h-[76px] w-full items-center justify-center rounded-[18px] bg-white px-4 py-2.5 shadow-[0_4px_14px_rgba(30,45,110,.14)]">
            <img src="/theofficeonrentlogo.png" alt="" className="max-h-full max-w-full object-contain" />
          </div>
          <Bar className="h-2 w-40 rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="gl-shell gl-loading-wall flex h-dvh w-full gap-3.5 overflow-hidden p-3.5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading your workspace…</span>
      <aside className="gl-sidebar hidden md:flex" aria-hidden="true">
        <div className="gl-sidebar-brand">
          <div className="gl-sidebar-logo"><img src="/theofficeonrentlogo.png" alt="" /></div>
          <Bar className="ml-1 h-5 w-16 rounded-full" />
        </div>
        <div className="flex flex-col gap-2 px-3.5 pt-1">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            i === 0 || i === 6
              ? <Bar key={i} className="mb-1 mt-2 h-2.5 w-16 rounded-full" />
              : <div key={i} className="flex h-[30px] items-center gap-3 px-2"><Bar className="h-4 w-4 rounded-md" /><Bar className="h-3 rounded-full" style={{ width: `${55 + ((i * 37) % 45)}%` }} /></div>
          ))}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col gap-3.5">
        <header className={`${glassCard} flex items-center gap-3 rounded-[24px] px-5 py-3.5 [backdrop-filter:blur(var(--g-blur))_saturate(180%)]`} aria-hidden="true">
          <div className="flex flex-1 flex-col gap-2"><Bar className="h-5 w-36 rounded-lg" /><Bar className="h-2.5 w-56 max-w-[60%] rounded-full" /></div>
          <Bar className="hidden h-[42px] w-72 rounded-[14px] lg:block" />
          {[0, 1, 2, 3].map((i) => <Bar key={i} className="hidden h-[42px] w-[42px] rounded-[14px] sm:block" />)}
          <Bar className="h-[42px] w-[42px] rounded-[14px]" />
        </header>
        <div className="min-h-0 flex-1 overflow-hidden"><ContentPlaceholder /></div>
      </div>
    </div>
  );
};

export default RouteLoadingSkeleton;
