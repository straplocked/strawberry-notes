/**
 * Client-side debug logger for diagnosing UI glitches.
 *
 * In DevTools console:
 *   sn.help()                    // print cheatsheet
 *   sn.on() / sn.off()           // enable / disable all output
 *   sn.only('editor', 'render')  // filter to specific namespaces
 *   sn.all()                     // re-enable everything
 *   sn.counters()                // show counter totals
 *   sn.resetCounters()
 *
 * Or set the filter directly:
 *   window.__snDebug = true
 *   window.__snDebug = false
 *   window.__snDebug = 'editor,render,store'
 *
 * Namespaces: net, mut, query, store, render, editor, ui, effect, save
 */

type DebugFilter = boolean | string;

declare global {
  interface Window {
    __snDebug?: DebugFilter;
    sn?: SnDevtools;
  }
}

const COLORS: Record<string, string> = {
  net: '#0091c2',
  mut: '#c26a00',
  query: '#0077c2',
  store: '#7b2bc2',
  render: '#1e8a3a',
  editor: '#d14a77',
  ui: '#5c5c5c',
  effect: '#888f00',
  save: '#c2440a',
};

const counters: Record<string, number> = Object.create(null);
const renderSeq: Record<string, number> = Object.create(null);

function resolveFilter(): true | false | Set<string> {
  if (typeof window === 'undefined') return false;
  const v = window.__snDebug;
  if (v === false) return false;
  if (v === true || v === undefined) return true;
  if (typeof v === 'string') {
    const s = v.trim();
    if (s === '' || s === '*') return true;
    return new Set(s.split(',').map((x) => x.trim()).filter(Boolean));
  }
  return true;
}

function isOn(ns: string): boolean {
  const f = resolveFilter();
  if (f === false) return false;
  if (f === true) return true;
  return f.has(ns);
}

function timeStr(): string {
  const ts = performance.now();
  const secs = (ts / 1000).toFixed(3);
  return `${secs.padStart(8, ' ')}s`;
}

function emit(
  level: 'log' | 'warn' | 'error',
  ns: string,
  event: string,
  meta?: unknown,
) {
  if (!isOn(ns)) return;
  const ts = timeStr();
  const color = COLORS[ns] ?? '#666';
  const fmt = `%c${ts}%c [${ns}]%c ${event}`;
  const tsStyle = 'color:#999';
  const nsStyle = `color:${color};font-weight:600`;
  if (meta !== undefined) {
    console[level](fmt, tsStyle, nsStyle, '', meta);
  } else {
    console[level](fmt, tsStyle, nsStyle, '');
  }
}

export function dlog(ns: string, event: string, meta?: unknown) {
  emit('log', ns, event, meta);
}

export function dwarn(ns: string, event: string, meta?: unknown) {
  emit('warn', ns, event, meta);
}

export function derr(ns: string, event: string, meta?: unknown) {
  emit('error', ns, event, meta);
}

export interface Timer {
  end(meta?: unknown): number;
}

export function dtime(ns: string, event: string): Timer {
  const t0 = performance.now();
  if (isOn(ns)) emit('log', ns, `▶ ${event}`);
  return {
    end(meta?: unknown) {
      const dt = performance.now() - t0;
      if (isOn(ns)) {
        const tag = `✓ ${event} (${dt.toFixed(1)}ms)`;
        emit('log', ns, tag, meta);
      }
      return dt;
    },
  };
}

/**
 * Increment a counter. Returns the new total. Useful for hot paths where
 * a per-event log would spam the console (e.g. `editor.onUpdate`).
 * Call `sn.counters()` from devtools to inspect.
 */
export function dcount(ns: string, event: string): number {
  const key = `${ns}:${event}`;
  counters[key] = (counters[key] ?? 0) + 1;
  return counters[key];
}

/**
 * Log a component render with an auto-incrementing sequence per component.
 * Drop in at the top of a component function:
 *   drender('Editor', { noteId: note?.id })
 */
export function drender(component: string, extras?: Record<string, unknown>) {
  const n = (renderSeq[component] = (renderSeq[component] ?? 0) + 1);
  if (!isOn('render')) return n;
  emit('log', 'render', `${component} #${n}`, extras);
  return n;
}

/**
 * Group a set of logs under a collapsed console header. The fn runs
 * synchronously and anything it logs ends up inside the group.
 */
export function dgroup<T>(ns: string, label: string, fn: () => T): T {
  if (!isOn(ns)) return fn();
  const color = COLORS[ns] ?? '#666';
  console.groupCollapsed(
    `%c${timeStr()}%c [${ns}]%c ${label}`,
    'color:#999',
    `color:${color};font-weight:600`,
    '',
  );
  try {
    return fn();
  } finally {
    console.groupEnd();
  }
}

interface SnDevtools {
  on(): void;
  off(): void;
  all(): void;
  only(...ns: string[]): void;
  status(): string;
  counters(): Record<string, number>;
  resetCounters(): void;
  renders(): Record<string, number>;
  resetRenders(): void;
  help(): void;
}

function installDevtools() {
  if (typeof window === 'undefined') return;
  if (window.__snDebug === undefined) window.__snDebug = true;
  const sn: SnDevtools = {
    on() {
      window.__snDebug = true;
      console.log('[sn] debug on (all namespaces)');
    },
    off() {
      window.__snDebug = false;
      console.log('[sn] debug off');
    },
    all() {
      this.on();
    },
    only(...ns: string[]) {
      window.__snDebug = ns.join(',');
      console.log(`[sn] debug filtered to: ${ns.join(', ')}`);
    },
    status() {
      const f = resolveFilter();
      const desc = f === true ? 'all' : f === false ? 'off' : `only ${[...f].join(', ')}`;
      console.log(`[sn] debug: ${desc}`);
      return desc;
    },
    counters() {
      console.table(counters);
      return { ...counters };
    },
    resetCounters() {
      for (const k of Object.keys(counters)) delete counters[k];
      console.log('[sn] counters reset');
    },
    renders() {
      console.table(renderSeq);
      return { ...renderSeq };
    },
    resetRenders() {
      for (const k of Object.keys(renderSeq)) delete renderSeq[k];
      console.log('[sn] render counts reset');
    },
    help() {
      console.log(
        [
          'sn.on() / sn.off()                  — toggle all output',
          "sn.only('editor', 'render')         — filter to namespaces",
          'sn.all()                            — re-enable all',
          'sn.status()                         — current filter',
          'sn.counters() / sn.resetCounters()  — counter totals',
          'sn.renders()  / sn.resetRenders()   — per-component render counts',
          '',
          'Namespaces: ' + Object.keys(COLORS).join(', '),
        ].join('\n'),
      );
    },
  };
  window.sn = sn;
}

installDevtools();
