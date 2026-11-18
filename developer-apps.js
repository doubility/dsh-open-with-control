/**
 * The developer-application allowlist for Windows discovery.
 *
 * The Open with menu lists only developer tools by default: editors and IDEs,
 * terminals, Git clients, database and API tools, and image editors. Each
 * category is a list of match rules. A rule matches an application when its
 * display name, or the executable's file name without extension, equals the
 * rule's name (case-insensitive) or, for rules marked `contains`, contains it.
 *
 * Equality is the default because substring matching produces false hits
 * (`code` would match `Codec`). Only long, distinctive names opt into `contains`.
 */

/** @type {{ category: string, names: string[], contains?: string[] }[]} */
export const DEVELOPER_CATEGORIES = [
  {
    category: 'editor',
    names: [
      'code', 'code - insiders', 'cursor', 'windsurf', 'zed', 'sublime_text', 'subl',
      'notepad++', 'atom', 'brackets', 'emacs', 'vim', 'gvim', 'neovim', 'nvim',
      'devenv', 'idea64', 'idea', 'pycharm64', 'pycharm', 'webstorm64', 'webstorm',
      'phpstorm64', 'phpstorm', 'goland64', 'goland', 'rider64', 'rider', 'clion64',
      'clion', 'rustrover64', 'rustrover', 'datagrip64', 'datagrip', 'studio64',
      'androidstudio', 'xcode', 'eclipse', 'netbeans', 'lapce', 'helix',
    ],
    contains: ['visual studio code', 'visual studio', 'jetbrains', 'android studio'],
  },
  {
    category: 'terminal',
    names: [
      'windowsterminal', 'wt', 'mintty', 'alacritty', 'wezterm-gui', 'wezterm',
      'hyper', 'tabby', 'kitty', 'ghostty', 'warp', 'iterm',
    ],
    contains: ['windows terminal', 'git bash', 'powershell', 'terminal'],
  },
  {
    category: 'git',
    names: [
      'githubdesktop', 'fork', 'sourcetree', 'gitkraken', 'tower', 'smartgit',
      'sublime merge', 'sublime_merge', 'sublimemerge', 'git-gui', 'gitextensions',
    ],
    contains: ['github desktop', 'gitkraken', 'sourcetree', 'tortoisegit'],
  },
  {
    category: 'database-api',
    names: [
      'dbeaver', 'navicat', 'datagrip', 'heidisql', 'mysqlworkbench', 'pgadmin4',
      'postman', 'insomnia', 'apifox', 'bruno', 'hoppscotch', 'redisinsight',
      'mongodbcompass', 'compass', 'ssms', 'azuredatastudio',
    ],
    contains: ['another redis', 'sql server management', 'mongodb compass', 'azure data studio'],
  },
  {
    category: 'image',
    names: [
      'photoshop', 'illustrator', 'indesign', 'figma', 'gimp', 'gimp-2.10', 'krita',
      'inkscape', 'paint.net', 'paintdotnet', 'photoscape', 'blender',
    ],
    contains: ['adobe photoshop', 'adobe illustrator', 'paint.net', 'clip studio'],
  },
];

/** Lower-cased, trimmed name, ready for comparison. */
function normalize(name) {
  return String(name ?? '').trim().toLowerCase();
}

/**
 * Which developer category an application belongs to, or null if it is not a
 * developer tool. Checks the display name and the executable's file name, so a
 * Start Menu label ("Visual Studio Code") and an exe name ("Code") both match.
 * @param displayName - the name the user sees (shortcut name or exe name).
 * @param exeName - the executable's file name without extension, if known.
 * @returns the matching category, or null.
 */
export function developerCategoryOf(displayName, exeName = '') {
  const candidates = [normalize(displayName), normalize(exeName)].filter((c) => c !== '');
  for (const group of DEVELOPER_CATEGORIES) {
    for (const candidate of candidates) {
      if (group.names.includes(candidate)) return group.category;
      if ((group.contains ?? []).some((needle) => candidate.includes(needle))) return group.category;
    }
  }
  return null;
}

/** Whether an application is a developer tool under the allowlist. */
export function isDeveloperApp(displayName, exeName = '') {
  return developerCategoryOf(displayName, exeName) !== null;
}
