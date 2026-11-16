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

    /** Applications the scanner can offer to add, keyed by shipped catalog id. */
    const CANDIDATES = [
      { id: 'cursor', kind: 'shipped', name: 'Cursor', platform: 'darwin', paths: ['/Applications/Cursor.app'], command: null, args: [] },
      { id: 'vscode', kind: 'shipped', name: 'VS Code', platform: 'darwin', paths: ['/Applications/Visual Studio Code.app'], command: null, args: [] },
      { id: 'zed', kind: 'shipped', name: 'Zed', platform: 'darwin', paths: ['/Applications/Zed.app'], command: null, args: [] },
      { id: 'intellij', kind: 'shipped', name: 'IntelliJ IDEA', platform: 'darwin', paths: ['/Applications/IntelliJ IDEA.app', '/Applications/IntelliJ IDEA CE.app'], command: null, args: [] },
      { id: 'pycharm', kind: 'shipped', name: 'PyCharm', platform: 'darwin', paths: ['/Applications/PyCharm.app', '/Applications/PyCharm CE.app'], command: null, args: [] },
      { id: 'webstorm', kind: 'shipped', name: 'WebStorm', platform: 'darwin', paths: ['/Applications/WebStorm.app'], command: null, args: [] },
      { id: 'goland', kind: 'shipped', name: 'GoLand', platform: 'darwin', paths: ['/Applications/GoLand.app'], command: null, args: [] },
      { id: 'sublimetext', kind: 'shipped', name: 'Sublime Text', platform: 'darwin', paths: ['/Applications/Sublime Text.app'], command: null, args: [] },
      { id: 'iterm', kind: 'shipped', name: 'iTerm2', platform: 'darwin', paths: ['/Applications/iTerm.app'], command: null, args: [] },
      { id: 'warp', kind: 'shipped', name: 'Warp', platform: 'darwin', paths: ['/Applications/Warp.app'], command: null, args: [] },
      { id: 'ghostty', kind: 'shipped', name: 'Ghostty', platform: 'darwin', paths: ['/Applications/Ghostty.app'], command: null, args: [] },
      { id: 'androidstudio', kind: 'shipped', name: 'Android Studio', platform: 'darwin', paths: ['/Applications/Android Studio.app'], command: null, args: [] },
      { id: 'vscodeinsiders', kind: 'shipped', name: 'VS Code Insiders', platform: 'darwin', paths: ['/Applications/Visual Studio Code - Insiders.app'], command: null, args: [] },
      { id: 'xcode', kind: 'shipped', name: 'Xcode', platform: 'darwin', paths: ['/Applications/Xcode.app'], command: null, args: [] },
      { id: 'kitty', kind: 'custom', name: 'kitty', platform: 'darwin', paths: [], command: 'kitty', args: ['--directory', '{path}'] },
      { id: 'neovim', kind: 'custom', name: 'Neovim', platform: 'darwin', paths: [], command: 'nvim', args: ['{path}'] },
      { id: 'emacs', kind: 'custom', name: 'Emacs', platform: 'darwin', paths: [], command: 'emacs', args: ['{path}'] },
      { id: 'subl', kind: 'custom', name: 'Sublime Text (CLI)', platform: 'darwin', paths: [], command: 'subl', args: ['{path}'] },
    ];

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
        sysApps: [],
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

      /** Read the installed system applications the host can see. */
      const browseSystem = async (t) => {
        patch({ sysBrowsing: true });
        const apps = await readJson(SYSTEM_APPS_ROUTE, { headers: { accept: 'application/json' } });
        patch({ sysBrowsing: false, sysApps: Array.isArray(apps) ? apps : [] });
        if (!Array.isArray(apps)) announce(t('systemApps.failed'), 'error');
      };

      return { state, patch, announce, dismissNotice, load, persist, open, browseSystem };
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
      app: () =>
        h(
          'svg',
          {
            viewBox: '0 0 16 16',
            width: 13,
            height: 13,
            fill: 'none',
            stroke: 'currentColor',
            strokeWidth: 1.4,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
            'aria-hidden': true,
            style: { flex: 'none' },
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
    };

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
                    h('span', { className: 'owc-mark' }, preferred !== undefined && row.id === preferred.id ? Icon.check() : null),
                    row.icon !== null
                      ? h('img', { className: 'owc-icon', src: row.icon, alt: '', draggable: false })
                      : Icon.app(),
                    h('span', { className: 'owc-itemName' }, row.name),
                    preferred !== undefined && row.id === preferred.id
                      ? h('span', { className: 'owc-itemHint' }, t('action.defaultTag'))
                      : null,
                  ),
                ),
                rows.length > 0 ? h('div', { className: 'owc-sep' }) : null,
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
                  h('span', { className: 'owc-mark' }, Icon.gear()),
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
                  preferred.icon !== null
                    ? h('img', { className: 'owc-icon', src: preferred.icon, alt: '', draggable: false })
                    : Icon.app(),
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

    /** Pick from the applications this system reports as installed. */
    function SystemAppsDialog(props) {
      const { controller, t } = props;
      const snapshot = useStore(controller.state, (value) => value);
      const [picked, setPicked] = React.useState(() => new Set());
      const [filter, setFilter] = React.useState('');

      React.useEffect(() => {
        if (!snapshot.sysDialogOpen) return undefined;
        const onKeyDown = (event) => {
          if (event.key === 'Escape') controller.patch({ sysDialogOpen: false });
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [snapshot.sysDialogOpen, controller]);

      if (!snapshot.sysDialogOpen) return null;

      const current = new Set(snapshot.prefs.custom.map((entry) => entry.id));
      const shown = (snapshot.sysApps ?? []).filter(
        (app) => filter.trim() === '' || app.label.toLowerCase().includes(filter.trim().toLowerCase()),
      );
      const toggle = (id) => {
        const next = new Set(picked);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setPicked(next);
      };

      const adopt = async () => {
        const currentPrefs = snapshot.prefs;
        const next = { ...currentPrefs, custom: [...currentPrefs.custom], order: [...currentPrefs.order] };
        for (const app of snapshot.sysApps ?? []) {
          if (!picked.has(app.id)) continue;
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
        setPicked(new Set());
        controller.patch({ sysDialogOpen: false });
      };

      return h(
        'div',
        {
          className: 'owc-overlay',
          role: 'presentation',
          onPointerDown: (event) => {
            if (event.target === event.currentTarget) controller.patch({ sysDialogOpen: false });
          },
        },
        h(
          'div',
          { className: 'owc-dialog', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('systemApps.title') },
          h(
            'div',
            { className: 'owc-head' },
            h(
              'div',
              { style: { flex: 1, minWidth: 0 } },
              h('h2', { className: 'owc-title' }, t('systemApps.title')),
              h('p', { className: 'owc-sub' }, t('systemApps.subtitle')),
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'owc-close',
                'aria-label': t('manage.close'),
                onClick: () => controller.patch({ sysDialogOpen: false }),
              },
              Icon.close(14),
            ),
          ),
          h(
            'div',
            { className: 'owc-body' },
            h(
              'div',
              { className: 'owc-field' },
              h('input', {
                className: 'owc-input',
                value: filter,
                placeholder: t('systemApps.filterPlaceholder'),
                onChange: (event) => setFilter(event.target.value),
              }),
            ),
            h('div', { className: 'owc-hgroup' }, h('span', { className: 'owc-hlabel' }, t('systemApps.found'))),
            snapshot.sysBrowsing
              ? h('p', { className: 'owc-note' }, t('systemApps.running'))
              : shown.length === 0
                ? h('p', { className: 'owc-note' }, t('systemApps.none'))
                : shown.map((app) =>
                    h(
                      'div',
                      { className: 'owc-row', key: app.id },
                      h('input', {
                        type: 'checkbox',
                        className: 'owc-check',
                        checked: picked.has(app.id),
                        onChange: () => toggle(app.id),
                        style: { width: 14, height: 14, margin: 0, flex: 'none' },
                      }),
                      h('img', {
                        className: 'owc-icon',
                        src: `${SYSTEM_ICON_ROUTE}?path=${encodeURIComponent(app.path)}`,
                        alt: '',
                        draggable: false,
                        onError: (event) => {
                          event.currentTarget.style.visibility = 'hidden';
                        },
                      }),
                      h('div', { className: 'owc-rowName', style: { flex: 1 } }, app.label),
                      current.has(systemIdFor(app.label))
                        ? h('span', { className: 'owc-tag' }, t('systemApps.tagAdded'))
                        : h('span', { className: 'owc-tag' }, t('systemApps.tagNew')),
                    ),
                  ),
            h(
              'div',
              { style: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 } },
              h(
                'button',
                {
                  type: 'button',
                  className: 'owc-btn',
                  disabled: snapshot.sysBrowsing || picked.size === 0,
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
          if (event.key === 'Escape') controller.patch({ dialog: false });
        };
        document.addEventListener('keydown', onKeyDown);
        return () => document.removeEventListener('keydown', onKeyDown);
      }, [snapshot.dialog, controller]);

      if (!snapshot.dialog) return null;

      const { prefs, catalog } = snapshot;
      const all = arrange(prefs, catalog, shippedT);
      // At least one application must stay in the menu: the last visible row
      // can neither be hidden nor removed.
      const lastVisible = all.length === 1;
      const listed = new Set(all.map((row) => row.id));
      const orderIndex = new Map(prefs.order.map((id, index) => [id, index]));
      const hiddenRows = catalog
        .filter((id) => prefs.hidden.includes(id))
        .map((id) => ({ id, kind: 'catalog', name: appName(shippedT, id) }));
      const hiddenCustom = prefs.custom
        .filter((entry) => prefs.hidden.includes(entry.id))
        .map((entry) => ({
          id: entry.id,
          kind: entry.system === true ? 'system' : 'custom',
          entry,
          name: entry.label,
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

      const rowActions = (row) =>
        h(
          'div',
          { className: 'owc-row', key: row.id },
          h(
            'div',
            { style: { flex: 1, minWidth: 0 } },
            h('div', { className: 'owc-rowName' }, row.name),
            row.kind === 'custom'
              ? h(
                  'div',
                  { className: 'owc-rowMeta' },
                  `${row.entry.command}${row.entry.args.length > 0 ? ` · ${row.entry.args.join(' ')}` : ''}`,
                )
              : null,
          ),
          prefs.defaultApp === row.id ? h('span', { className: 'owc-tag' }, t('manage.defaultTag')) : null,
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
          h(
            'button',
            {
              type: 'button',
              className: 'owc-btn',
              disabled: prefs.defaultApp === row.id,
              onClick: () => setDefault(row),
            },
            t('manage.makeDefault'),
          ),
          h(
            'button',
            {
              type: 'button',
              className: 'owc-btn',
              disabled: lastVisible,
              title: lastVisible ? t('manage.keepOne') : undefined,
              onClick: () => remove(row),
            },
            t('manage.remove'),
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
            h(
              'div',
              { style: { flex: 1, minWidth: 0 } },
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
            h('div', { className: 'owc-hgroup' }, h('span', { className: 'owc-hlabel' }, t('manage.visible'))),
            all.length === 0
              ? h('p', { className: 'owc-note' }, t('manage.noVisible'))
              : all.map(rowActions),
            hidden.length > 0
              ? h(
                  React.Fragment,
                  null,
                  h(
                    'button',
                    {
                      type: 'button',
                      className: 'owc-btn',
                      style: { marginTop: 8 },
                      'aria-expanded': hiddenOpen,
                      onClick: () => setHiddenOpen((value) => !value),
                    },
                    `${hiddenOpen ? '▾' : '▸'} ${t('manage.hidden')} (${hidden.length})`,
                  ),
                  hiddenOpen
                    ? hidden.map((row) =>
                        h(
                          'div',
                          { className: 'owc-row', key: row.id },
                          h('div', { className: 'owc-rowName', style: { flex: 1 } }, row.name),
                          h(
                            'button',
                            { type: 'button', className: 'owc-btn', onClick: () => show(row) },
                            t('manage.show'),
                          ),
                          row.kind === 'custom' || row.kind === 'system'
                            ? h(
                                'button',
                                {
                                  type: 'button',
                                  className: 'owc-btn owc-btnPlain',
                                  title: t('manage.removeForever'),
                                  'aria-label': t('manage.removeForever'),
                                  onClick: () => removeCustom(row),
                                },
                                Icon.close(12),
                              )
                            : null,
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
              'div',
              { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
              h(
                'button',
                {
                  type: 'button',
                  className: 'owc-btn',
                  disabled: snapshot.sysBrowsing,
                  onClick: async () => {
                    controller.patch({ sysDialogOpen: true });
                    await controller.browseSystem(t);
                  },
                },
                snapshot.sysBrowsing ? t('systemApps.running') : t('manage.addSystemPick'),
              ),
            ),
            h('p', { className: 'owc-note' }, t('manage.addSystemNote')),
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
      return h(
        'div',
        { className: 'owc-toast', role: 'alert', 'data-tone': notice.tone },
        h('span', {}, notice.text),
      );
    }

    /** The stylesheet; every color comes from a host theme token. */
    const CSS = `
.owc-wrap{position:relative;display:inline-flex;flex:none;align-self:center}
.owc-split{box-sizing:border-box;display:inline-flex;align-items:stretch;height:24px;overflow:hidden;
  border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);font-family:var(--dsw-font-family)}
.owc-main,.owc-chevron{display:inline-flex;align-items:center;justify-content:center;gap:4px;
  padding:3px 5px;border:0;background:0 0;color:var(--dsw-alias-label-primary);
  font-family:inherit;font-size:11px;line-height:16px;white-space:nowrap;cursor:pointer}
.owc-chevron{padding:3px 4px 3px 3px;border-left:.5px solid var(--dsw-alias-border-l4);
  color:var(--dsw-alias-label-secondary)}
.owc-single{display:inline-flex;align-items:center;justify-content:center;width:24px;height:24px;padding:0;
  border:.5px solid var(--dsw-alias-border-l4);border-radius:var(--dsw-radius-sm);background:0 0;
  color:var(--dsw-alias-label-secondary);cursor:pointer}
@media (hover:hover){
  .owc-main:hover:not(:disabled),.owc-chevron:hover:not(:disabled),.owc-single:hover{background:var(--dsw-alias-interactive-bg-hover)}
}
.owc-main:disabled,.owc-chevron:disabled{cursor:default;opacity:.6}
.owc-main:focus-visible,.owc-chevron:focus-visible,.owc-single:focus-visible{background:var(--dsw-alias-interactive-bg-hover);outline:none}
.owc-icon{width:13px;height:13px;object-fit:contain;flex:none}
.owc-menu{position:fixed;z-index:1200;min-width:248px;overflow-y:auto;padding:4px;
  border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-md);
  background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent);
  --dsw-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);
  --dsw-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.owc-item{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;border:0;
  border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-primary);
  font-family:inherit;font-size:12px;line-height:18px;text-align:left;cursor:pointer}
@media (hover:hover){.owc-item:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.owc-itemName{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.owc-itemHint{color:var(--dsw-alias-label-secondary);font-size:11px}
.owc-sep{height:1px;margin:4px 6px;background:var(--dsw-alias-border-l1)}
.owc-mark{display:inline-flex;align-items:center;justify-content:center;width:12px;flex:none;
  color:var(--dsw-alias-brand-primary)}
.owc-overlay{position:fixed;inset:0;z-index:1200;display:flex;align-items:center;justify-content:center;
  padding:24px;background:var(--dsw-alias-bg-mask-1);backdrop-filter:var(--dsw-mask-blur);pointer-events:auto}
.owc-dialog{box-sizing:border-box;display:flex;flex-direction:column;width:600px;max-width:calc(100vw - 48px);
  max-height:min(720px,calc(100vh - 96px));border-radius:var(--dsw-radius-panel);
  background:var(--dsw-alias-bg-layer-2);box-shadow:var(--dsw-elevation-prominent);overflow:hidden}
.owc-head{display:flex;align-items:flex-start;gap:8px;padding:18px 16px 10px 20px}
.owc-title{margin:0;color:var(--dsw-alias-label-primary);font-size:15px;font-weight:500;line-height:22px}
.owc-sub{margin:2px 0 0;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px}
.owc-close{display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;padding:0;
  border:0;border-radius:var(--dsw-radius-sm);background:0 0;color:var(--dsw-alias-label-primary);cursor:pointer}
@media (hover:hover){.owc-close:hover{background:var(--dsw-alias-interactive-bg-hover)}}
.owc-body{flex:1;min-height:0;overflow-y:auto;padding:4px 20px 18px;
  --dsw-scrollbar-thumb:var(--dsw-alias-scrollbar-bg-l2);
  --dsw-scrollbar-thumb-hover:var(--dsw-alias-scrollbar-hover-l2)}
.owc-row{display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:.5px solid var(--dsw-alias-border-l1)}
.owc-row:last-child{border-bottom:0}
.owc-rowName{color:var(--dsw-alias-label-primary);font-size:13px;line-height:20px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.owc-rowMeta{color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.owc-btn{display:inline-flex;align-items:center;justify-content:center;gap:4px;height:26px;padding:0 10px;
  border:.5px solid var(--dsw-alias-border-l2);border-radius:var(--dsw-radius-sm);background:0 0;
  color:var(--dsw-alias-label-primary);font-family:inherit;font-size:12px;cursor:pointer;flex:none}
@media (hover:hover){.owc-btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}}
.owc-btn:disabled{opacity:.45;cursor:default}
.owc-btnPlain{width:24px;height:24px;padding:0;border:0}
.owc-tag{padding:1px 6px;border-radius:var(--dsw-radius-xs);background:var(--dsw-alias-interactive-bg-hover);
  color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px;flex:none}
.owc-hgroup{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:16px 0 6px}
.owc-hlabel{color:var(--dsw-alias-label-secondary);font-size:11px;font-weight:500;letter-spacing:.04em;
  text-transform:uppercase}
.owc-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
.owc-label{color:var(--dsw-alias-label-secondary);font-size:12px}
.owc-input{box-sizing:border-box;width:100%;height:30px;padding:0 8px;border:.5px solid var(--dsw-alias-border-l2);
  border-radius:var(--dsw-radius-sm);background:var(--dsw-alias-bg-layer-1);
  color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-mono,monospace);font-size:12px}
.owc-input:focus{outline:none;border-color:var(--dsw-alias-brand-primary)}
.owc-note{margin:6px 0 0;color:var(--dsw-alias-label-secondary);font-size:11px;line-height:16px}
.owc-toast{position:fixed;left:50%;top:var(--dsh-frame-overlay-top,24px);transform:translateX(-50%);
  z-index:1300;display:flex;align-items:center;gap:8px;max-width:min(440px,calc(100vw - 48px));
  padding:8px 14px;border-radius:var(--dsw-radius-md);border:.5px solid var(--dsw-alias-border-l2);
  background:var(--dsw-alias-bg-overlay);box-shadow:var(--dsw-elevation-prominent);
  color:var(--dsw-alias-label-primary);font-size:12px;pointer-events:auto}
.owc-toast[data-tone="error"]{color:var(--dsw-alias-state-error-primary)}
`;

    /** Dictionaries; Chinese is the key-set source of truth, English is complete. */
    const DICTIONARIES = {
      zh: {
        'meta.title': '打开方式控制',
        'meta.description': '控制会话头部「打开方式」菜单的应用显示、顺序、默认项与自定义应用。',
        'action.openIn': '用 {app} 打开',
        'action.more': '更多打开方式',
        'action.manage': '管理打开方式…',
        'action.defaultTag': '默认',
        'manage.title': '打开方式',
        'manage.subtitle': '选择会话头部菜单里出现哪些应用，并决定它们的顺序与默认项。',
        'manage.close': '关闭',
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
        'manage.addSystemNote':
          '点击打开系统应用目录，勾选已安装的应用加入打开方式菜单（带图标）。',
        'systemApps.title': '选择已安装的应用',
        'systemApps.subtitle': '系统应用目录中的应用，勾选后加入打开方式菜单。',
        'systemApps.filterPlaceholder': '筛选应用…',
        'systemApps.found': '已安装的应用',
        'systemApps.running': '正在读取…',
        'systemApps.none': '没有检测到已安装的应用。',
        'systemApps.failed': '读取应用列表失败',
        'systemApps.tagAdded': '已添加',
        'systemApps.tagNew': '新添加',
        'systemApps.addSelected': '添加所选',
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
        'action.defaultTag': 'default',
        'manage.title': 'Open with',
        'manage.subtitle':
          'Choose which applications the session header menu offers, and set their order and default.',
        'manage.close': 'Close',
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
          'Open the system applications folder and check installed applications (with icons) to add them to the Open with menu.',
        'systemApps.title': 'Pick installed applications',
        'systemApps.subtitle': 'Applications in the system folder; checked ones join the Open with menu.',
        'systemApps.filterPlaceholder': 'Filter applications…',
        'systemApps.found': 'Installed applications',
        'systemApps.running': 'Reading…',
        'systemApps.none': 'No installed application was detected.',
        'systemApps.failed': 'Failed to read applications',
        'systemApps.tagAdded': 'Added',
        'systemApps.tagNew': 'New',
        'systemApps.addSelected': 'Add selected',
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