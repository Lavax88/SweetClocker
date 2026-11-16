import type { SystemPropItem, PropsState, PropImportDiffItem } from './types';
import { exec } from '../bridge/ksu';

const MODULE_PROP_PATH = '/data/adb/modules/sweetclocker/system.prop';
const ALT_MODULE_PROP_PATH = '/data/adb/modules/SweetClocker/system.prop';
const CUSTOM_PROP_PATH = '/data/local/tmp/.sweetclocker_props_custom';
const DEFAULTS_PROP_PATH = '/data/local/tmp/.sweetclocker_props_defaults';

export function parsePropLine(line: string): { key: string; value: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  // Format 1: [prop.name]: [prop.value] (from getprop)
  if (trimmed.startsWith('[') && trimmed.includes(']: [')) {
    const splitIndex = trimmed.indexOf(']: [');
    const key = trimmed.slice(1, splitIndex).trim();
    const rest = trimmed.slice(splitIndex + 4);
    const value = rest.endsWith(']') ? rest.slice(0, -1) : rest;
    return key ? { key, value } : null;
  }

  // Format 2: prop.name=prop.value (from system.prop or custom)
  const equalsIndex = trimmed.indexOf('=');
  if (equalsIndex > 0) {
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1).trim();
    return key ? { key, value } : null;
  }

  return null;
}

export function parsePropsText(text: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!text) return result;

  const lines = text.split('\n');
  for (const line of lines) {
    const parsed = parsePropLine(line);
    if (parsed) {
      result[parsed.key] = parsed.value;
    }
  }
  return result;
}

export function formatPropsMap(map: Record<string, string>): string {
  const keys = Object.keys(map).sort();
  return keys.map(k => `${k}=${map[k] ?? ''}`).join('\n') + (keys.length > 0 ? '\n' : '');
}

class PropsEngine {
  private cachedState: PropsState | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const res = this.queue.then(async () => {
      try {
        return await task();
      } catch (err) {
        console.error('PropsEngine operation error:', err);
        throw err;
      }
    });
    this.queue = res.catch(() => {});
    return res;
  }

  public getCachedState(): PropsState | null {
    return this.cachedState;
  }

  /**
   * Fetches the complete system properties state including defaults, custom overrides,
   * module boot properties, and live getprop values.
   */
  public async fetchProps(forceRefresh = false): Promise<PropsState> {
    if (this.cachedState && !forceRefresh) {
      return this.cachedState;
    }

    return this.enqueue(async () => {
      if (this.cachedState && !forceRefresh) {
        return this.cachedState;
      }

      const fetchCmd = `
mod_prop="${MODULE_PROP_PATH}"
[ -d "/data/adb/modules/SweetClocker" ] && mod_prop="${ALT_MODULE_PROP_PATH}"
def_file="${DEFAULTS_PROP_PATH}"
cust_file="${CUSTOM_PROP_PATH}"

if [ ! -f "$def_file" ]; then
  getprop > "$def_file" 2>/dev/null
fi

cat "$def_file" 2>/dev/null
echo "---PROPS_CUSTOM---"
cat "$cust_file" 2>/dev/null
echo "---PROPS_BOOT---"
cat "$mod_prop" 2>/dev/null
echo "---PROPS_LIVE---"
getprop 2>/dev/null
`;

      const { stdout } = await exec(fetchCmd);
      const parts = (stdout || '').split(/---PROPS_CUSTOM---|---PROPS_BOOT---|---PROPS_LIVE---/);

      const defaultsText = parts[0] ?? '';
      const customText = parts[1] ?? '';
      const bootText = parts[2] ?? '';
      const liveText = parts[3] ?? '';

      const defaultsMap = parsePropsText(defaultsText);
      const customMap = parsePropsText(customText);
      const bootMap = parsePropsText(bootText);
      const liveMap = parsePropsText(liveText);

      const allKeys = new Set<string>([
        ...Object.keys(defaultsMap),
        ...Object.keys(customMap),
        ...Object.keys(bootMap),
        ...Object.keys(liveMap)
      ]);

      const items: SystemPropItem[] = [];

      for (const key of allKeys) {
        const hasDefault = Object.prototype.hasOwnProperty.call(defaultsMap, key);
        const defaultValue = hasDefault ? defaultsMap[key]! : '';
        const customValue = Object.prototype.hasOwnProperty.call(customMap, key) ? customMap[key]! : null;
        const applyBoot = Object.prototype.hasOwnProperty.call(bootMap, key);
        const isCustom = !hasDefault;
        const liveVal = Object.prototype.hasOwnProperty.call(liveMap, key) ? liveMap[key]! : '';
        const value = liveVal || (customValue !== null ? customValue : defaultValue);

        const isModified =
          customValue !== null ||
          applyBoot ||
          (hasDefault && defaultValue !== value);

        items.push({
          key,
          value,
          defaultValue,
          customValue,
          isModified,
          isCustom,
          applyBoot,
          isReadOnly: key.startsWith('ro.')
        });
      }

      items.sort((a, b) => a.key.localeCompare(b.key));

      const state: PropsState = {
        props: items,
        items,
        defaultsMap,
        customMap,
        bootMap
      };

      this.cachedState = state;
      return state;
    });
  }

  /**
   * Applies a single property change live via resetprop -n and conditionally
   * persists it to system.prop (boot) and .sweetclocker_props_custom.
   */
  public async applyProp(key: string, value: string, applyBoot: boolean): Promise<boolean> {
    return this.enqueue(async () => {
      const state = await this.ensureState();
      const sanitizedKey = key.trim();
      const sanitizedVal = value.trim();

      if (!sanitizedKey) return false;

      // Update in-memory maps
      state.customMap[sanitizedKey] = sanitizedVal;
      if (applyBoot) {
        state.bootMap[sanitizedKey] = sanitizedVal;
      } else {
        delete state.bootMap[sanitizedKey];
      }

      const customFileContent = formatPropsMap(state.customMap);
      const bootFileContent = formatPropsMap(state.bootMap);

      // Construct shell command
      const safeEscapedKey = sanitizedKey.replace(/'/g, "'\\''");
      const safeEscapedVal = sanitizedVal.replace(/'/g, "'\\''");

      const cmd = `
mod_prop="${MODULE_PROP_PATH}"
[ -d "/data/adb/modules/SweetClocker" ] && mod_prop="${ALT_MODULE_PROP_PATH}"
mod_dir="$(dirname "$mod_prop")"
[ -d "$mod_dir" ] || mkdir -p "$mod_dir" 2>/dev/null

# 1. Apply live via resetprop -n or setprop
if command -v resetprop >/dev/null 2>&1; then
  resetprop -n '${safeEscapedKey}' '${safeEscapedVal}' 2>/dev/null || resetprop '${safeEscapedKey}' '${safeEscapedVal}' 2>/dev/null
else
  setprop '${safeEscapedKey}' '${safeEscapedVal}' 2>/dev/null
fi

# 2. Write custom override file
cat << 'EOF_CUST' > "${CUSTOM_PROP_PATH}"
${customFileContent}EOF_CUST

# 3. Write module boot system.prop file
cat << 'EOF_BOOT' > "$mod_prop"
${bootFileContent}EOF_BOOT
chmod 0644 "$mod_prop" 2>/dev/null
`;

      const { errno } = await exec(cmd);

      // Update cached item representation
      const itemIndex = state.props.findIndex(p => p.key === sanitizedKey);
      const defaultValue = state.defaultsMap[sanitizedKey] ?? '';
      const isCustom = !Object.prototype.hasOwnProperty.call(state.defaultsMap, sanitizedKey);
      const isModified = true;

      const updatedItem: SystemPropItem = {
        key: sanitizedKey,
        value: sanitizedVal,
        defaultValue,
        customValue: sanitizedVal,
        isModified,
        isCustom,
        applyBoot,
        isReadOnly: sanitizedKey.startsWith('ro.')
      };

      if (itemIndex >= 0) {
        state.props[itemIndex] = updatedItem;
      } else {
        state.props.push(updatedItem);
        state.props.sort((a, b) => a.key.localeCompare(b.key));
      }

      return errno === 0;
    });
  }

  /**
   * Resets a property back to its default value from .sweetclocker_props_defaults,
   * removing it from system.prop and .sweetclocker_props_custom.
   */
  public async resetProp(key: string): Promise<boolean> {
    return this.enqueue(async () => {
      const state = await this.ensureState();
      const sanitizedKey = key.trim();
      if (!sanitizedKey) return false;

      const hasDefault = Object.prototype.hasOwnProperty.call(state.defaultsMap, sanitizedKey);
      const defaultVal = hasDefault ? state.defaultsMap[sanitizedKey]! : '';

      delete state.customMap[sanitizedKey];
      delete state.bootMap[sanitizedKey];

      const customFileContent = formatPropsMap(state.customMap);
      const bootFileContent = formatPropsMap(state.bootMap);

      const safeEscapedKey = sanitizedKey.replace(/'/g, "'\\''");
      const safeEscapedDefault = defaultVal.replace(/'/g, "'\\''");

      const liveResetCmd = hasDefault
        ? `if command -v resetprop >/dev/null 2>&1; then
  resetprop -n '${safeEscapedKey}' '${safeEscapedDefault}' 2>/dev/null || resetprop '${safeEscapedKey}' '${safeEscapedDefault}' 2>/dev/null
else
  setprop '${safeEscapedKey}' '${safeEscapedDefault}' 2>/dev/null
fi`
        : `if command -v resetprop >/dev/null 2>&1; then
  resetprop --delete '${safeEscapedKey}' 2>/dev/null
fi`;

      const cmd = `
mod_prop="${MODULE_PROP_PATH}"
[ -d "/data/adb/modules/SweetClocker" ] && mod_prop="${ALT_MODULE_PROP_PATH}"

# 1. Live revert
${liveResetCmd}

# 2. Write updated custom file
if [ -n "${customFileContent.trim()}" ]; then
cat << 'EOF_CUST' > "${CUSTOM_PROP_PATH}"
${customFileContent}EOF_CUST
else
  rm -f "${CUSTOM_PROP_PATH}" 2>/dev/null
fi

# 3. Write updated boot system.prop file
if [ -n "${bootFileContent.trim()}" ]; then
cat << 'EOF_BOOT' > "$mod_prop"
${bootFileContent}EOF_BOOT
  chmod 0644 "$mod_prop" 2>/dev/null
else
  rm -f "$mod_prop" 2>/dev/null
fi
`;

      const { errno } = await exec(cmd);

      // Update in-memory item
      const itemIndex = state.props.findIndex(p => p.key === sanitizedKey);
      if (itemIndex >= 0) {
        if (!hasDefault) {
          // Remove custom-added property entirely
          state.props.splice(itemIndex, 1);
        } else {
          state.props[itemIndex] = {
            key: sanitizedKey,
            value: defaultVal,
            defaultValue: defaultVal,
            customValue: null,
            isModified: false,
            isCustom: false,
            applyBoot: false,
            isReadOnly: sanitizedKey.startsWith('ro.')
          };
        }
      }

      return errno === 0;
    });
  }

  /**
   * Reverts all modified properties to their original defaults and clears custom files.
   */
  public async resetAllProps(): Promise<boolean> {
    return this.enqueue(async () => {
      const state = await this.ensureState();

      // Collect revert shell lines
      const revertCommands: string[] = [];

      for (const prop of state.props) {
        if (!prop.isModified && !prop.isCustom && !prop.applyBoot) continue;

        const safeKey = prop.key.replace(/'/g, "'\\''");
        const hasDefault = Object.prototype.hasOwnProperty.call(state.defaultsMap, prop.key);

        if (hasDefault) {
          const safeVal = state.defaultsMap[prop.key]!.replace(/'/g, "'\\''");
          revertCommands.push(`resetprop -n '${safeKey}' '${safeVal}' 2>/dev/null || setprop '${safeKey}' '${safeVal}' 2>/dev/null`);
        } else {
          revertCommands.push(`resetprop --delete '${safeKey}' 2>/dev/null`);
        }
      }

      const cmd = `
mod_prop="${MODULE_PROP_PATH}"
[ -d "/data/adb/modules/SweetClocker" ] && mod_prop="${ALT_MODULE_PROP_PATH}"

# Revert modified props live
${revertCommands.join('\n')}

# Clear custom overrides & boot props
rm -f "${CUSTOM_PROP_PATH}" 2>/dev/null
rm -f "$mod_prop" 2>/dev/null
`;

      const { errno } = await exec(cmd);

      // Clear cached maps
      state.customMap = {};
      state.bootMap = {};

      // Filter out user-created custom props, reset defaults
      state.props = state.props
        .filter(p => !p.isCustom)
        .map(p => {
          const defaultVal = state.defaultsMap[p.key] ?? p.defaultValue;
          return {
            ...p,
            value: defaultVal,
            defaultValue: defaultVal,
            customValue: null,
            isModified: false,
            applyBoot: false
          };
        });

      return errno === 0;
    });
  }

  /**
   * Imports a list of diff items, applying them live and/or setting them on boot.
   */
  public async importProps(
    diffs: PropImportDiffItem[],
    applyBoot: boolean,
    applyLive: boolean
  ): Promise<boolean> {
    return this.enqueue(async () => {
      const state = await this.ensureState();
      const liveCommands: string[] = [];

      for (const diff of diffs) {
        if (diff.selected === false) continue;

        const sanitizedKey = diff.key.trim();
        const sanitizedVal = diff.newValue.trim();
        if (!sanitizedKey) continue;

        const itemApplyBoot = diff.applyBoot !== undefined ? diff.applyBoot : applyBoot;

        state.customMap[sanitizedKey] = sanitizedVal;
        if (itemApplyBoot) {
          state.bootMap[sanitizedKey] = sanitizedVal;
        } else {
          delete state.bootMap[sanitizedKey];
        }

        if (applyLive) {
          const safeKey = sanitizedKey.replace(/'/g, "'\\''");
          const safeVal = sanitizedVal.replace(/'/g, "'\\''");
          liveCommands.push(`resetprop -n '${safeKey}' '${safeVal}' 2>/dev/null || setprop '${safeKey}' '${safeVal}' 2>/dev/null`);
        }

        // Update item in cache
        const itemIdx = state.props.findIndex(p => p.key === sanitizedKey);
        const hasDefault = Object.prototype.hasOwnProperty.call(state.defaultsMap, sanitizedKey);
        const defaultVal = hasDefault ? state.defaultsMap[sanitizedKey]! : '';
        const item: SystemPropItem = {
          key: sanitizedKey,
          value: sanitizedVal,
          defaultValue: defaultVal,
          customValue: sanitizedVal,
          isModified: true,
          isCustom: !hasDefault,
          applyBoot: itemApplyBoot,
          isReadOnly: sanitizedKey.startsWith('ro.')
        };

        if (itemIdx >= 0) {
          state.props[itemIdx] = item;
        } else {
          state.props.push(item);
        }
      }

      state.props.sort((a, b) => a.key.localeCompare(b.key));

      const customFileContent = formatPropsMap(state.customMap);
      const bootFileContent = formatPropsMap(state.bootMap);

      const cmd = `
mod_prop="${MODULE_PROP_PATH}"
[ -d "/data/adb/modules/SweetClocker" ] && mod_prop="${ALT_MODULE_PROP_PATH}"
mod_dir="$(dirname "$mod_prop")"
[ -d "$mod_dir" ] || mkdir -p "$mod_dir" 2>/dev/null

# 1. Live apply
${liveCommands.join('\n')}

# 2. Write custom override file
cat << 'EOF_CUST' > "${CUSTOM_PROP_PATH}"
${customFileContent}EOF_CUST

# 3. Write boot file
cat << 'EOF_BOOT' > "$mod_prop"
${bootFileContent}EOF_BOOT
chmod 0644 "$mod_prop" 2>/dev/null
`;

      const { errno } = await exec(cmd);
      return errno === 0;
    });
  }

  /**
   * Exports system properties as a .prop key=value text string.
   * If includeAll is false, only exports modified, custom, or boot properties.
   */
  public exportProps(includeAll: boolean): string {
    const state = this.cachedState;
    if (!state) return '';

    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);
    const header = [
      '# SweetClocker System Properties Export',
      `# Exported: ${timestamp}`,
      `# Mode: ${includeAll ? 'Full Dump' : 'Custom / Modified Only'}`,
      ''
    ];

    const targetProps = includeAll
      ? state.props
      : state.props.filter(p => p.isModified || p.isCustom || p.applyBoot || p.customValue !== null);

    const lines = targetProps.map(p => `${p.key}=${p.value}`);
    return [...header, ...lines, ''].join('\n');
  }

  private async ensureState(): Promise<PropsState> {
    if (!this.cachedState) {
      return this.fetchProps(true);
    }
    return this.cachedState;
  }
}

export const propsEngine = new PropsEngine();
export { PropsEngine };
export default propsEngine;
