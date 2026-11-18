window.__ModuleLoader__.load({
  id: 'dsh-open-with-control',
  factory(require) {
    const React = require('react');
    const ReactDOM = require('react-dom');
    const h = React.createElement;

    /** Locale namespace owned by this plugin. */
    const NS = 'open-with-control';
    /** Header utilities cell this entry replaces (the shipped open-in-app control). */
    const SLOT = 'conversation.session.header.utilities';
    /** Shipped catalog routes; relative so the page's own origin applies. */
    const SHIPPED_APPS_ROUTE = 'open-in-app/apps';
    const SHIPPED_ICON_ROUTE = 'open-in-app/icon';
    const SHIPPED_OPEN_ROUTE = 'open-in-app/open';
    /** This plugin's host routes. */
    const STATE_ROUTE = 'open-with-control/state';
    const OPEN_ROUTE = 'open-with-control/open';
    /** Host route listing installed system applications (macOS / Windows). */
    const SYSTEM_APPS_ROUTE = 'open-with-control/system-apps';
    /** Same route, asking for every installed application instead of the allowlist. */
    const SYSTEM_APPS_ALL_ROUTE = 'open-with-control/system-apps?all=1';
    /** Host route launching one system application on one directory. */
    const SYSTEM_OPEN_ROUTE = 'open-with-control/system-open';
    /** Host route serving one system application's PNG icon. */
    const SYSTEM_ICON_ROUTE = 'open-with-control/system-icon';
    /** Menu width, matching the density of the shipped opening control. */
    const MENU_WIDTH = 248;

    /** Fallback display names, used when the shipped locale namespace is absent. */
    const APP_NAMES = {
      finder: 'Finder',
      explorer: 'File Explorer',
      filemanager: 'Files',
      cursor: 'Cursor',
      vscode: 'VS Code',
      vscodeinsiders: 'VS Code Insiders',
      windsurf: 'Windsurf',
      zed: 'Zed',
      sublimetext: 'Sublime Text',
      xcode: 'Xcode',
      androidstudio: 'Android Studio',
      intellij: 'IntelliJ IDEA',
      pycharm: 'PyCharm',
      webstorm: 'WebStorm',
      phpstorm: 'PhpStorm',
      goland: 'GoLand',
      rider: 'Rider',
      rustrover: 'RustRover',
      fork: 'Fork',
      sourcetree: 'Sourcetree',
      github: 'GitHub Desktop',
      tower: 'Tower',
      gitkraken: 'GitKraken',
      smartgit: 'SmartGit',
      sublimemerge: 'Sublime Merge',
      ghostty: 'Ghostty',
      warp: 'Warp',
      iterm: 'iTerm2',
      kitty: 'kitty',
      terminal: 'Terminal',
      windowsterminal: 'Windows Terminal',
      gitbash: 'Git Bash',
      gnometerminal: 'GNOME Terminal',
      konsole: 'Konsole',
    };

    /** One tiny observable store, so the header control and the overlay panels share one truth. */
    function createStore(initial) {
      let value = initial;
      const listeners = new Set();
      return {
        getSnapshot: () => value,
        subscribe: (listener) => {
          listeners.add(listener);
          return () => {
            listeners.delete(listener);
          };
        },
        set: (next) => {
          value = next;
          for (const listener of [...listeners]) listener();
        },
      };
    }

    /** Subscribe to one slice of a store. */
    function useStore(store, select) {
      const snapshot = React.useSyncExternalStore(
        store.subscribe,
        store.getSnapshot,
        store.getSnapshot,
      );
      return select(snapshot);
    }

    /** The empty preference document, identical to the host's normalization. */
    function emptyState() {
      return { version: 1, hidden: [], order: [], defaultApp: null, custom: [] };
    }

    /** Read one JSON route, resolving null on any transport or status failure. */
    async function readJson(url, init) {
      try {
        const response = await fetch(url, init);
        if (!response.ok) return null;
        return await response.json();
      } catch {
        return null;
      }
    }

    /** Persist the whole preference document; resolves to the stored form or null. */
    function saveState(next) {
      return readJson(STATE_ROUTE, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(next),
      });
    }

    /** Normalize a preference payload that arrived over the wire. */
    function mergeState(value) {
      const base = emptyState();
      if (typeof value !== 'object' || value === null) return base;
      return {
        version: 1,
        hidden: Array.isArray(value.hidden) ? value.hidden.filter((id) => typeof id === 'string') : [],
        order: Array.isArray(value.order) ? value.order.filter((id) => typeof id === 'string') : [],
        defaultApp: typeof value.defaultApp === 'string' ? value.defaultApp : null,
        custom: Array.isArray(value.custom)
          ? value.custom
              .filter(
                (entry) =>
                  typeof entry === 'object' &&
                  entry !== null &&
                  typeof entry.id === 'string' &&
                  typeof entry.label === 'string' &&
                  typeof entry.command === 'string' &&
                  Array.isArray(entry.args),
              )
              .map((entry) => ({
                id: entry.id,
                label: entry.label,
                command: entry.command,
                args: entry.args.filter((arg) => typeof arg === 'string'),
                system: entry.system === true,
                path: typeof entry.path === 'string' ? entry.path : null,
                icon: typeof entry.icon === 'string' ? entry.icon : null,
              }))
          : [],
      };
    }

    /** Resolve an application's display name, preferring the shipped locale dictionary. */
    function appName(shippedT, id) {
      const key = `app.${id}`;
      const text = shippedT(key);
      if (typeof text === 'string' && text !== '' && text !== key) return text;
      return APP_NAMES[id] ?? id;
    }

    /** Apply stored preferences to the catalog, producing the visible, ordered rows. */
    function arrange(prefs, catalog, shippedT) {
      const hidden = new Set(prefs.hidden);
      const orderIndex = new Map(prefs.order.map((id, index) => [id, index]));
      const rows = [];
      catalog.forEach((id, index) => {
        rows.push({
          id,
          kind: 'catalog',
          index,
          rank: orderIndex.has(id) ? orderIndex.get(id) : 10_000 + index,
          name: appName(shippedT, id),
          icon: `${SHIPPED_ICON_ROUTE}/${encodeURIComponent(id)}`,
        });
      });
      prefs.custom.forEach((entry, index) => {
        rows.push({
          id: entry.id,
          kind: entry.system === true ? 'system' : 'custom',
          entry,
          index: catalog.length + index,
          rank: orderIndex.has(entry.id) ? orderIndex.get(entry.id) : 20_000 + index,
          name: entry.label,
          icon: typeof entry.icon === 'string' ? entry.icon : null,
        });
      });
      return rows
        .filter((row) => !hidden.has(row.id))
        .sort((left, right) => (left.rank === right.rank ? left.index - right.index : left.rank - right.rank));
    }

    /** Everything the header control and the panels act on. */
    function createController() {
      const state = createStore({
        prefs: emptyState(),
        catalog: [],
        loaded: false,
        loading: false,
        dialog: false,
        busy: false,
        notice: null,
        /** Installed applications matching the developer allowlist; null until read. */
        sysApps: null,
        /** Every installed application the host can see; null until read. */
        sysAppsAll: null,
        /** Which of the two lists the picker shows. */
        sysMode: 'whitelist',
        sysDialogOpen: false,
        sysBrowsing: false,
      });
      let noticeSeq = 0;

      const patch = (next) => state.set({ ...state.getSnapshot(), ...next });

      const announce = (text, tone = 'info') => {
        noticeSeq += 1;
        patch({ notice: { text, tone, seq: noticeSeq } });
      };

      const dismissNotice = () => patch({ notice: null });

      const load = async () => {
        const current = state.getSnapshot();
        if (current.loaded || current.loading) return;
        patch({ loading: true });
        const [prefs, apps] = await Promise.all([
          readJson(STATE_ROUTE),
          readJson(SHIPPED_APPS_ROUTE, { headers: { accept: 'application/json' } }),
        ]);
        patch({
          prefs: mergeState(prefs),
          catalog:
            apps !== null && Array.isArray(apps.apps)
              ? apps.apps.filter((id) => typeof id === 'string')
              : [],
          loaded: true,
          loading: false,
        });
      };

      /** Store a full document; the optimistic value is replaced by what the host kept. */
      const persist = async (next, t) => {
        patch({ prefs: next });
        const stored = await saveState(next);
        if (stored === null) {
          announce(t('preferences.notSaved'), 'error');
          return false;
        }
        patch({ prefs: mergeState(stored) });
        return true;
      };

      /** Launch one row on one absolute directory; announces the settled outcome. */
      const open = async (row, path, t) => {
        if (row === undefined) return;
        if (path === undefined || path === null) {
          announce(t('notice.noTarget'), 'error');
          return;
        }
        patch({ busy: true });
        const response =
          row.kind === 'custom'
            ? await readJson(OPEN_ROUTE, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ custom: row.id, path }),
              })
            : row.kind === 'system'
              ? await readJson(SYSTEM_OPEN_ROUTE, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ application: row.entry.path, path }),
                })
              : await readJson(SHIPPED_OPEN_ROUTE, {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ app: row.id, path }),
                });
        patch({ busy: false });
        if (response === null || response.ok !== true) {
          announce(t('notice.openFailed', { app: row.name }), 'error');
        }
      };

      /**
       * Read one of the two installed-application lists. The allowlist is the
       * default view; the full list is asked for with `?all=1`, so the choice
       * stays a view preference and never becomes stored state.
       */
      const readSystemApps = async (mode, t) => {
        patch({ sysBrowsing: true });
        const apps = await readJson(
          mode === 'all' ? SYSTEM_APPS_ALL_ROUTE : SYSTEM_APPS_ROUTE,
          { headers: { accept: 'application/json' } },
        );
        const list = Array.isArray(apps) ? apps : [];
        patch(mode === 'all' ? { sysBrowsing: false, sysAppsAll: list } : { sysBrowsing: false, sysApps: list });
        if (!Array.isArray(apps)) announce(t('systemApps.failed'), 'error');
      };

      /** Open the picker on the allowlist, reading it on the first visit. */
      const openPicker = async (t) => {
        patch({ sysDialogOpen: true, sysMode: 'whitelist' });
        if (state.getSnapshot().sysApps === null) await readSystemApps('whitelist', t);
      };

      const closePicker = () => patch({ sysDialogOpen: false });

      /** Switch the picker between the allowlist and every installed application. */
      const setSystemMode = async (mode, t) => {
        patch({ sysMode: mode });
        const current = state.getSnapshot();
        const cached = mode === 'all' ? current.sysAppsAll : current.sysApps;
        if (cached === null) await readSystemApps(mode, t);
      };

      return {
        state,
        patch,
        announce,
        dismissNotice,
        load,
        persist,
        open,
        openPicker,
        closePicker,
        setSystemMode,
      };
    }

    /** Fixed positioning for a portaled menu, because the header clips overflow. */
    function useAnchoredMenu(open, anchorRef) {
      const [position, setPosition] = React.useState(null);
      React.useLayoutEffect(() => {
        if (!open) {
          setPosition(null);
          return undefined;
        }
        const place = () => {
          const node = anchorRef.current;
          if (node === null) return;
          const rect = node.getBoundingClientRect();
          const margin = 8;
          const left = Math.min(
            Math.max(rect.right - MENU_WIDTH, margin),
            Math.max(margin, window.innerWidth - MENU_WIDTH - margin),
          );
          setPosition({
            left,
            top: rect.bottom + 4,
            maxHeight: Math.max(160, window.innerHeight - rect.bottom - 20),
          });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
          window.removeEventListener('resize', place);
          window.removeEventListener('scroll', place, true);
        };
      }, [open, anchorRef]);
      return position;
    }

    /** Hide an image whose route has no icon, instead of showing a broken glyph. */
    function hideBrokenIcon(event) {
      event.currentTarget.style.visibility = 'hidden';
    }

    /** Glyphs; currentColor keeps them on the host's label colors. */
    const Icon = {
      chevron: () =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: 10,
            height: 10,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          },
          h('path', { d: 'M4 6l4 4 4-4' }),
        ),
      check: () =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: 12,
            height: 12,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.8,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          },
          h('path', { d: 'M3 8.5l3.2 3L13 4.5' }),
        ),
      app: (size) =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: size ?? 13,
            height: size ?? 13,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          },
          h('rect', { x: 2, y: 3.5, width: 12, height: 9, rx: 2 }),
          h('path', { d: 'M2 6.5h12' }),
        ),
      gear: (size) =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: size ?? 12,
            height: size ?? 12,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          },
          h('circle', { cx: 8, cy: 8, r: 2.2 }),
          h('path', {
            d: 'M8 1.9v1.7M8 12.4v1.7M2.6 8H1M15 8h-1.6M4.2 4.2L3 3M13 13l-1.2-1.2M11.8 4.2L13 3M3 13l1.2-1.2',
          }),
        ),
      close: (size) =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: size ?? 14,
            height: size ?? 14,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            'aria-hidden': true,
          },
          h('path', { d: 'M4 4l8 8M12 4l-8 8' }),
        ),
      up: () =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: 12,
            height: 12,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          },
          h('path', { d: 'M8 12.5v-9M4 7.5l4-4 4 4' }),
        ),
      down: () =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: 12,
            height: 12,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.6,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          },
          h('path', { d: 'M8 3.5v9M4 8.5l4 4 4-4' }),
        ),
      search: () =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: 13,
            height: 13,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.5,
            strokeLinecap: 'round',
            'aria-hidden': true,
          },
          h('circle', { cx: 7, cy: 7, r: 4.1 }),
          h('path', { d: 'M10.2 10.2l3.1 3.1' }),
        ),
      folder: (size) =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: size ?? 14,
            height: size ?? 14,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          },
          h('path', { d: 'M1.9 4.7c0-.8.6-1.4 1.4-1.4h2.2l1.3 1.6h5.5c.8 0 1.4.6 1.4 1.4v5c0 .8-.6 1.4-1.4 1.4H3.3c-.8 0-1.4-.6-1.4-1.4z' }),
        ),
      layers: (size) =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: size ?? 13,
            height: size ?? 13,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
          },
          h('path', { d: 'M8 2.3l5.3 2.8L8 7.9 2.7 5.1z' }),
          h('path', { d: 'M2.7 8.1L8 10.9l5.3-2.8' }),
          h('path', { d: 'M2.7 11.1L8 13.9l5.3-2.8' }),
        ),
    };

    /** One application glyph: the real icon when the host can supply it. */
    function AppGlyph(props) {
      const { icon, size = 18 } = props;
      if (typeof icon !== 'string' || icon === '') {
        return h('span', { className: 'owc-glyph', style: { width: size, height: size } }, Icon.app(size - 4));
      }
      return h('img', {
        className: 'owc-icon',
        style: { width: size, height: size },
        src: icon,
        alt: '',
        draggable: false,
        onError: hideBrokenIcon,
      });
    }

    /** The split button in the session header. */
    function OpenWithAction(props) {
      const { controller, shippedT, t, useSessions, sessionId } = props;
      const [menuOpen, setMenuOpen] = React.useState(false);
      const rootRef = React.useRef(null);
      const menuRef = React.useRef(null);
      const snapshot = useStore(controller.state, (value) => value);
      const cwd = useSessions((state) => state.byId[sessionId]?.cwd);
      const position = useAnchoredMenu(menuOpen, rootRef);

      React.useEffect(() => {
        controller.load();
      }, [controller]);

      React.useEffect(() => {
        if (!menuOpen) return undefined;
        const onPointerDown = (event) => {
          if (!(event.target instanceof Node)) return;
          if (rootRef.current?.contains(event.target) === true) return;
          if (menuRef.current?.contains(event.target) === true) return;
          setMenuOpen(false);
        };
        const onKeyDown = (event) => {
          if (event.key === 'Escape') setMenuOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
          document.removeEventListener('pointerdown', onPointerDown);
          document.removeEventListener('keydown', onKeyDown);
        };
      }, [menuOpen]);

      if (cwd === undefined || cwd === null) return null;
      if (!snapshot.loaded) return null;

      const rows = arrange(snapshot.prefs, snapshot.catalog, shippedT);
      const preferred = rows.find((row) => row.id === snapshot.prefs.defaultApp) ?? rows[0];
      const disabled = snapshot.busy;

      const run = (row) => {
        setMenuOpen(false);
        // Selecting an application makes it the new default, then opens with it.
        if (row.id !== snapshot.prefs.defaultApp) {
          controller.persist({ ...snapshot.prefs, defaultApp: row.id }, t);
        }
        controller.open(row, cwd, t);
      };

      /** The portaled menu; the header clips overflow, so it cannot live in place. */
      const menu =
        menuOpen && position !== null
          ? ReactDOM.createPortal(
              h(
                'div',
                {
                  className: 'owc-menu',
                  role: 'menu',
                  ref: menuRef,
                  style: { left: position.left, top: position.top, maxHeight: position.maxHeight },
                },
                h('div', { className: 'owc-menuLabel' }, t('action.menuLabel')),
                rows.map((row) =>
                  h(
                    'button',
                    {
                      key: row.id,
                      type: 'button',
                      role: 'menuitemradio',
                      className: 'owc-item',
                      'aria-checked': preferred !== undefined && row.id === preferred.id,
                      onClick: () => run(row),
                    },
                    h(
                      'span',
                      { className: 'owc-mark' },
                      preferred !== undefined && row.id === preferred.id ? Icon.check() : null,
                    ),
                    h(AppGlyph, { icon: row.icon, size: 16 }),
                    h('span', { className: 'owc-itemName' }, row.name),
                    preferred !== undefined && row.id === preferred.id
                      ? h('span', { className: 'owc-itemHint' }, t('action.defaultTag'))
                      : null,
                  ),
                ),
                h('div', { className: 'owc-sep' }),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'owc-item',
                    onClick: () => {
                      setMenuOpen(false);
                      controller.patch({ dialog: true });
                    },
                  },
                  h('span', { className: 'owc-mark' }, Icon.gear(12)),
                  h('span', { className: 'owc-itemName' }, t('action.manage')),
                ),
              ),
              document.body,
            )
          : null;

      return h(
        React.Fragment,
        null,
        h(
          'div',
          { className: 'owc-wrap', ref: rootRef, 'data-open-with-control': '' },
          preferred === undefined
            ? h(
                'button',
                {
                  type: 'button',
                  className: 'owc-single',
                  title: t('action.manage'),
                  'aria-label': t('action.manage'),
                  'aria-haspopup': 'menu',
                  'aria-expanded': menuOpen,
                  onClick: () => setMenuOpen((value) => !value),
                },
                Icon.gear(13),
              )
            : h(
                'div',
                { className: 'owc-split' },
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'owc-main',
                    disabled,
                    title: t('action.openIn', { app: preferred.name }),
                    'aria-label': t('action.openIn', { app: preferred.name }),
                    onClick: () => run(preferred),
                  },
                  h(AppGlyph, { icon: preferred.icon, size: 14 }),
                ),
                h(
                  'button',
                  {
                    type: 'button',
                    className: 'owc-chevron',
                    disabled,
                    title: t('action.more'),
                    'aria-label': t('action.more'),
                    'aria-haspopup': 'menu',
                    'aria-expanded': menuOpen,
                    onClick: () => setMenuOpen((value) => !value),
                  },
                  Icon.chevron(),
                ),
              ),
        ),
        menu,
      );
    }

    /** Stable, host-acceptable id for one system application label. */
    function systemIdFor(label) {
      return `sys:${label.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')}`;
    }

    /**
     * The application directory: every installed application the host reports,
     * the allowlist first and the full list one toggle away.
     */
    function SystemAppsDialog(props) {
      const { controller, t } = props;
      const snapshot = useStore(controller.state, (value) => value);
      const [picked, setPicked] = React.useState([]);
      const [filter, setFilter] = React.useState('');

      React.useEffect(() => {
        if (!snapshot.sysDialogOpen) return undefined;
        setPicked([]);
        setFilter('');
        const onKeyDown = (event) => {
          if (event.key === 'Escape') controller.closePicker();
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [snapshot.sysDialogOpen, controller]);

      if (!snapshot.sysDialogOpen) return null;

      const showAll = snapshot.sysMode === 'all';
      const apps = (showAll ? snapshot.sysAppsAll : snapshot.sysApps) ?? [];
      const added = new Set(snapshot.prefs.custom.map((entry) => entry.id));
      const needle = filter.trim().toLowerCase();
      const shown = apps.filter(
        (app) =>
          needle === '' ||
          app.label.toLowerCase().includes(needle) ||
          String(app.path ?? '').toLowerCase().includes(needle),
      );
      const isPicked = (id) => picked.includes(id);
      const toggle = (id) =>
        setPicked((current) => (current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]));

      const adopt = async () => {
        const currentPrefs = snapshot.prefs;
        const next = { ...currentPrefs, custom: [...currentPrefs.custom], order: [...currentPrefs.order] };
        for (const app of apps) {
          if (!isPicked(app.id)) continue;
          const id = systemIdFor(app.label);
          if (next.custom.some((entry) => entry.id === id)) continue;
          next.custom.push({
            id,
            label: app.label,
            command: app.path,
            args: [],
            system: true,
            path: app.path,
            icon: `${SYSTEM_ICON_ROUTE}?path=${encodeURIComponent(app.path)}`,
          });
          if (!next.order.includes(id)) next.order.push(id);
        }
        await controller.persist(next, t);
        setPicked([]);
        controller.closePicker();
      };

      const emptyView = showAll
        ? h(
            'div',
            { className: 'owc-empty' },
            h('span', { className: 'owc-emptyIcon' }, Icon.layers(16)),
            h('p', { className: 'owc-emptyText' }, t('systemApps.none')),
          )
        : h(
            'div',
            { className: 'owc-empty' },
            h('span', { className: 'owc-emptyIcon' }, Icon.layers(16)),
            h('p', { className: 'owc-emptyText' }, t('systemApps.noneWhitelist')),
            h('p', { className: 'owc-emptyHint' }, t('systemApps.noneWhitelistHint')),
          );

      const listBody = snapshot.sysBrowsing
        ? h(
            'div',
            { className: 'owc-empty' },
            h('span', { className: 'owc-spinner' }),
            h('p', { className: 'owc-emptyText' }, t('systemApps.running')),
          )
        : apps.length === 0
          ? emptyView
          : shown.length === 0
            ? h(
                'div',
                { className: 'owc-empty' },
                h('span', { className: 'owc-emptyIcon' }, Icon.search()),
                h('p', { className: 'owc-emptyText' }, t('systemApps.noMatch', { query: filter.trim() })),
              )
            : shown.map((app) => {
                const isAdded = added.has(systemIdFor(app.label));
                const pickedNow = isPicked(app.id);
                return h(
                  'label',
                  {
                    className: 'owc-row owc-pickRow',
                    key: app.id,
                    'data-picked': pickedNow ? 'true' : 'false',
                    'data-added': isAdded ? 'true' : 'false',
                  },
                  h('input', {
                    type: 'checkbox',
                    className: 'owc-check',
                    checked: isAdded || pickedNow,
                    disabled: isAdded,
                    onChange: () => toggle(app.id),
                  }),
                  h(AppGlyph, { icon: `${SYSTEM_ICON_ROUTE}?path=${encodeURIComponent(app.path)}`, size: 20 }),
                  h(
                    'span',
                    { className: 'owc-rowMain' },
                    h(
                      'span',
                      { className: 'owc-rowTitle' },
                      h('span', { className: 'owc-rowName' }, app.label),
                      isAdded ? h('span', { className: 'owc-tag' }, t('systemApps.tagAdded')) : null,
                    ),
                    h('span', { className: 'owc-rowMeta' }, app.path),
                  ),
                );
              });

      return h(
        'div',
        {
          className: 'owc-overlay',
          role: 'presentation',
          onPointerDown: (event) => {
            if (event.target === event.currentTarget) controller.closePicker();
          },
        },
        h(
          'div',
          {
            className: 'owc-dialog owc-dialogWide',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': t('systemApps.title'),
          },
          h(
            'div',
            { className: 'owc-head' },
            h('span', { className: 'owc-headIcon' }, Icon.folder(17)),
            h(
              'div',
              { className: 'owc-headText' },
              h('h2', { className: 'owc-title' }, t('systemApps.title')),
              h('p', { className: 'owc-sub' }, t('systemApps.subtitle')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'owc-close',
                'aria-label': t('manage.close'),
                onClick: () => controller.closePicker(),
              },
              Icon.close(14),
            ),
          ),
          h(
            'div',
            { className: 'owc-toolbar' },
            h(
              'div',
              { className: 'owc-search' },
              Icon.search(),
              h('input', {
                type: 'text',
                className: 'owc-input',
                value: filter,
                spellCheck: false,
                autoFocus: true,
                placeholder: t('systemApps.filterPlaceholder'),
                'aria-label': t('systemApps.filterPlaceholder'),
                onChange: (event) => setFilter(event.target.value),
              }),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'owc-chip',
                'aria-pressed': showAll,
                onClick: () => controller.setSystemMode(showAll ? 'whitelist' : 'all', t),
              },
              Icon.layers(),
              h('span', {}, showAll ? t('systemApps.showWhitelist') : t('systemApps.showAll')),
            ),
          ),
          h(
            'div',
            { className: 'owc-body' },
            h(
              'div',
              { className: 'owc-hgroup' },
              h('span', { className: 'owc-hlabel' }, showAll ? t('systemApps.foundAll') : t('systemApps.found')),
              h('span', { className: 'owc-count' }, String(shown.length)),
            ),
            h('div', { className: 'owc-list' }, listBody),
          ),
          h(
            'div',
            { className: 'owc-foot' },
            h(
              'span',
              { className: 'owc-footNote' },
              picked.length > 0
                ? t('systemApps.selected', { n: picked.length })
                : showAll
                  ? t('systemApps.countAll', { n: shown.length })
                  : t('systemApps.footHint'),
            ),
            h(
              'div',
              { className: 'owc-footActions' },
              h(
                'button',
                { type: 'button', className: 'owc-btn', onClick: () => controller.closePicker() },
                t('systemApps.cancel'),
              ),
              h(
                'button',
                {
                  type: 'button',
                  className: 'owc-btn owc-btnPrimary',
                  disabled: snapshot.sysBrowsing || picked.length === 0,
                  onClick: adopt,
                },
                t('systemApps.addSelected'),
              ),
            ),
          ),
        ),
      );
    }

    /** Visibility, ordering, default choice, and user-added launchers. */
    function ManageDialog(props) {
      const { controller, shippedT, t } = props;
      const snapshot = useStore(controller.state, (value) => value);
      const [hiddenOpen, setHiddenOpen] = React.useState(false);

      React.useEffect(() => {
        if (!snapshot.dialog) return undefined;
        const onKeyDown = (event) => {
          // The picker stacks above this dialog and owns Escape while it is open.
          if (event.key !== 'Escape' || snapshot.sysDialogOpen) return;
          controller.patch({ dialog: false });
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [snapshot.dialog, snapshot.sysDialogOpen, controller]);

      if (!snapshot.dialog) return null;

      const { prefs, catalog } = snapshot;
      const all = arrange(prefs, catalog, shippedT);
      // At least one application must stay in the menu: the last visible row
      // can neither be hidden nor removed.
      const lastVisible = all.length === 1;
      const hiddenRows = catalog
        .filter((id) => prefs.hidden.includes(id))
        .map((id) => ({ id, kind: 'catalog', name: appName(shippedT, id), icon: `${SHIPPED_ICON_ROUTE}/${encodeURIComponent(id)}` }));
      const hiddenCustom = prefs.custom
        .filter((entry) => prefs.hidden.includes(entry.id))
        .map((entry) => ({
          id: entry.id,
          kind: entry.system === true ? 'system' : 'custom',
          entry,
          name: entry.label,
          icon: typeof entry.icon === 'string' ? entry.icon : null,
        }));
      const hidden = hiddenRows.concat(hiddenCustom);

      const commit = (next) => controller.persist(next, t);

      const move = (row, delta) => {
        const ids = all.map((entry) => entry.id);
        const from = ids.indexOf(row.id);
        const to = from + delta;
        if (from < 0 || to < 0 || to >= ids.length) return;
        ids.splice(to, 0, ids.splice(from, 1)[0]);
        commit({ ...prefs, order: ids });
      };

      const setDefault = (row) => commit({ ...prefs, defaultApp: row.id });

      const hide = (row) =>
        commit({
          ...prefs,
          hidden: [...new Set([...prefs.hidden, row.id])],
          defaultApp: prefs.defaultApp === row.id ? null : prefs.defaultApp,
        });

      const show = (row) =>
        commit({
          ...prefs,
          hidden: prefs.hidden.filter((id) => id !== row.id),
          order: [...prefs.order.filter((id) => id !== row.id), row.id],
        });

      const removeCustom = (row) =>
        commit({
          ...prefs,
          custom: prefs.custom.filter((entry) => entry.id !== row.id),
          hidden: prefs.hidden.filter((id) => id !== row.id),
          order: prefs.order.filter((id) => id !== row.id),
          defaultApp: prefs.defaultApp === row.id ? null : prefs.defaultApp,
        });

      /**
       * One "remove" gesture for every row, with the strongest effect each
       * kind allows. A catalog application cannot be deleted — the host
       * re-discovers it on every load — so removing it records it as removed;
       * a user-added or system application is dropped from storage entirely.
       */
      const remove = (row) => (row.kind === 'catalog' ? hide(row) : removeCustom(row));

      const visibleRow = (row) =>
        h(
          'div',
          { className: 'owc-row', key: row.id },
          h(AppGlyph, { icon: row.icon, size: 20 }),
          h(
            'span',
            { className: 'owc-rowMain' },
            h(
              'span',
              { className: 'owc-rowTitle' },
              h('span', { className: 'owc-rowName' }, row.name),
              prefs.defaultApp === row.id
                ? h('span', { className: 'owc-tag owc-tagDefault' }, t('manage.defaultTag'))
                : null,
            ),
            row.kind === 'custom'
              ? h(
                  'span',
                  { className: 'owc-rowMeta' },
                  `${row.entry.command}${row.entry.args.length > 0 ? ` · ${row.entry.args.join(' ')}` : ''}`,
                )
              : null,
          ),
          h(
            'span',
            { className: 'owc-rowActions' },
            h(
              'button',
              {
                type: 'button',
                className: 'owc-btn owc-btnPlain',
                disabled: all[0] === undefined || all[0].id === row.id,
                title: t('manage.moveUp'),
                'aria-label': t('manage.moveUp'),
                onClick: () => move(row, -1),
              },
              Icon.up(),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'owc-btn owc-btnPlain',
                disabled: all[all.length - 1] === undefined || all[all.length - 1].id === row.id,
                title: t('manage.moveDown'),
                'aria-label': t('manage.moveDown'),
                onClick: () => move(row, 1),
              },
              Icon.down(),
            ),
            // The default row keeps an invisible placeholder, so the move
            // arrows and the remove button stay in one column across rows.
            prefs.defaultApp === row.id
              ? h(
                  'button',
                  {
                    type: 'button',
                    className: 'owc-btn owc-btnOutline',
                    'aria-hidden': true,
                    tabIndex: -1,
                    style: { visibility: 'hidden' },
                  },
                  t('manage.makeDefault'),
                )
              : h(
                  'button',
                  {
                    type: 'button',
                    className: 'owc-btn owc-btnOutline',
                    onClick: () => setDefault(row),
                  },
                  t('manage.makeDefault'),
                ),
            h(
              'button',
              {
                type: 'button',
                className: 'owc-btn owc-btnDanger',
                disabled: lastVisible,
                title: lastVisible ? t('manage.keepOne') : undefined,
                onClick: () => remove(row),
              },
              t('manage.remove'),
            ),
          ),
        );

      return h(
        'div',
        {
          className: 'owc-overlay',
          role: 'presentation',
          onPointerDown: (event) => {
            if (event.target === event.currentTarget) controller.patch({ dialog: false });
          },
        },
        h(
          'div',
          { className: 'owc-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('manage.title') },
          h(
            'div',
            { className: 'owc-head' },
            h('span', { className: 'owc-headIcon' }, Icon.gear(17)),
            h(
              'div',
              { className: 'owc-headText' },
              h('h2', { className: 'owc-title' }, t('manage.title')),
              h('p', { className: 'owc-sub' }, t('manage.subtitle')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'owc-close',
                'aria-label': t('manage.close'),
                onClick: () => controller.patch({ dialog: false }),
              },
              Icon.close(14),
            ),
          ),
          h(
            'div',
            { className: 'owc-body' },
            h(
              'div',
              { className: 'owc-hgroup' },
              h('span', { className: 'owc-hlabel' }, t('manage.visible')),
              h('span', { className: 'owc-count' }, String(all.length)),
            ),
            all.length === 0
              ? h('p', { className: 'owc-note' }, t('manage.noVisible'))
              : h('div', { className: 'owc-list' }, all.map(visibleRow)),
            hidden.length > 0
              ? h(
                  React.Fragment,
                  null,
                  h(
                    'div',
                    { className: 'owc-hgroup' },
                    h(
                      'button',
                      {
                        type: 'button',
                        className: 'owc-disclosure',
                        'aria-expanded': hiddenOpen,
                        onClick: () => setHiddenOpen((value) => !value),
                      },
                      h('span', { className: 'owc-caret' }, Icon.chevron()),
                      h('span', {}, t('manage.hidden')),
                      h('span', { className: 'owc-count' }, String(hidden.length)),
                    ),
                  ),
                  hiddenOpen
                    ? h(
                        'div',
                        { className: 'owc-list' },
                        hidden.map((row) =>
                          h(
                            'div',
                            { className: 'owc-row', key: row.id },
                            h(AppGlyph, { icon: row.icon, size: 20 }),
                            h(
                              'span',
                              { className: 'owc-rowMain' },
                              h('span', { className: 'owc-rowName' }, row.name),
                              row.kind === 'custom' && row.entry !== undefined
                                ? h('span', { className: 'owc-rowMeta' }, row.entry.command)
                                : null,
                            ),
                            h(
                              'span',
                              { className: 'owc-rowActions' },
                              h(
                                'button',
                                { type: 'button', className: 'owc-btn owc-btnOutline', onClick: () => show(row) },
                                t('manage.show'),
                              ),
                              row.kind === 'custom' || row.kind === 'system'
                                ? h(
                                    'button',
                                    {
                                      type: 'button',
                                      className: 'owc-btn owc-btnPlain owc-btnDanger',
                                      title: t('manage.removeForever'),
                                      'aria-label': t('manage.removeForever'),
                                      onClick: () => removeCustom(row),
                                    },
                                    Icon.close(12),
                                  )
                                : null,
                            ),
                          ),
                        ),
                      )
                    : null,
                )
              : null,
            catalog.length === 0 && prefs.custom.length === 0
              ? h('p', { className: 'owc-note' }, t('manage.noApps'))
              : null,
            h('div', { className: 'owc-hgroup' }, h('span', { className: 'owc-hlabel' }, t('manage.addSystem'))),
            h(
              'button',
              {
                type: 'button',
                className: 'owc-btn owc-btnOutline owc-btnLg owc-addBtn',
                disabled: snapshot.sysBrowsing,
                onClick: () => controller.openPicker(t),
              },
              Icon.folder(15),
              h('span', {}, t('manage.addSystemPick')),
            ),
            h('p', { className: 'owc-note' }, t('manage.addSystemNote')),
          ),
          h(
            'div',
            { className: 'owc-foot' },
            h('span', { className: 'owc-footNote' }, t('manage.footNote')),
            h(
              'div',
              { className: 'owc-footActions' },
              h(
                'button',
                {
                  type: 'button',
                  className: 'owc-btn owc-btnPrimary',
                  onClick: () => controller.patch({ dialog: false }),
                },
                t('manage.done'),
              ),
            ),
          ),
        ),
      );
    }

    /** Transient banner for failures, so the header control can stay tiny. */
    function Notice({ controller }) {
      const notice = useStore(controller.state, (value) => value.notice);
      React.useEffect(() => {
        if (notice === null) return undefined;
        const timer = setTimeout(() => controller.dismissNotice(), 4500);
        return () => clearTimeout(timer);
      }, [notice, controller]);
      if (notice === null) return null;
      return h('div', { className: 'owc-toast', role: 'alert', 'data-tone': notice.tone }, h('span', {}, notice.text));
    }

    /** The stylesheet; every color comes from a host theme token. */
    const CSS = `
.owc-wrap{position:relative;display:inline-flex;flex:none;align-self:center}
.owc-split{box-sizing:border-box;display:inline-flex;align-items:stretch;height:24px;overflow:hidden;
  border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);
  font-family:var(--dsw-font-family);transition:border-color .16s ease-out,background-color .16s ease-out}
@media (hover:hover){.owc-split:hover{border-color:var(--dsw-alias-border-l3)}}
.owc-main,.owc-chevron{display:inline-flex;align-items:center;justify-content:center;gap:4px;
  padding:3px 5px;border:0;background:transparent;color:var(--dsw-alias-label-primary);
  font-family:inherit;font-size:11px;line-height:16px;white-space:nowrap;cursor:pointer;
  transition:background-color .16s ease-out,color .16s ease-out}
.owc-chevron{padding:3px 4px 3px 3px;border-left:.5px solid var(--dsw-alias-border-l4);
  color:var(--dsw-alias-label-secondary)}
.owc-single{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;
  border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:transparent;
  color:var(--dsw-alias-label-secondary);cursor:pointer;
  transition:background-color .16s ease-out,color .16s ease-out}
@media (hover:hover){
  .owc-main:hover:not(:disabled),.owc-chevron:hover:not(:disabled),.owc-single:hover{
    background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}
}
.owc-main:active:not(:disabled),.owc-chevron:active:not(:disabled),.owc-single:active{
  background:var(--dsw-alias-interactive-bg-active)}
.owc-main:disabled,.owc-chevron:disabled{cursor:default;opacity:.45}
.owc-main:focus-visible,.owc-chevron:focus-visible,.owc-single:focus-visible{
  background:var(--dsw-alias-interactive-bg-hover);outline:none}
.owc-icon{object-fit:contain;flex:none;display:block}
.owc-glyph{display:inline-grid;place-items:center;flex:none;color:var(--dsw-alias-label-secondary)}
.owc-menu{position:fixed;z-index:1200;min-width:232px;padding:4px;overflow-y:auto;
  border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-lg);
  background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent);
  font-family:var(--dsw-font-family);
  --dsw-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);
  --dsw-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.owc-menuLabel{padding:6px 8px 4px;color:var(--dsw-alias-label-tertiary);
  font-size:11px;line-height:16px;letter-spacing:.02em}
.owc-item{display:flex;align-items:center;gap:8px;width:100%;min-height:32px;padding:5px 8px;border:0;
  border-radius:var(--dsw-radius-md);background:transparent;color:var(--dsw-alias-label-primary);
  font-family:inherit;font-size:13px;line-height:20px;text-align:left;cursor:pointer;
  transition:background-color .12s ease-out}
@media (hover:hover){.owc-item:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.owc-item:active{background:var(--dsw-alias-interactive-bg-active)}
.owc-item:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.owc-item[aria-checked="true"] .owc-itemName{font-weight:500}
.owc-itemName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.owc-itemHint{flex:none;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.owc-sep{height:1px;margin:4px 8px;background:var(--dsw-alias-border-l1)}
.owc-mark{display:inline-grid;place-items:center;flex:none;width:12px;color:var(--dsw-alias-brand-primary)}
.owc-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;
  padding:24px;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);pointer-events:auto}
.owc-dialog{box-sizing:border-box;display:flex;flex-direction:column;width:560px;max-width:calc(100vw - 48px);
  max-height:min(720px,calc(100vh - 96px));border-radius:var(--dsw-radius-panel);
  background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);overflow:hidden;
  font-family:var(--dsw-font-family);color:var(--dsw-alias-label-primary)}
.owc-dialogWide{width:620px;min-height:min(568px,calc(100vh - 96px))}
.owc-head{display:flex;align-items:flex-start;gap:12px;padding:22px 20px 14px}
.owc-headIcon{display:grid;place-items:center;flex:none;width:34px;height:34px;
  border-radius:var(--dsw-radius-md);background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-secondary)}
.owc-headText{flex:1;min-width:0}
.owc-title{margin:0;color:var(--dsw-alias-label-primary);font-size:16px;font-weight:500;line-height:24px}
.owc-sub{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.owc-close{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;
  padding:0;border:0;border-radius:var(--dsw-radius-sm);background:transparent;
  color:var(--dsw-alias-label-secondary);cursor:pointer;transition:background-color .12s ease-out,color .12s ease-out}
@media (hover:hover){.owc-close:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}}
.owc-close:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.owc-toolbar{display:flex;align-items:center;gap:8px;padding:0 20px 4px}
.owc-search{position:relative;display:flex;align-items:center;flex:1;min-width:0}
.owc-search svg{position:absolute;left:9px;color:var(--dsw-alias-label-tertiary);pointer-events:none}
.owc-input{box-sizing:border-box;width:100%;height:32px;margin:0;padding:0 10px 0 29px;
  border:.5px solid var(--dsw-alias-border-l3);border-radius:var(--dsw-radius-sm);
  background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);
  font-family:inherit;font-size:13px;line-height:20px;outline:none;
  transition:border-color .12s ease-out,box-shadow .12s ease-out}
.owc-input::placeholder{color:var(--dsw-alias-label-tertiary)}
.owc-input:focus{border-color:var(--dsw-alias-state-business-primary);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--dsw-alias-state-business-primary) 14%,transparent)}
.owc-chip{display:inline-flex;align-items:center;justify-content:center;gap:6px;flex:none;height:32px;
  padding:0 10px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;
  box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3);color:var(--dsw-alias-label-primary);
  font-family:inherit;font-size:12px;line-height:18px;white-space:nowrap;cursor:pointer;
  transition:background-color .12s ease-out,box-shadow .12s ease-out}
@media (hover:hover){.owc-chip:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.owc-chip:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.owc-chip[aria-pressed="true"]{background:var(--dsw-alias-button-ghost-active-fill);
  box-shadow:inset 0 0 0 .5px var(--dsw-alias-button-ghost-active-border)}
.owc-chip svg{color:var(--dsw-alias-label-secondary)}
.owc-body{flex:1;min-height:0;overflow-y:auto;padding:0 20px 16px;
  --dsw-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);
  --dsw-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.owc-list{display:flex;flex-direction:column;gap:1px}
.owc-row{display:flex;align-items:center;gap:10px;box-sizing:border-box;width:100%;
  padding:8px 10px;border:.5px solid transparent;border-radius:var(--dsw-radius-md);
  transition:background-color .12s ease-out,border-color .12s ease-out}
@media (hover:hover){.owc-row:hover{background:var(--dsw-alias-interactive-bg-hover);
  border-color:var(--dsw-alias-border-l1)}}
.owc-pickRow{cursor:pointer;user-select:none}
.owc-pickRow[data-picked="true"]{background:var(--dsw-alias-interactive-bg-hover)}
.owc-pickRow[data-added="true"]{cursor:default}
@media (hover:hover){.owc-pickRow[data-added="true"]:hover{background:transparent;
  border-color:transparent}}
.owc-pickRow[data-added="true"] .owc-rowName{color:var(--dsw-alias-label-secondary)}
.owc-rowMain{display:flex;flex-direction:column;gap:1px;flex:1;min-width:0}
.owc-rowTitle{display:flex;align-items:center;gap:6px;min-width:0}
.owc-rowName{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.owc-rowMeta{color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:15px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
  direction:rtl;text-align:left;unicode-bidi:plaintext}
.owc-rowActions{display:flex;align-items:center;gap:2px;flex:none}
.owc-btn{display:inline-flex;align-items:center;justify-content:center;gap:5px;flex:none;height:28px;
  padding:0 10px;border:.5px solid transparent;border-radius:var(--dsw-radius-sm);background:transparent;
  color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;line-height:18px;
  white-space:nowrap;cursor:pointer;
  transition:background-color .12s ease-out,color .12s ease-out,box-shadow .12s ease-out,opacity .12s ease-out}
@media (hover:hover){.owc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}
.owc-btn:active:not(:disabled){background:var(--dsw-alias-interactive-bg-active)}
.owc-btn:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.owc-btn:disabled{cursor:not-allowed;opacity:.4}
.owc-btnOutline{box-shadow:inset 0 0 0 .5px var(--dsw-alias-border-l3)}
.owc-btnLg{height:32px;padding:0 12px;font-size:13px;line-height:20px}
.owc-btnPrimary{background:var(--dsw-alias-button-primary-fill);
  color:var(--dsw-alias-label-primary-foreground)}
@media (hover:hover){.owc-btnPrimary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}}
.owc-btnPlain{width:26px;height:26px;padding:0;color:var(--dsw-alias-label-secondary)}
@media (hover:hover){.owc-btnPlain:hover:not(:disabled){color:var(--dsw-alias-label-primary)}}
.owc-btnDanger{color:var(--dsw-alias-label-secondary)}
@media (hover:hover){
  .owc-btnDanger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger);
    color:var(--dsw-alias-label-error)}
}
.owc-addBtn{align-self:flex-start;color:var(--dsw-alias-label-primary)}
.owc-addBtn svg{color:var(--dsw-alias-label-secondary)}
.owc-tag{padding:1px 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;flex:none}
.owc-tagDefault{background:var(--dsw-alias-interactive-bg-active);color:var(--dsw-alias-label-primary)}
.owc-check{appearance:none;-webkit-appearance:none;flex:none;width:16px;height:16px;margin:0;
  position:relative;border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-xs);
  background:var(--dsw-alias-bg-layer-1);cursor:pointer;
  transition:background-color .12s ease-out,border-color .12s ease-out}
.owc-check:hover:not(:disabled){border-color:var(--dsw-alias-border-l3)}
.owc-check:checked{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary)}
.owc-check:checked::after{content:"";position:absolute;left:5px;top:1.5px;width:4px;height:8px;
  border:solid var(--dsw-alias-label-primary-foreground);border-width:0 1.6px 1.6px 0;transform:rotate(45deg)}
.owc-check:disabled{cursor:default}
.owc-check:focus-visible{outline:2px solid var(--dsw-alias-state-business-primary);outline-offset:1px}
.owc-hgroup{display:flex;align-items:center;gap:8px;padding:18px 0 8px}
.owc-hlabel{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500;
  letter-spacing:.04em;text-transform:uppercase}
.owc-count{padding:0 6px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px}
.owc-disclosure{display:inline-flex;align-items:center;gap:6px;height:26px;padding:0 8px 0 6px;border:0;
  border-radius:var(--dsw-radius-sm);background:transparent;color:var(--dsw-alias-label-secondary);
  font-family:inherit;font-size:12px;line-height:18px;cursor:pointer;
  transition:background-color .12s ease-out,color .12s ease-out}
@media (hover:hover){.owc-disclosure:hover{background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-primary)}}
.owc-disclosure:focus-visible{outline:none;background:var(--dsw-alias-interactive-bg-hover)}
.owc-caret{display:inline-grid;place-items:center;flex:none;transform:rotate(-90deg);
  transition:transform .16s ease-out}
.owc-disclosure[aria-expanded="true"] .owc-caret{transform:none}
.owc-note{margin:6px 2px 0;color:var(--dsw-alias-label-secondary);font-size:11.5px;line-height:17px}
.owc-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:28px 16px 24px;text-align:center}
.owc-emptyIcon{display:grid;place-items:center;width:36px;height:36px;border-radius:var(--dsw-radius-md);
  background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-tertiary)}
.owc-emptyText{margin:0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;
  max-width:340px}
.owc-emptyHint{margin:-2px 0 0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;
  max-width:340px}
.owc-spinner{width:16px;height:16px;border:1.5px solid var(--dsw-alias-border-l3);
  border-top-color:var(--dsw-alias-label-secondary);border-radius:50%;
  animation:owc-spin .75s linear infinite}
@keyframes owc-spin{to{transform:rotate(1turn)}}
.owc-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:14px 20px 16px;border-top:.5px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2)}
.owc-footNote{min-width:0;color:var(--dsw-alias-label-tertiary);font-size:11px;line-height:16px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.owc-footActions{display:flex;align-items:center;gap:8px;flex:none}
.owc-toast{position:fixed;left:50%;top:var(--dsh-frame-overlay-top,24px);transform:translateX(-50%);
  z-index:1300;display:flex;align-items:center;gap:8px;max-width:min(440px,calc(100vw - 48px));
  padding:8px 14px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent);
  color:var(--dsw-alias-label-primary);font-size:12px;line-height:18px;pointer-events:auto}
.owc-toast[data-tone="error"]{color:var(--dsw-alias-label-error)}
@media (prefers-reduced-motion:no-preference){
  .owc-menu{animation:owc-pop .12s ease-out}
  .owc-overlay{animation:owc-fade .16s ease-out}
  .owc-dialog{animation:owc-rise .18s cubic-bezier(.2,0,0,1)}
  @keyframes owc-pop{from{opacity:0;transform:translateY(-4px) scale(.98)}to{opacity:1;transform:none}}
  @keyframes owc-fade{from{opacity:0}to{opacity:1}}
  @keyframes owc-rise{from{opacity:0;transform:translateY(8px) scale(.995)}to{opacity:1;transform:none}}
}
@media (prefers-reduced-motion:reduce){
  .owc-spinner{animation:none}
}
`;

    /** Dictionaries; Chinese is the key-set source of truth, English is complete. */
    const DICTIONARIES = {
      zh: {
        'meta.title': '打开方式控制',
        'meta.description': '控制会话头部「打开方式」菜单的应用显示、顺序、默认项与自定义应用。',
        'action.openIn': '用 {app} 打开',
        'action.more': '更多打开方式',
        'action.manage': '管理打开方式…',
        'action.menuLabel': '打开方式',
        'action.defaultTag': '默认',
        'manage.title': '打开方式',
        'manage.subtitle': '选择会话头部菜单里出现哪些应用，并决定它们的顺序与默认项。',
        'manage.close': '关闭',
        'manage.done': '完成',
        'manage.footNote': '更改会立即保存。',
        'manage.visible': '菜单中的应用',
        'manage.hidden': '已移除',
        'manage.defaultTag': '默认',
        'manage.moveUp': '上移',
        'manage.moveDown': '下移',
        'manage.makeDefault': '设为默认',
        'manage.show': '恢复',
        'manage.remove': '移除',
        'manage.removeForever': '彻底删除',
        'manage.keepOne': '至少保留一个应用',
        'manage.noApps': '这台主机上还没有检测到可用的应用。',
        'manage.noVisible': '菜单中暂时没有应用。',
        'manage.addSystem': '添加系统应用',
        'manage.addSystemPick': '打开应用目录，选择应用…',
        'manage.addSystemNote': '默认只显示白名单里的开发工具，可在目录里切换到本机全部应用。',
        'systemApps.title': '选择已安装的应用',
        'systemApps.subtitle': '勾选后加入「打开方式」菜单，可在菜单里随时移除。',
        'systemApps.filterPlaceholder': '搜索应用…',
        'systemApps.found': '白名单应用',
        'systemApps.foundAll': '本机全部应用',
        'systemApps.showAll': '显示全部应用',
        'systemApps.showWhitelist': '只看白名单',
        'systemApps.running': '正在读取应用目录…',
        'systemApps.none': '没有检测到已安装的应用。',
        'systemApps.noneWhitelist': '白名单里没有匹配的已安装应用。',
        'systemApps.noneWhitelistHint': '点上方的「显示全部应用」查看本机全部应用。',
        'systemApps.countAll': '共 {n} 个应用',
        'systemApps.noMatch': '没有匹配「{query}」的应用。',
        'systemApps.failed': '读取应用列表失败',
        'systemApps.tagAdded': '已添加',
        'systemApps.addSelected': '添加所选',
        'systemApps.cancel': '取消',
        'systemApps.selected': '已选 {n} 个应用',
        'systemApps.footHint': '白名单只包含常用开发工具。',
        'notice.openFailed': '打开 {app} 失败',
        'notice.noTarget': '当前会话还没有工作目录',
        'preferences.notSaved': '偏好未能保存到主机',
      },
      en: {
        'meta.title': 'Open with control',
        'meta.description':
          'Control the session header Open with menu: which applications appear, their order, the default, and your own launchers.',
        'action.openIn': 'Open in {app}',
        'action.more': 'More ways to open',
        'action.manage': 'Manage open with…',
        'action.menuLabel': 'Open with',
        'action.defaultTag': 'default',
        'manage.title': 'Open with',
        'manage.subtitle':
          'Choose which applications the session header menu offers, and set their order and default.',
        'manage.close': 'Close',
        'manage.done': 'Done',
        'manage.footNote': 'Changes are saved immediately.',
        'manage.visible': 'In the menu',
        'manage.hidden': 'Removed',
        'manage.defaultTag': 'Default',
        'manage.moveUp': 'Move up',
        'manage.moveDown': 'Move down',
        'manage.makeDefault': 'Make default',
        'manage.show': 'Restore',
        'manage.remove': 'Remove',
        'manage.removeForever': 'Delete permanently',
        'manage.keepOne': 'Keep at least one application',
        'manage.noApps': 'No application is available on this host yet.',
        'manage.noVisible': 'The menu currently offers no application.',
        'manage.addSystem': 'Add system application',
        'manage.addSystemPick': 'Open applications folder, pick apps…',
        'manage.addSystemNote':
          'The allowlist shows developer tools by default; switch to every application inside the folder.',
        'systemApps.title': 'Pick installed applications',
        'systemApps.subtitle': 'Checked applications join the Open with menu and can be removed there later.',
        'systemApps.filterPlaceholder': 'Search applications…',
        'systemApps.found': 'Whitelisted applications',
        'systemApps.foundAll': 'Every application on this host',
        'systemApps.showAll': 'Show all applications',
        'systemApps.showWhitelist': 'Whitelist only',
        'systemApps.running': 'Reading the applications folder…',
        'systemApps.none': 'No installed application was detected.',
        'systemApps.noneWhitelist': 'No installed application matches the whitelist.',
        'systemApps.noneWhitelistHint': 'Use "Show all applications" above to browse this host.',
        'systemApps.countAll': '{n} applications',
        'systemApps.noMatch': 'No application matches "{query}".',
        'systemApps.failed': 'Failed to read applications',
        'systemApps.tagAdded': 'Added',
        'systemApps.addSelected': 'Add selected',
        'systemApps.cancel': 'Cancel',
        'systemApps.selected': '{n} selected',
        'systemApps.footHint': 'The whitelist only covers common developer tools.',
        'notice.openFailed': 'Could not open {app}',
        'notice.noTarget': 'This session has no working directory yet',
        'preferences.notSaved': 'Preferences were not saved on the host',
      },
    };

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const controller = createController();
        controller.load();

        ctx.effect(() => ctx.locale.register(NS, DICTIONARIES), 'open-with-control: dictionaries');
        const t = ctx.locale.bind(NS);
        const shippedT = ctx.locale.bind('open-in-app');

        ctx.effect(() => {
          const style = document.createElement('style');
          style.dataset.plugin = 'dsh-open-with-control';
          style.textContent = CSS;
          document.head.appendChild(style);
          return () => style.remove();
        }, 'open-with-control: stylesheet');

        /** The header entry declares `locale`, so its `t` seat arrives from the framework. */
        const headerInjected = () => ({ controller, shippedT });
        /** Overlay entries declare no locale seat, so they receive the bound translate here. */
        const overlayInjected = () => ({ controller, shippedT, t });

        ctx.slots.inject(SLOT, () =>
          ctx.slots.register(
            {
              name: SLOT,
              id: 'open-in-app',
              order: -10,
              priority: -1,
              locale: NS,
              inject: headerInjected,
            },
            OpenWithAction,
          ),
        );

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'open-with-control.manage', order: -1, inject: overlayInjected },
            ManageDialog,
          ),
        );

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'open-with-control.notice', order: -1, inject: overlayInjected },
            Notice,
          ),
        );

        ctx.slots.inject('shell.overlay', () =>
          ctx.slots.register(
            { name: 'shell.overlay', id: 'open-with-control.system-apps', order: -1, inject: overlayInjected },
            SystemAppsDialog,
          ),
        );
      },
    };
  },
});
