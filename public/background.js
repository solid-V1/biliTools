const SUBTITLE_HOST_SUFFIXES = ['.hdslb.com', '.bilivideo.com', '.bilibili.com'];
const VIDEO_URL_PATTERN = /^https?:\/\/[^/]*\.bilibili\.com\/video\/(BV[0-9A-Za-z]+)/i;

function getBvidFromUrl(url = '') {
  return url.match(VIDEO_URL_PATTERN)?.[1] || '';
}

function getPageFromUrl(url = '') {
  try {
    return Math.max(1, Number(new URL(url).searchParams.get('p')) || 1);
  } catch {
    return 1;
  }
}

function isBilibiliVideoTab(tab) {
  return Boolean(tab?.id && getBvidFromUrl(tab.url));
}

function tabSnapshot(tab) {
  return {
    tabId: tab.id,
    windowId: tab.windowId,
    url: tab.url,
    title: tab.title || '',
    bvid: getBvidFromUrl(tab.url),
    page: getPageFromUrl(tab.url),
  };
}

async function resolveCurrentVideoTab() {
  const tabs = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const tab = tabs[0];
  if (!isBilibiliVideoTab(tab)) {
    throw new Error('当前活动页面不是 Bilibili 视频页，请先点回正在播放的视频页面。');
  }
  return tab;
}

async function validateCurrentVideoTab(expected = {}) {
  const current = await resolveCurrentVideoTab();
  const actual = tabSnapshot(current);
  if (
    actual.tabId !== expected.tabId
    || actual.bvid !== expected.bvid
    || actual.page !== Number(expected.page || 1)
  ) {
    throw new Error(`当前页面已经变化：期望 ${expected.bvid || '未知视频'}，实际 ${actual.bvid || '未知视频'}。已停止抓取。`);
  }
  return actual;
}

async function configureSidePanel() {
  await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
}

chrome.runtime.onInstalled.addListener(() => configureSidePanel().catch(() => {}));
chrome.runtime.onStartup.addListener(() => configureSidePanel().catch(() => {}));
configureSidePanel().catch(() => {});

function isAllowedSubtitleUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:'
      && SUBTITLE_HOST_SUFFIXES.some(
        (suffix) => url.hostname === suffix.slice(1) || url.hostname.endsWith(suffix),
      )
    );
  } catch {
    return false;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_CURRENT_VIDEO_TAB') {
    resolveCurrentVideoTab()
      .then((tab) => sendResponse({ ok: true, payload: tabSnapshot(tab) }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'VALIDATE_CURRENT_VIDEO_TAB') {
    validateCurrentVideoTab(message.expected)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type !== 'FETCH_SUBTITLE') return false;

  if (!isAllowedSubtitleUrl(message.url)) {
    sendResponse({ ok: false, error: '字幕地址不在允许的 Bilibili 域名内。' });
    return false;
  }

  fetch(message.url, { credentials: 'include', cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) throw new Error(`字幕下载失败（HTTP ${response.status}）`);
      const payload = await response.json();
      sendResponse({ ok: true, payload });
    })
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});
