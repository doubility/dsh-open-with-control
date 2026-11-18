/**
 * Open-with-control, host half.
 *
 * Persists the user's "Open In" preferences for one DSH home and launches the
 * applications the user added themselves. The installed-application catalog and
 * its launcher belong to `@deepseek-ai/dsh-host-open-in-app`; this plugin only
 * adds what that catalog cannot express: hiding, ordering, a preferred default,
 * and user-supplied launchers for directories.
 *
 * Two browser routes, both behind the deployment's connection trust fence:
 * - GET/POST /open-with-control/state  read or replace the stored preference
 * - POST     /open-with-control/open   launch one user-added app on one directory
 *
 * @module
 */
import { spawn } from 'node:child_process';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { stat } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { dirname, extname, isAbsolute, join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { isDeveloperApp } from './developer-apps.js';
import { rm } from 'node:fs/promises';

const execFileAsync = promisify(execFile);

/** Preference document route. */
const STATE_ROUTE = '/open-with-control/state';
/** User-added application launch route. */
const OPEN_ROUTE = '/open-with-control/open';
/** Installed system applications the user can pick from (macOS / Windows). */
const SYSTEM_APPS_ROUTE = '/open-with-control/system-apps';
/** Installed system application launch route. */
const SYSTEM_OPEN_ROUTE = '/open-with-control/system-open';
/** Per-application icon route (PNG data URL, lazily converted). */
const SYSTEM_ICON_ROUTE = '/open-with-control/system-icon';
/** Directory the file manager opens when the user picks a system application. */
const FINDER_DIRECTORY = '/Applications';
/** Preference documents are small; anything larger is hostile. */
const MAX_BODY_BYTES = 64 * 1024;
/** Upper bound on one user's own application list. */
const MAX_CUSTOM_APPS = 32;
/** Early-failure watch window for one launch; a launcher still running counts as launched. */
const LAUNCH_WATCH_MS = 1200;
/** Shape every stored identifier must keep. */
const ID_PATTERN = /^[A-Za-z0-9._:-]{1,120}$/;
/** Characters that only mean something to a shell; spawn never interprets them either. */
const SHELL_METACHARACTERS = /[;&|<>$`\n\r]/;

/** Required host capabilities: the browser carrier and its trust policy. */
export const inject = ['webServer', 'connection'];

/** The composition's connection service (its package is browser-side). */
function connectionOf(ctx) {
  return Reflect.get(ctx, 'connection');
}

/** JSON response with no-store, because preferences are live user state. */
function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(payload));
}

/** 405 with the route's supported methods. */
function sendMethodNotAllowed(res, allow) {
  res.statusCode = 405;
  res.setHeader('allow', allow);
  res.end();
}

/** Collect a bounded request body as UTF-8 text; null past the ceiling. */
async function readBoundedBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.byteLength;
    if (size > MAX_BODY_BYTES) {
      req.resume();
      return null;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** Parse one JSON object body; null when the wire form is wrong. */
function parseJsonObject(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
}

/** Read a string list with a per-entry length bound. */
function stringList(value, maxEntries, maxLength) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((entry) => typeof entry === 'string' && entry.length > 0 && entry.length <= maxLength)
    .slice(0, maxEntries);
}

/** Whether a user-supplied command is safe to hand straight to spawn (never a shell). */
function safeCommand(value) {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    value.length <= 512 &&
    !SHELL_METACHARACTERS.test(value)
  );
}

/** Normalize one user-added application; [] drops an unusable entry. */
function sanitizeCustom(entry) {
  if (typeof entry !== 'object' || entry === null) return [];
  const label = typeof entry.label === 'string' ? entry.label.trim().slice(0, 60) : '';
  const command = typeof entry.command === 'string' ? entry.command.trim().slice(0, 512) : '';
  if (label === '') return [];
  const system = entry.system === true;
  const path = typeof entry.path === 'string' && isAbsolute(entry.path) ? entry.path : null;
  // System applications carry an absolute bundle path and launch through it.
  if (system && path === null) return [];
  if (!system && !safeCommand(command)) return [];
  const id =
    typeof entry.id === 'string' && ID_PATTERN.test(entry.id)
      ? entry.id
      : `custom:${Math.random().toString(36).slice(2, 10)}`;
  const args = stringList(entry.args, 16, 512);
  const icon =
    typeof entry.icon === 'string' &&
    (entry.icon.startsWith('data:image/') || entry.icon.startsWith('open-with-control/system-icon')) &&
    entry.icon.length < 200_000
      ? entry.icon
      : null;
  return [{ id, label, command, args, system, path, icon }];
}

/** Normalize a whole preference document; unknown fields are dropped. */
function sanitizeState(input) {
  const source = typeof input === 'object' && input !== null ? input : {};
  const seen = new Set();
  const custom = [];
  for (const raw of Array.isArray(source.custom) ? source.custom.slice(0, MAX_CUSTOM_APPS) : []) {
    const [entry] = sanitizeCustom(raw);
    if (entry === undefined || seen.has(entry.id)) continue;
    seen.add(entry.id);
    custom.push(entry);
  }
  return {
    version: 1,
    hidden: [...new Set(stringList(source.hidden, 200, 120))],
    order: [...new Set(stringList(source.order, 400, 120))],
    defaultApp:
      typeof source.defaultApp === 'string' && source.defaultApp.length <= 120
        ? source.defaultApp
        : null,
    custom,
  };
}

/** The composition's inherited environment minus credentials a launcher must not receive. */
function scrubbedEnv() {
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue;
    if (/(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i.test(key)) continue;
    env[key] = value;
  }
  return env;
}

/**
 * Launch one user-added application on one directory, detached from this
 * process. A `.app` bundle command is opened through the OS shell's application
 * verb so the bundle opens the directory instead of being executed.
 * @param custom - normalized user application.
 * @param path - the absolute directory to open.
 * @returns after the launcher is counted successful.
 * @throws when the process cannot start or exits nonzero inside the watch window.
 */
function launchCustom(custom, path) {
  // A system application launches by its absolute bundle path.
  if (custom.system === true && custom.path !== null) {
    return launchSystemApplication(process.platform, custom.path, path);
  }
  const args = (custom.args.length > 0 ? custom.args : ['{path}']).map((arg) =>
    arg.split('{path}').join(path),
  );
  const bundle = /\.app$/i.test(custom.command);
  const command = bundle ? 'open' : custom.command;
  const argv = bundle ? [custom.command, ...args] : args;
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(command, argv, {
        detached: true,
        stdio: 'ignore',
        env: scrubbedEnv(),
        cwd: path,
      });
    } catch (error) {
      reject(error);
      return;
    }
    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watch);
      if (error !== undefined) {
        reject(error);
        return;
      }
      child.unref();
      resolve();
    };
    const watch = setTimeout(() => settle(), LAUNCH_WATCH_MS);
    child.on('error', (error) => settle(error));
    child.on('exit', (code, signal) => {
      if (code === 0) settle();
      else settle(new Error(`launcher exited with code ${String(code)}, signal ${String(signal)}`));
    });
  });
}

/** Directories that hold user-installed applications, keyed by platform. */
const SYSTEM_APP_DIRS = {
  darwin: ['/Applications', join(homedir(), 'Applications')],
  win32: [
    join(process.env.ProgramFiles ?? 'C:\\Program Files'),
    join(process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)'),
    // Per-user installs (VS Code, many Chinese apps) land here, not in Program Files.
    join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Programs'),
  ],
};

/** Read a macOS bundle's icon name from its Info.plist, best effort. */
async function readBundleIconName(appPath) {
  try {
    const { stdout } = await execFileAsync('plutil', [
      '-extract', 'CFBundleIconFile', 'raw', '-o', '-', join(appPath, 'Contents', 'Info.plist'),
    ]);
    const name = stdout.trim();
    return name === '' ? null : name;
  } catch {
    return null;
  }
}

/** Convert one .icns file to a bounded PNG data URL via macOS sips. */
async function icnsToPngDataUrl(icnsPath) {
  const dir = await mkdtemp(join(tmpdir(), 'owc-icon-'));
  try {
    const out = join(dir, 'icon.png');
    await execFileAsync('sips', ['-s', 'format', 'png', '-Z', '64', icnsPath, '--out', out]);
    const bytes = await readFile(out);
    if (bytes.length > 128 * 1024) return null;
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Resolve the PNG data URL of one macOS application bundle, or null. */
async function bundleIconDataUrl(appPath) {
  const iconName = await readBundleIconName(appPath);
  const resources = join(appPath, 'Contents', 'Resources');
  const candidates = [];
  if (iconName !== null) {
    candidates.push(join(resources, iconName.endsWith('.icns') ? iconName : `${iconName}.icns`));
    candidates.push(join(resources, iconName));
  }
  candidates.push(join(resources, 'AppIcon.icns'));
  for (const candidate of candidates) {
    try {
      await stat(candidate);
    } catch {
      continue;
    }
    const url = await icnsToPngDataUrl(candidate);
    if (url !== null) return url;
  }
  return null;
}

/** Extract one Windows executable's icon as a PNG data URL through PowerShell. */
async function exeIconDataUrl(exePath) {
  const dir = await mkdtemp(join(tmpdir(), 'owc-icon-'));
  try {
    const out = join(dir, 'icon.png');
    const script = [
      'Add-Type -AssemblyName System.Drawing',
      `$icon = [System.Drawing.Icon]::ExtractAssociatedIcon(${JSON.stringify(exePath)})`,
      'if ($icon -eq $null) { exit 1 }',
      `$bitmap = $icon.ToBitmap()`,
      'try {',
      `  $resized = New-Object System.Drawing.Bitmap 64, 64`,
      '  $g = [System.Drawing.Graphics]::FromImage($resized)',
      '  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic',
      '  $g.DrawImage($bitmap, 0, 0, 64, 64)',
      '  $g.Dispose()',
      `  $resized.Save(${JSON.stringify(out)}, [System.Drawing.Imaging.ImageFormat]::Png)`,
      '  $resized.Dispose()',
      '} finally { $bitmap.Dispose(); $icon.Dispose() }',
    ].join('; ');
    await execFileAsync('powershell', ['-NoProfile', '-NonInteractive', '-Command', script], {
      timeout: 8000,
      windowsHide: true,
    });
    const bytes = await readFile(out);
    if (bytes.length === 0 || bytes.length > 128 * 1024) return null;
    return `data:image/png;base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/** Resolve one application's icon data URL for the running platform. */
async function applicationIconDataUrl(platform, appPath) {
  if (platform === 'win32') return exeIconDataUrl(appPath);
  if (platform === 'darwin') return bundleIconDataUrl(appPath);
  return null;
}

/**
 * List installed applications on this host, best effort. Each entry carries
 * the display name, the absolute launch path, and a PNG data-URL icon when the
 * platform can supply one. macOS reads `.app` bundles; Windows reads `.exe`
 * files one level deep under the two Program Files directories.
 *
 * Both platforms default to the developer allowlist: the picker opens on the
 * applications a coding session actually opens directories with, and only
 * `showAll` lifts that filter to everything installed.
 */
async function listSystemApplications(platform, { showAll = false } = {}) {
  const dirs = SYSTEM_APP_DIRS[platform] ?? [];
  if (platform === 'win32') {
    return listWindowsApplications(dirs, { showAll });
  }
  const seen = new Map();
  for (const dir of dirs) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const name = entry.name;
      if (!entry.isDirectory() || !name.endsWith('.app')) continue;
      const display = name.slice(0, -'.app'.length);
      if (display === '') continue;
      // Default view: developer tools only. "Show all" lifts the allowlist.
      if (!showAll && !isDeveloperApp(display, display)) continue;
      const path = join(dir, name);
      if (!seen.has(path)) seen.set(path, { id: path, label: display, path, icon: null });
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Cached PNG icons keyed by bundle path, so the icon route converts once. */
const iconCache = new Map();

/** Serve one application's icon as PNG bytes, or null when unavailable. */
async function systemApplicationIcon(platform, appPath) {
  const key = `${platform}\u0000${appPath}`;
  if (iconCache.has(key)) return iconCache.get(key);
  const dataUrl = await applicationIconDataUrl(platform, appPath);
  iconCache.set(key, dataUrl);
  return dataUrl;
}

/** Folder names under Program Files that hold command-line toolchains, not applications. */
const WINDOWS_TOOLCHAIN_DIRS = new Set([
  // `bin` holds command-line entry points (VS Code's bin\code.exe, and the like),
  // never the application itself, so the whole folder is skipped.
  'bin', 'git', 'msys2', 'msys', 'mingw64', 'mingw32', 'cygwin', 'nodejs', 'python', 'go',
  'windows kits', 'dotnet', 'microsoft sdks', 'microsoft visual studio', 'dart-sdk',
  'java', 'jdk', 'openjdk', 'php', 'ruby', 'rustup', 'cmake', 'llvm', 'mysql', 'postgresql',
]);

/** Executables that are installers, uninstallers, updaters or helpers, not applications. */
const WINDOWS_HELPER_PATTERN = /^(unins\d*|uninstall|uninst|setup|install|update|updater|helper|crash|crashpad|vc_?redist|dotnet|msiexec|elevat|svc|service|launcher_?helper|bin_|pythonw$|javaw$|wscript|cscript|rundll|conhost|cmd$|powershell$|pwsh$)/i;

/** Largest number of directory entries one application root may examine. */
const WINDOWS_ROOT_BUDGET = 1500;

/**
 * How many folder levels below a Program Files root to search. Three covers the
 * common layouts (`App\bin\app.exe`, `Vendor\App\app.exe`, `Vendor\App\Application\app.exe`).
 */
const WINDOWS_MAX_DEPTH = 3;

/** Whether one executable name is a plausible application entry point. */
function isWindowsApplicationExe(fileName) {
  const display = fileName.slice(0, -'.exe'.length);
  if (display.length < 3) return false; // one- or two-letter names are CLI shims
  return !WINDOWS_HELPER_PATTERN.test(display);
}

/**
 * List GUI applications under each Program Files root. An application is an
 * executable sitting directly in a root's first-level folder (for example
 * `Microsoft VS Code\Code.exe`) or in a folder one level below it. Toolchain
 * folders and helper executables are skipped. Every root gets its own budget,
 * so one large tree cannot starve the others.
 */
async function listWindowsApplications(roots, { showAll = false } = {}) {
  const found = new Map();
  for (const root of roots) {
    const perRoot = { remaining: WINDOWS_ROOT_BUDGET };
    // Breadth-first by depth: depth 1 (the root's own executables) and depth 2
    // (its folders' executables) are always collected before depth 3 and below
    // compete for the remaining budget. Chrome and Office sit at depth 3+.
    let frontier = [root];
    for (let depth = 0; depth <= WINDOWS_MAX_DEPTH && frontier.length > 0; depth += 1) {
      const next = [];
      for (const dir of frontier) {
        if (perRoot.remaining <= 0) break;
        let children;
        try {
          children = await readdir(dir, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const child of children) {
          if (perRoot.remaining <= 0) break;
          perRoot.remaining -= 1;
          const full = join(dir, child.name);
          if (child.isFile() && extname(child.name).toLowerCase() === '.exe') {
            if (!isWindowsApplicationExe(child.name)) continue;
            const exeName = child.name.slice(0, -'.exe'.length);
            // Default view: developer tools only. "Show all" lifts the allowlist.
            if (!showAll && !isDeveloperApp(exeName, exeName)) continue;
            addWindowsApp(found, full, child.name);
          } else if (child.isDirectory() && depth < WINDOWS_MAX_DEPTH) {
            if (WINDOWS_TOOLCHAIN_DIRS.has(child.name.toLowerCase())) continue;
            next.push(full);
          }
        }
      }
      frontier = next;
    }
  }
  return [...found.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** Record one Windows application once, keyed by its executable path. */
function addWindowsApp(found, fullPath, fileName) {
  if (found.has(fullPath)) return;
  const label = fileName.slice(0, -'.exe'.length);
  found.set(fullPath, { id: fullPath, label, path: fullPath, icon: null });
}

/**
 * Launch one system application on one directory by its absolute bundle or
 * executable path. macOS runs `open -a <bundle> <dir>` so the application
 * receives the directory instead of the bundle being "opened" by Finder;
 * Windows starts the executable directly with the directory as its argument.
 */
function launchSystemApplication(platform, appPath, path) {
  const argv =
    platform === 'win32' ? [appPath, path] : ['open', '-a', appPath, path];
  return new Promise((resolve, reject) => {
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), {
        detached: true,
        stdio: 'ignore',
        windowsHide: platform === 'win32',
        env: scrubbedEnv(),
        cwd: path,
      });
    } catch (error) {
      reject(error);
      return;
    }
    let settled = false;
    const settle = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(watch);
      if (error !== undefined) {
        reject(error);
        return;
      }
      child.unref();
      resolve();
    };
    const watch = setTimeout(() => settle(), LAUNCH_WATCH_MS);
    child.on('error', (error) => settle(error));
    child.on('exit', (code, signal) => {
      if (code === 0) settle();
      else settle(new Error(`launcher exited with code ${String(code)}, signal ${String(signal)}`));
    });
  });
}

/**
 * Host plugin body: own the preference document and the user-added launchers.
 * @param ctx - host plugin context.
 */
export function apply(ctx) {
  /** The composition's subprocess capability, when the profile mounts one. */
  const subprocess = ctx.get === undefined ? undefined : ctx.get('subprocess');
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh');
  const statePath = join(home, 'storages', 'open-with-control.json');
  /** Cached document; absent until the first read or write. */
  let cached;
  /** Serialize writes so two saves cannot interleave their temp files. */
  let queue = Promise.resolve();

  const empty = () => sanitizeState({});

  const read = async () => {
    if (cached !== undefined) return cached;
    try {
      cached = sanitizeState(parseJsonObject(await readFile(statePath, 'utf8')) ?? {});
    } catch {
      cached = empty();
    }
    return cached;
  };

  const write = async (next) => {
    cached = next;
    queue = queue.then(async () => {
      await mkdir(dirname(statePath), { recursive: true });
      const temporary = `${statePath}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
      await rename(temporary, statePath);
    });
    await queue;
    return next;
  };

  /** Answer an untrusted/unauthenticated request; true when it was rejected. */
  const rejected = (req, res) => {
    const rejection = connectionOf(ctx).requestRejection(req);
    if (rejection === undefined) return false;
    res.statusCode = rejection;
    res.end();
    return true;
  };

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: STATE_ROUTE,
        handler: async (req, res) => {
          if (rejected(req, res)) return;
          if (req.method === 'GET') {
            sendJson(res, 200, await read());
            return;
          }
          if (req.method !== 'POST') {
            sendMethodNotAllowed(res, 'GET, POST');
            return;
          }
          if (
            String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase() !==
            'application/json'
          ) {
            sendJson(res, 415, { code: 'unsupported-media-type', message: 'content-type must be application/json' });
            return;
          }
          let text;
          try {
            text = await readBoundedBody(req);
          } catch {
            sendJson(res, 400, { code: 'bad-request', message: 'request body unreadable' });
            return;
          }
          if (text === null) {
            sendJson(res, 413, { code: 'payload-too-large', message: 'request body is too large' });
            return;
          }
          const parsed = parseJsonObject(text);
          if (parsed === null) {
            sendJson(res, 400, { code: 'bad-request', message: 'request body must be a JSON object' });
            return;
          }
          sendJson(res, 200, await write(sanitizeState(parsed)));
        },
      }),
    `open-with-control: ${STATE_ROUTE}`,
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: OPEN_ROUTE,
        handler: async (req, res) => {
          if (rejected(req, res)) return;
          if (req.method !== 'POST') {
            sendMethodNotAllowed(res, 'POST');
            return;
          }
          if (
            String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase() !==
            'application/json'
          ) {
            sendJson(res, 415, { code: 'unsupported-media-type', message: 'content-type must be application/json' });
            return;
          }
          let text;
          try {
            text = await readBoundedBody(req);
          } catch {
            sendJson(res, 400, { code: 'bad-request', message: 'request body unreadable' });
            return;
          }
          if (text === null) {
            sendJson(res, 413, { code: 'payload-too-large', message: 'request body is too large' });
            return;
          }
          const body = parseJsonObject(text);
          if (body === null || typeof body.path !== 'string' || typeof body.custom !== 'string') {
            sendJson(res, 400, {
              code: 'bad-request',
              message: 'request body must be JSON with string "path" and "custom"',
            });
            return;
          }
          const state = await read();
          const custom = state.custom.find((entry) => entry.id === body.custom);
          if (custom === undefined) {
            sendJson(res, 400, { code: 'bad-request', message: `unknown application: ${body.custom}` });
            return;
          }
          if (body.path === '' || !isAbsolute(body.path)) {
            sendJson(res, 400, { code: 'bad-request', message: 'path must be an absolute directory path' });
            return;
          }
          let directory = false;
          try {
            directory = (await stat(body.path)).isDirectory();
          } catch {
            directory = false;
          }
          if (!directory) {
            sendJson(res, 404, { code: 'not-found', message: `directory does not exist: ${body.path}` });
            return;
          }
          try {
            await launchCustom(custom, body.path);
          } catch {
            sendJson(res, 502, { code: 'launch-failed', message: `failed to launch ${custom.id}` });
            return;
          }
          sendJson(res, 200, { ok: true });
        },
      }),
    `open-with-control: ${OPEN_ROUTE}`,
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: SYSTEM_APPS_ROUTE,
        handler: async (req, res) => {
          if (rejected(req, res)) return;
          if (req.method !== 'GET') {
            sendMethodNotAllowed(res, 'GET');
            return;
          }
          // ?all=1 lists every application for this request only; the picker's
          // toggle is a view state, never part of the saved preference.
          const query = new URL(String(req.url), 'http://localhost').searchParams;
          const showAll = query.get('all') === '1';
          sendJson(res, 200, await listSystemApplications(process.platform, { showAll }));
        },
      }),
    `open-with-control: ${SYSTEM_APPS_ROUTE}`,
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: SYSTEM_ICON_ROUTE,
        handler: async (req, res) => {
          if (rejected(req, res)) return;
          if (req.method !== 'GET') {
            sendMethodNotAllowed(res, 'GET');
            return;
          }
          const path = new URL(String(req.url), 'http://localhost').searchParams.get('path');
          if (path === null || !isAbsolute(path)) {
            sendJson(res, 400, { code: 'bad-request', message: 'path query is required' });
            return;
          }
          const dataUrl = await systemApplicationIcon(process.platform, path);
          if (dataUrl === null) {
            sendJson(res, 404, { code: 'not-found', message: 'no icon' });
            return;
          }
          const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
          const bytes = Buffer.from(base64, 'base64');
          res.statusCode = 200;
          res.setHeader('content-type', 'image/png');
          res.setHeader('cache-control', 'public, max-age=3600');
          res.end(bytes);
        },
      }),
    `open-with-control: ${SYSTEM_ICON_ROUTE}`,
  );

  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: SYSTEM_OPEN_ROUTE,
        handler: async (req, res) => {
          if (rejected(req, res)) return;
          if (req.method !== 'POST') {
            sendMethodNotAllowed(res, 'POST');
            return;
          }
          if (
            String(req.headers['content-type']).split(';', 1)[0]?.trim().toLowerCase() !==
            'application/json'
          ) {
            sendJson(res, 415, { code: 'unsupported-media-type', message: 'content-type must be application/json' });
            return;
          }
          let text;
          try {
            text = await readBoundedBody(req);
          } catch {
            sendJson(res, 400, { code: 'bad-request', message: 'request body unreadable' });
            return;
          }
          if (text === null) {
            sendJson(res, 413, { code: 'payload-too-large', message: 'request body is too large' });
            return;
          }
          const body = parseJsonObject(text);
          if (body === null || typeof body.application !== 'string' || typeof body.path !== 'string') {
            sendJson(res, 400, {
              code: 'bad-request',
              message: 'request body must be JSON with string "application" and "path"',
            });
            return;
          }
          if (body.path === '' || !isAbsolute(body.path)) {
            sendJson(res, 400, { code: 'bad-request', message: 'path must be an absolute directory path' });
            return;
          }
          let directory = false;
          try {
            directory = (await stat(body.path)).isDirectory();
          } catch {
            directory = false;
          }
          if (!directory) {
            sendJson(res, 404, { code: 'not-found', message: `directory does not exist: ${body.path}` });
            return;
          }
          try {
            await launchSystemApplication(process.platform, body.application, body.path);
          } catch {
            sendJson(res, 502, { code: 'launch-failed', message: `failed to launch ${body.application}` });
            return;
          }
          sendJson(res, 200, { ok: true });
        },
      }),
    `open-with-control: ${SYSTEM_OPEN_ROUTE}`,
  );
}