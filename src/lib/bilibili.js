import { countTranscriptCharacters } from './time.js';

const DEMO_SEGMENTS = [
  { from: 0, to: 8, content: '为什么需要个人知识库？真正的问题不是信息太少，而是需要时找不到。' },
  { from: 222, to: 231, content: '先统一信息入口，减少在多个工具之间重复搬运。' },
  { from: 555, to: 566, content: '让 AI 自动整理内容，用结构化标签替代复杂文件夹。' },
  { from: 928, to: 940, content: '建立可以长期检索的记忆，让笔记在需要时主动浮现。' },
  { from: 1266, to: 1277, content: '最后建立每周回顾流程，定期回顾比持续收集更重要。' },
];

export const DEMO_CAPTURE = {
  sourceTabId: -1,
  sourceUrl: 'https://www.bilibili.com/video/BV1DEMO/',
  video: {
    title: '如何用 AI 构建个人知识库',
    duration: 1458,
    language: 'ai-zh',
    languageLabel: 'AI 中文字幕',
  },
  segments: DEMO_SEGMENTS,
  characterCount: 1842,
  sourceAudit: {
    status: 'verified',
    tabId: -1,
    bvid: 'BV1DEMO',
    page: 1,
    cid: 'demo-cid',
    title: '如何用 AI 构建个人知识库',
    url: 'https://www.bilibili.com/video/BV1DEMO/',
    playerDuration: 1458,
    verifiedAt: Date.now(),
    runtimeCid: 'demo-cid',
    networkCid: 'demo-cid',
    sourceId: 'BV1DEMO:demo-cid:demo',
    transcriptPreview: [
      { at: 0, content: DEMO_SEGMENTS[0].content },
      { at: 1266, content: DEMO_SEGMENTS[4].content },
    ],
  },
};

export const DEMO_ANALYSIS = {
  summary:
    '这期视频从信息收集、自动整理和长期检索三个环节，演示如何搭建一套轻量的个人知识库。重点不是囤积资料，而是让笔记在需要时主动浮现。',
  keyPoints: [
    '先统一信息入口，减少重复搬运',
    '用结构化标签替代复杂文件夹',
    '定期回顾比持续收集更重要',
  ],
  chapters: [
    { start: 0, title: '为什么需要个人知识库', summary: '重新理解信息焦虑与检索成本。' },
    { start: 222, title: '统一信息入口', summary: '减少跨工具重复搬运。' },
    { start: 555, title: 'AI 自动整理与打标', summary: '用标签建立稳定结构。' },
    { start: 928, title: '建立可检索的长期记忆', summary: '让笔记在需要时浮现。' },
    { start: 1266, title: '一套可持续的回顾流程', summary: '用周期回顾维持知识库。' },
  ],
};

function chromeAvailable() {
  return typeof chrome !== 'undefined' && chrome.tabs?.sendMessage;
}

async function resolveCurrentVideoTab() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_VIDEO_TAB' });
  if (!response?.ok || !response.payload?.tabId) {
    throw new Error(response?.error || '无法识别当前正在显示的 Bilibili 视频页。');
  }
  return response.payload;
}

async function validateCurrentVideoTab(expected) {
  const response = await chrome.runtime.sendMessage({
    type: 'VALIDATE_CURRENT_VIDEO_TAB',
    expected,
  });
  if (!response?.ok) throw new Error(response?.error || '当前视频页面校验失败。');
  return response.payload;
}

async function sendToTab(tabId, message) {
  if (!tabId || tabId < 0) throw new Error('视频标签页绑定已失效，请重新抓取字幕。');
  try {
    const response = await chrome.tabs.sendMessage(tabId, message);
    if (!response?.ok) throw new Error(response?.error || '视频页面没有返回有效数据。');
    return response.payload;
  } catch (error) {
    if (String(error.message).includes('Receiving end does not exist')) {
      throw new Error('扩展更新后需要刷新一次目标 Bilibili 视频页面。');
    }
    throw error;
  }
}

async function fetchSubtitlePayload(url) {
  const response = await chrome.runtime.sendMessage({ type: 'FETCH_SUBTITLE', url });
  if (!response?.ok) throw new Error(response?.error || '字幕下载失败。');
  return response.payload;
}

function createSourceAudit(source, context, overrides = {}) {
  return {
    status: 'current',
    tabId: source.tabId,
    bvid: context.bvid,
    page: context.page,
    cid: '',
    title: context.title || source.title,
    url: context.pageUrl || source.url,
    canonicalBvid: context.canonicalBvid,
    playerDuration: context.player?.duration || 0,
    playerTime: context.player?.currentTime || 0,
    paused: context.player?.paused ?? true,
    runtimeBvid: context.runtime?.playerBvid || context.runtime?.initialBvid || '',
    runtimeCid: context.runtime?.playerCid || context.runtime?.initialCid || '',
    networkBvid: context.networkPlayer?.bvid || '',
    networkCid: context.networkPlayer?.cid || '',
    ...overrides,
  };
}

async function createTranscriptFingerprint(segments) {
  const text = segments.map((segment) => `${segment.from}|${segment.to}|${segment.content}`).join('\n');
  if (globalThis.crypto?.subtle && globalThis.TextEncoder) {
    const bytes = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function createTranscriptPreview(segments) {
  if (!segments.length) return [];
  const indexes = [...new Set([0, 1, Math.floor(segments.length / 2), segments.length - 2, segments.length - 1])]
    .filter((index) => index >= 0 && index < segments.length);
  return indexes.map((index) => ({
    at: segments[index].from,
    content: segments[index].content,
  }));
}

function getSubtitleCoverage(segments, videoDuration) {
  const subtitleDuration = segments.reduce(
    (maximum, segment) => Math.max(maximum, Number(segment.to) || Number(segment.from) || 0),
    0,
  );
  const duration = Number(videoDuration) || 0;
  return {
    subtitleDuration,
    videoDuration: duration,
    ratio: duration > 0 ? subtitleDuration / duration : 0,
  };
}

export async function inspectCurrentVideo({ demo = false } = {}) {
  if (demo || !chromeAvailable()) return DEMO_CAPTURE.sourceAudit;
  const source = await resolveCurrentVideoTab();
  const context = await sendToTab(source.tabId, {
    type: 'GET_VIDEO_CONTEXT',
    expected: { bvid: source.bvid, page: source.page },
  });
  if (context.bvid !== source.bvid || context.page !== source.page) {
    throw new Error('Chrome 当前标签页与页面播放器的视频标识不一致。');
  }
  return createSourceAudit(source, context);
}

export async function captureCurrentVideo({ demo = false, onSourceResolved } = {}) {
  if (demo || !chromeAvailable()) return DEMO_CAPTURE;

  const source = await resolveCurrentVideoTab();
  const expected = { tabId: source.tabId, bvid: source.bvid, page: source.page };
  const context = await sendToTab(source.tabId, {
    type: 'GET_VIDEO_CONTEXT',
    expected,
  });
  const currentAudit = createSourceAudit(source, context);
  onSourceResolved?.(currentAudit);
  await validateCurrentVideoTab(expected);

  const video = await sendToTab(source.tabId, {
    type: 'CAPTURE_SUBTITLE_META',
    expected,
  });
  if (
    !video?.bvid
    || video.bvid !== source.bvid
    || video.apiBvid !== source.bvid
    || video.canonicalBvid !== source.bvid
    || video.page !== source.page
    || video.pageUrl !== context.pageUrl
    || (video.runtimeBvid && video.runtimeBvid !== source.bvid)
    || (video.runtimeCid && String(video.runtimeCid) !== String(video.cid))
    || (video.networkBvid && video.networkBvid !== source.bvid)
    || (video.networkCid && String(video.networkCid) !== String(video.cid))
  ) {
    throw new Error('标签页、页面、播放器运行状态和 Bilibili 接口的视频标识不完全一致，已停止抓取。');
  }

  await validateCurrentVideoTab(expected);
  const subtitle = await fetchSubtitlePayload(video.subtitleUrl);
  await validateCurrentVideoTab(expected);
  const finalContext = await sendToTab(source.tabId, {
    type: 'GET_VIDEO_CONTEXT',
    expected,
  });
  if (finalContext.pageUrl !== video.pageUrl || finalContext.bvid !== video.bvid) {
    throw new Error('字幕下载期间当前视频发生变化，已停止抓取。');
  }

  const segments = Array.isArray(subtitle?.body)
    ? subtitle.body
        .map((item) => ({
          from: Number(item.from) || 0,
          to: Number(item.to) || Number(item.from) || 0,
          content: String(item.content || '').trim(),
        }))
        .filter((item) => item.content)
    : [];

  if (!segments.length) throw new Error('字幕文件为空，暂时无法生成摘要。');
  const transcriptHash = await createTranscriptFingerprint(segments);
  const sourceId = `${video.bvid}:${video.cid}:${transcriptHash.slice(0, 16)}`;
  const transcriptPreview = createTranscriptPreview(segments);
  const coverage = getSubtitleCoverage(segments, video.duration || video.player?.duration);
  video.sourceId = sourceId;
  video.transcriptHash = transcriptHash;
  video.subtitleDuration = coverage.subtitleDuration;
  video.subtitleCoverage = coverage.ratio;
  const auditDetails = {
    cid: String(video.cid),
    title: video.title,
    language: video.languageLabel || video.language,
    runtimeBvid: video.runtimeBvid,
    runtimeCid: String(video.runtimeCid || ''),
    networkBvid: video.networkBvid,
    networkCid: String(video.networkCid || ''),
    identityEvidence: video.identityEvidence,
    sourceId,
    transcriptHash,
    transcriptPreview,
    subtitleCount: segments.length,
    subtitleDuration: coverage.subtitleDuration,
    subtitleCoverage: coverage.ratio,
  };

  if (
    coverage.videoDuration >= 120
    && coverage.subtitleDuration < coverage.videoDuration - 45
    && coverage.ratio < 0.55
  ) {
    onSourceResolved?.(createSourceAudit(source, finalContext, {
      ...auditDetails,
      status: 'error',
      message: `字幕时间轴只覆盖视频的 ${Math.round(coverage.ratio * 100)}%，这份字幕很可能属于其他视频，已禁止使用。`,
    }));
    throw new Error(`字幕只覆盖到 ${Math.round(coverage.subtitleDuration)} 秒，但视频长 ${Math.round(coverage.videoDuration)} 秒（覆盖 ${Math.round(coverage.ratio * 100)}%）。已判定为异常字幕并停止分析。`);
  }

  if (coverage.videoDuration && coverage.subtitleDuration > coverage.videoDuration + 60) {
    onSourceResolved?.(createSourceAudit(source, finalContext, {
      ...auditDetails,
      status: 'error',
      message: '字幕时间轴超过视频总时长，这份字幕很可能属于其他视频，已禁止使用。',
    }));
    throw new Error(`字幕时间轴为 ${Math.round(coverage.subtitleDuration)} 秒，超过视频时长 ${Math.round(coverage.videoDuration)} 秒。已停止分析。`);
  }
  const sourceAudit = createSourceAudit(source, finalContext, {
    status: 'verified',
    ...auditDetails,
    verifiedAt: Date.now(),
  });
  onSourceResolved?.(sourceAudit);
  return {
    sourceTabId: source.tabId,
    sourceUrl: video.pageUrl,
    sourceAudit,
    video,
    segments,
    characterCount: countTranscriptCharacters(segments),
  };
}

export async function seekCurrentVideo(seconds, { demo = false, tabId, bvid, page } = {}) {
  if (demo || !chromeAvailable()) return true;
  await sendToTab(tabId, { type: 'SEEK_TO', seconds, expected: { bvid, page } });
  return true;
}

export async function getPlaybackState({ demo = false, tabId, bvid, page, demoTime = 0 } = {}) {
  if (demo || !chromeAvailable()) {
    return { currentTime: demoTime, duration: DEMO_CAPTURE.video.duration, paused: false };
  }
  const playback = await sendToTab(tabId, { type: 'GET_PLAYBACK_STATE', expected: { bvid, page } });
  if (playback.bvid !== bvid || playback.page !== page) {
    throw new Error('当前播放器已经切换到其他视频，字幕跟随已停止。');
  }
  return playback;
}
