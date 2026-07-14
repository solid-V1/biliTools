const SETTINGS_KEY = 'biliCaptionNotesSettings';
const SETTINGS_VERSION = 2;
const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  baseUrl: 'https://api.deepseek.com',
  apiKey: '',
  model: 'deepseek-v4-flash',
  temperature: 0.3,
  maxTokens: 4096,
};

const hasChromeStorage = () => typeof chrome !== 'undefined' && chrome.storage?.local;

export function migrateSettings(storedSettings = {}) {
  const migrated = { ...DEFAULT_SETTINGS, ...storedSettings, settingsVersion: SETTINGS_VERSION };
  if (!storedSettings.settingsVersion && (!storedSettings.model || storedSettings.model === 'deepseek-chat')) {
    migrated.model = DEFAULT_SETTINGS.model;
  }
  return migrated;
}

export async function loadSettings() {
  if (hasChromeStorage()) {
    const result = await chrome.storage.local.get(SETTINGS_KEY);
    return migrateSettings(result[SETTINGS_KEY]);
  }

  try {
    return migrateSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'));
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings) {
  const normalized = migrateSettings(settings);
  if (hasChromeStorage()) {
    await chrome.storage.local.set({ [SETTINGS_KEY]: normalized });
  } else {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(normalized));
  }
  return normalized;
}

export function getDefaultSettings() {
  return { ...DEFAULT_SETTINGS };
}

export async function requestApiOriginPermission(baseUrl) {
  const url = new URL(baseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('API 地址必须以 http:// 或 https:// 开头。');
  }

  if (typeof chrome === 'undefined' || !chrome.permissions?.request) return true;
  const origin = `${url.protocol}//${url.host}/*`;
  const granted = await chrome.permissions.request({ origins: [origin] });
  if (!granted) throw new Error('需要允许访问该 API 域名，才能生成摘要。');
  return true;
}
