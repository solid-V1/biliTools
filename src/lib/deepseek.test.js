import { afterEach, describe, expect, it, vi } from 'vitest';
import { analyzeTranscript, parseModelJson } from './deepseek';

afterEach(() => vi.unstubAllGlobals());

describe('parseModelJson', () => {
  it('accepts fenced JSON', () => {
    expect(parseModelJson('```json\n{"summary":"ok"}\n```')).toEqual({ summary: 'ok' });
  });

  it('extracts JSON from a short preface', () => {
    expect(parseModelJson('结果如下：{"chapters":[]}')).toEqual({ chapters: [] });
  });
});

describe('analyzeTranscript source binding', () => {
  it('rejects a model response carrying a stale subtitle fingerprint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          sourceId: 'BV1OLD:1:old',
          summary: '错误摘要',
          keyPoints: ['错误内容'],
          chapters: [{ start: 0, title: '错误章节', summary: '错误内容' }],
        }) } }],
      }),
    })));

    await expect(analyzeTranscript({
      segments: [{ from: 0, to: 2, content: '当前视频的真实字幕' }],
      video: { title: '当前视频', sourceId: 'BV1CURRENT:987654:new' },
      settings: {
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com',
        model: 'test-model',
        temperature: 0.3,
        maxTokens: 4096,
      },
    })).rejects.toThrow('字幕指纹与本次抓取不一致');
  });

  it('rejects a model response that says the transcript does not match the video title', async () => {
    const sourceId = 'BV1CURRENT:987654:new';
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: JSON.stringify({
          sourceId,
          sourceMatch: false,
          sourceMatchReason: '字幕讨论手机，标题讨论小吃',
          summary: '错误摘要',
          keyPoints: ['错误内容'],
          chapters: [{ start: 0, title: '错误章节', summary: '错误内容' }],
        }) } }],
      }),
    })));

    await expect(analyzeTranscript({
      segments: [{ from: 0, to: 2, content: '小米手机和 iPhone 对比' }],
      video: { title: '西安街头小吃', sourceId },
      settings: {
        apiKey: 'test-key',
        baseUrl: 'https://api.example.com',
        model: 'test-model',
        temperature: 0.3,
        maxTokens: 4096,
      },
    })).rejects.toThrow('字幕讨论手机，标题讨论小吃');
  });
});
