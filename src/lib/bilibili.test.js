import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureCurrentVideo } from './bilibili';

const source = {
  tabId: 42,
  windowId: 7,
  url: 'https://www.bilibili.com/video/BV1CURRENT/?p=1',
  title: '当前视频',
  bvid: 'BV1CURRENT',
  page: 1,
};

const context = {
  bvid: 'BV1CURRENT',
  canonicalBvid: 'BV1CURRENT',
  page: 1,
  pageUrl: source.url,
  title: '当前视频',
  player: { currentTime: 12, duration: 165, paused: true, readyState: 4 },
  runtime: { playerBvid: 'BV1CURRENT', playerCid: '987654' },
  networkPlayer: { bvid: 'BV1CURRENT', cid: '987654' },
};

const video = {
  ...context,
  apiBvid: 'BV1CURRENT',
  cid: 987654,
  duration: 165,
  runtimeBvid: 'BV1CURRENT',
  runtimeCid: '987654',
  networkBvid: 'BV1CURRENT',
  networkCid: '987654',
  identityEvidence: ['播放器内部', '播放器网络请求'],
  language: 'ai-zh',
  languageLabel: 'AI 中文字幕',
  subtitleUrl: 'https://aisubtitle.hdslb.com/test.json',
};

function installChromeMock({
  capturedVideo = video,
  validationError = '',
  subtitleBody = [{ from: 0, to: 165, content: '当前视频字幕' }],
} = {}) {
  const runtimeSendMessage = vi.fn(async (message) => {
    if (message.type === 'GET_CURRENT_VIDEO_TAB') return { ok: true, payload: source };
    if (message.type === 'VALIDATE_CURRENT_VIDEO_TAB') {
      return validationError ? { ok: false, error: validationError } : { ok: true, payload: source };
    }
    if (message.type === 'FETCH_SUBTITLE') {
      return { ok: true, payload: { body: subtitleBody } };
    }
    throw new Error(`unexpected runtime message: ${message.type}`);
  });

  const tabsSendMessage = vi.fn(async (_tabId, message) => {
    if (message.type === 'GET_VIDEO_CONTEXT') return { ok: true, payload: context };
    if (message.type === 'CAPTURE_SUBTITLE_META') return { ok: true, payload: capturedVideo };
    throw new Error(`unexpected tab message: ${message.type}`);
  });

  vi.stubGlobal('chrome', {
    runtime: { sendMessage: runtimeSendMessage },
    tabs: { sendMessage: tabsSendMessage },
  });
  return { runtimeSendMessage, tabsSendMessage };
}

afterEach(() => vi.unstubAllGlobals());

describe('captureCurrentVideo source verification', () => {
  it('returns subtitles only after the current tab, page, API and canonical BVID agree', async () => {
    const { runtimeSendMessage } = installChromeMock();
    const result = await captureCurrentVideo();

    expect(result.video.bvid).toBe('BV1CURRENT');
    expect(result.sourceAudit).toMatchObject({
      status: 'verified',
      tabId: 42,
      bvid: 'BV1CURRENT',
      cid: '987654',
    });
    expect(runtimeSendMessage.mock.calls.filter(([message]) => message.type === 'VALIDATE_CURRENT_VIDEO_TAB')).toHaveLength(3);
  });

  it('rejects an API response belonging to another video before downloading subtitles', async () => {
    const { runtimeSendMessage } = installChromeMock({
      capturedVideo: { ...video, apiBvid: 'BV1WRONG' },
    });

    await expect(captureCurrentVideo()).rejects.toThrow('视频标识不完全一致');
    expect(runtimeSendMessage.mock.calls.some(([message]) => message.type === 'FETCH_SUBTITLE')).toBe(false);
  });

  it('stops immediately if the active tab changes during capture', async () => {
    const { tabsSendMessage } = installChromeMock({ validationError: '当前页面已经变化' });

    await expect(captureCurrentVideo()).rejects.toThrow('当前页面已经变化');
    expect(tabsSendMessage.mock.calls.some(([, message]) => message.type === 'CAPTURE_SUBTITLE_META')).toBe(false);
  });

  it('rejects subtitles when the player runtime CID belongs to another video', async () => {
    const { runtimeSendMessage } = installChromeMock({
      capturedVideo: { ...video, runtimeCid: '111111' },
    });

    await expect(captureCurrentVideo()).rejects.toThrow('视频标识不完全一致');
    expect(runtimeSendMessage.mock.calls.some(([message]) => message.type === 'FETCH_SUBTITLE')).toBe(false);
  });

  it('rejects the reported 27:53 video when its subtitle ends around 07:01', async () => {
    installChromeMock({
      capturedVideo: { ...video, duration: 1673 },
      subtitleBody: [
        { from: 0, to: 2, content: '另一条视频字幕' },
        { from: 419, to: 421, content: '过早结束' },
      ],
    });

    await expect(captureCurrentVideo()).rejects.toThrow('覆盖 25%');
  });
});
