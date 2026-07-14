const VIDEO_PATH_PATTERN = /\/video\/(BV[0-9A-Za-z]+)/i;
const RUNTIME_ATTRIBUTE = 'data-bili-notes-runtime';
const RUNTIME_REQUEST_EVENT = 'bili-notes-request-runtime';

function bvidFromUrl(url = '') {
  return url.match(VIDEO_PATH_PATTERN)?.[1] || '';
}

function getVisiblePlayer() {
  const candidates = [...document.querySelectorAll('video')]
    .map((video) => {
      const rect = video.getBoundingClientRect();
      const style = getComputedStyle(video);
      return {
        video,
        area: rect.width * rect.height,
        visible: rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden',
      };
    })
    .filter((item) => item.visible)
    .sort((a, b) => b.area - a.area);
  return candidates[0]?.video || null;
}

function getRuntimeSnapshot() {
  try {
    window.dispatchEvent(new Event(RUNTIME_REQUEST_EVENT));
    const raw = document.documentElement?.getAttribute(RUNTIME_ATTRIBUTE);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function getLatestPlayerRequest() {
  try {
    const entries = performance.getEntriesByType('resource')
      .filter((entry) => /\/x\/player\/(?:wbi\/)?v2(?:\?|$)/.test(entry.name));
    const latest = entries[entries.length - 1];
    if (!latest) return {};
    const url = new URL(latest.name);
    return {
      bvid: url.searchParams.get('bvid') || '',
      cid: url.searchParams.get('cid') || '',
      startTime: Number(latest.startTime) || 0,
    };
  } catch {
    return {};
  }
}

function getVideoContext() {
  const bvid = bvidFromUrl(location.href);
  if (!bvid) throw new Error('当前页面不是有效的 Bilibili 视频页。');

  const canonicalUrl = document.querySelector('link[rel="canonical"]')?.href || '';
  const canonicalBvid = bvidFromUrl(canonicalUrl);
  if (canonicalBvid && canonicalBvid !== bvid) {
    throw new Error(`页面标识不一致：地址栏是 ${bvid}，页面 canonical 是 ${canonicalBvid}。已停止抓取。`);
  }

  const player = getVisiblePlayer();
  if (!player) throw new Error('当前页面没有找到可见的视频播放器，已停止抓取。');

  const page = Math.max(1, Number(new URL(location.href).searchParams.get('p')) || 1);
  const heading = document.querySelector('h1')?.textContent?.trim() || '';
  const runtime = getRuntimeSnapshot();
  const networkPlayer = getLatestPlayerRequest();
  return {
    bvid,
    canonicalBvid: canonicalBvid || bvid,
    page,
    pageUrl: location.href,
    title: heading || document.title.replace(/_哔哩哔哩_bilibili$/i, '').trim(),
    runtime,
    networkPlayer,
    player: {
      currentTime: Number(player.currentTime) || 0,
      duration: Number(player.duration) || 0,
      paused: player.paused,
      readyState: player.readyState,
    },
  };
}

function assertRuntimeMatchesPage(context) {
  const runtimePageBvid = bvidFromUrl(context.runtime?.href || '');
  if (runtimePageBvid && runtimePageBvid !== context.bvid) {
    throw new Error(`页面运行状态仍指向 ${runtimePageBvid}，地址栏是 ${context.bvid}。请刷新视频页后再抓取。`);
  }
  if (context.runtime?.playerBvid && context.runtime.playerBvid !== context.bvid) {
    throw new Error(`播放器内部正在播放 ${context.runtime.playerBvid}，地址栏是 ${context.bvid}。已禁止抓取。`);
  }
  if (
    !context.runtime?.playerBvid
    && context.runtime?.initialBvid
    && context.runtime.initialBvid !== context.bvid
  ) {
    throw new Error(`Bilibili 页面内部仍保留 ${context.runtime.initialBvid}，地址栏是 ${context.bvid}。请刷新页面。`);
  }
}

function verifyPlayerIdentity(context, selectedPage) {
  const expectedCid = String(selectedPage.cid);
  const evidence = [];
  if (context.runtime?.playerCid) {
    evidence.push({ source: '播放器内部', cid: String(context.runtime.playerCid) });
  }
  if (context.networkPlayer?.cid) {
    evidence.push({ source: '播放器网络请求', cid: String(context.networkPlayer.cid) });
  }
  if (
    context.runtime?.initialCid
    && (!context.runtime.initialBvid || context.runtime.initialBvid === context.bvid)
  ) {
    evidence.push({ source: '页面初始化状态', cid: String(context.runtime.initialCid) });
  }

  if (!evidence.length) {
    throw new Error('无法直接读取当前播放器的 CID。请刷新 Bilibili 视频页，等播放器出现后再抓取。');
  }
  const conflict = evidence.find((item) => item.cid !== expectedCid);
  if (conflict) {
    throw new Error(`${conflict.source}的 CID 是 ${conflict.cid}，当前页面接口的 CID 是 ${expectedCid}。已禁止抓取。`);
  }
  if (
    context.networkPlayer?.bvid
    && context.networkPlayer.bvid !== context.bvid
  ) {
    throw new Error(`最近一次播放器请求属于 ${context.networkPlayer.bvid}，当前页面是 ${context.bvid}。请刷新页面。`);
  }
  return evidence.map((item) => item.source);
}

function assertExpectedContext(context, expected = {}) {
  if (expected.bvid && context.bvid !== expected.bvid) {
    throw new Error(`抓取标签页不一致：期望 ${expected.bvid}，页面实际是 ${context.bvid}。已停止抓取。`);
  }
  if (expected.page && context.page !== Number(expected.page)) {
    throw new Error(`视频分P已经变化：期望 P${expected.page}，页面实际是 P${context.page}。已停止抓取。`);
  }
}

async function fetchJson(url) {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  if (!response.ok) throw new Error(`Bilibili 接口请求失败（HTTP ${response.status}）`);
  const payload = await response.json();
  if (payload.code !== 0) throw new Error(payload.message || 'Bilibili 接口返回异常。');
  return payload.data;
}

function chooseSubtitle(subtitles = []) {
  const priorities = ['ai-zh', 'zh-CN', 'zh-Hans', 'zh'];
  for (const language of priorities) {
    const found = subtitles.find((item) => item.lan === language);
    if (found) return found;
  }
  return subtitles[0] || null;
}

function normalizedTitle(value = '') {
  return value.replace(/\s+/g, '').replace(/[｜|].*$/, '').trim();
}

async function captureSubtitleMeta(expected = {}) {
  const initial = getVideoContext();
  assertExpectedContext(initial, expected);
  assertRuntimeMatchesPage(initial);

  const view = await fetchJson(
    `https://api.bilibili.com/x/web-interface/view?bvid=${encodeURIComponent(initial.bvid)}`,
  );
  if (!view?.bvid || view.bvid !== initial.bvid) {
    throw new Error(`视频接口返回错误来源：页面是 ${initial.bvid}，接口返回 ${view?.bvid || '空'}。已停止抓取。`);
  }

  const selectedPage = view.pages?.[initial.page - 1];
  if (!selectedPage?.cid) throw new Error(`未能识别 ${initial.bvid} P${initial.page} 的 CID。`);
  const identityEvidence = verifyPlayerIdentity(initial, selectedPage);

  if (
    initial.title
    && view.title
    && normalizedTitle(initial.title) !== normalizedTitle(view.title)
  ) {
    throw new Error('页面标题与 Bilibili 接口标题不一致，页面可能仍在切换，已停止抓取。');
  }

  const apiDuration = Number(selectedPage.duration || view.duration || 0);
  const playerDuration = Number(initial.player.duration || 0);
  const durationTolerance = Math.max(5, apiDuration * 0.05);
  if (apiDuration && playerDuration && Math.abs(apiDuration - playerDuration) > durationTolerance) {
    throw new Error(`播放器与接口时长不一致（播放器 ${Math.round(playerDuration)} 秒，接口 ${Math.round(apiDuration)} 秒），已停止抓取。`);
  }

  const player = await fetchJson(
    `https://api.bilibili.com/x/player/v2?cid=${selectedPage.cid}&bvid=${encodeURIComponent(initial.bvid)}`,
  );
  const subtitle = chooseSubtitle(player?.subtitle?.subtitles);
  if (!subtitle?.subtitle_url) {
    throw new Error('这个视频没有可用字幕。请确认已登录 Bilibili，且视频提供 AI 字幕。');
  }

  const final = getVideoContext();
  assertExpectedContext(final, expected);
  assertRuntimeMatchesPage(final);
  if (final.bvid !== initial.bvid || final.page !== initial.page || final.pageUrl !== initial.pageUrl) {
    throw new Error('抓取过程中页面地址发生变化，已停止抓取。');
  }

  return {
    bvid: initial.bvid,
    apiBvid: view.bvid,
    canonicalBvid: initial.canonicalBvid,
    runtimeBvid: final.runtime?.playerBvid || final.runtime?.initialBvid || '',
    runtimeCid: final.runtime?.playerCid || final.runtime?.initialCid || '',
    networkBvid: final.networkPlayer?.bvid || '',
    networkCid: final.networkPlayer?.cid || '',
    identityEvidence,
    cid: selectedPage.cid,
    page: initial.page,
    title: view.title || initial.title || selectedPage.part || 'Bilibili 视频',
    partTitle: selectedPage.part || '',
    duration: playerDuration || apiDuration,
    language: subtitle.lan,
    languageLabel: subtitle.lan_doc || subtitle.lan,
    subtitleUrl: subtitle.subtitle_url.startsWith('//')
      ? `https:${subtitle.subtitle_url}`
      : subtitle.subtitle_url,
    pageUrl: initial.pageUrl,
    player: final.player,
  };
}

function seekTo(seconds, expected) {
  assertExpectedContext(getVideoContext(), expected);
  const video = getVisiblePlayer();
  if (!video) throw new Error('没有找到当前可见的视频播放器。');
  video.currentTime = Math.max(0, Number(seconds) || 0);
  video.play().catch(() => {});
  video.scrollIntoView({ block: 'center', behavior: 'smooth' });
}

function getPlaybackState(expected) {
  const context = getVideoContext();
  assertExpectedContext(context, expected);
  return { ...context.player, bvid: context.bvid, page: context.page };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_VIDEO_CONTEXT') {
    try {
      const payload = getVideoContext();
      assertExpectedContext(payload, message.expected);
      sendResponse({ ok: true, payload });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  }

  if (message?.type === 'CAPTURE_SUBTITLE_META') {
    captureSubtitleMeta(message.expected)
      .then((payload) => sendResponse({ ok: true, payload }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'SEEK_TO') {
    try {
      seekTo(message.seconds, message.expected);
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
    return false;
  }

  if (message?.type === 'GET_PLAYBACK_STATE') {
    try {
      sendResponse({ ok: true, payload: getPlaybackState(message.expected) });
    } catch (error) {
      sendResponse({ ok: false, error: error.message });
    }
  }

  return false;
});
