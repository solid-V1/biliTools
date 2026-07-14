import { transcriptToText } from './time.js';

const DIRECT_TRANSCRIPT_LIMIT = 52000;
const CHUNK_LIMIT = 24000;

function endpointFromBaseUrl(baseUrl) {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`;
}

export function parseModelJson(rawText) {
  const cleaned = String(rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace < 0 || lastBrace <= firstBrace) throw new Error('模型没有返回可解析的 JSON。');
  return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
}

function normalizeAnalysis(value, expectedSourceId) {
  const chapters = Array.isArray(value?.chapters)
    ? value.chapters
        .map((chapter) => ({
          start: Math.max(0, Number(chapter.start) || 0),
          title: String(chapter.title || '').trim(),
          summary: String(chapter.summary || '').trim(),
        }))
        .filter((chapter) => chapter.title)
        .sort((a, b) => a.start - b.start)
    : [];

  const keyPoints = Array.isArray(value?.keyPoints)
    ? value.keyPoints.map((item) => String(item).trim()).filter(Boolean).slice(0, 8)
    : [];

  if (!String(value?.summary || '').trim() || !chapters.length) {
    throw new Error('模型返回结果缺少摘要或章节。');
  }
  if (!value?.sourceId || value.sourceId !== expectedSourceId) {
    throw new Error('模型返回的字幕指纹与本次抓取不一致，已拒绝显示这份摘要。');
  }
  if (value.sourceMatch !== true) {
    throw new Error(value.sourceMatchReason || '模型判断字幕内容与视频标题不相关，已拒绝显示这份摘要。');
  }

  return {
    sourceId: value.sourceId,
    sourceMatch: true,
    sourceMatchReason: String(value.sourceMatchReason || '').trim(),
    summary: String(value.summary).trim(),
    keyPoints,
    chapters,
  };
}

async function requestCompletion(settings, messages) {
  const response = await fetch(endpointFromBaseUrl(settings.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: Number(settings.temperature),
      max_tokens: Number(settings.maxTokens),
      response_format: { type: 'json_object' },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error?.message || `API 请求失败（HTTP ${response.status}）`);
  }
  const content = payload?.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 没有返回有效内容。');
  return content;
}

function splitTranscript(segments) {
  const chunks = [];
  let current = [];
  let currentLength = 0;
  for (const segment of segments) {
    const lineLength = segment.content.length + 16;
    if (current.length && currentLength + lineLength > CHUNK_LIMIT) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(segment);
    currentLength += lineLength;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

function finalPrompt(source, title) {
  return `你是中文视频内容编辑。请根据带时间戳的字幕，为视频《${title}》生成准确、克制、可浏览的结构化笔记。\n\n要求：\n1. summary：120-220 字总摘要，不要编造字幕外信息。\n2. keyPoints：3-6 条关键结论，每条一句话。\n3. chapters：按内容转折生成 4-12 个章节；start 必须使用字幕中真实出现的秒数；title 简洁；summary 用一句话说明本章。\n4. 只返回 JSON，不要 Markdown。格式：{"summary":"...","keyPoints":["..."],"chapters":[{"start":0,"title":"...","summary":"..."}]}\n\n字幕或分段笔记：\n${source}`;
}

export async function analyzeTranscript({ segments, video, settings, onProgress = () => {} }) {
  if (!settings.apiKey.trim()) throw new Error('请先填写 API Key。');
  if (!video.sourceId) throw new Error('本次字幕缺少来源指纹，已禁止生成摘要。');
  const sourceId = video.sourceId;
  const transcript = transcriptToText(segments);

  if (transcript.length <= DIRECT_TRANSCRIPT_LIMIT) {
    onProgress('正在生成摘要与章节…');
    const raw = await requestCompletion(settings, [
      { role: 'system', content: '你只输出严格 JSON，所有结论都必须忠于输入字幕。必须原样返回用户提供的 sourceId。' },
      { role: 'user', content: `${finalPrompt(transcript, video.title)}\n\n来源指纹 sourceId：${sourceId}\n先判断字幕与视频标题是否属于同一内容。返回 JSON 必须额外包含："sourceId":"${sourceId}","sourceMatch":true或false,"sourceMatchReason":"判断理由"。如果明显无关，sourceMatch 必须为 false。` },
    ]);
    return normalizeAnalysis(parseModelJson(raw), sourceId);
  }

  const chunks = splitTranscript(segments);
  onProgress(`视频较长，正在整理 ${chunks.length} 段字幕…`);
  const partialNotes = await Promise.all(
    chunks.map((chunk, index) =>
      requestCompletion(settings, [
        { role: 'system', content: '你只输出严格 JSON，忠实压缩字幕，不添加外部知识。' },
        {
          role: 'user',
          content: `这是视频字幕的第 ${index + 1}/${chunks.length} 段。来源指纹是 ${sourceId}。请返回 JSON：{"sourceId":"${sourceId}","notes":"完整的浓缩笔记","chapters":[{"start":秒数,"title":"候选章节","summary":"一句话"}]}。必须原样返回 sourceId，并保留关键事实和真实时间戳。\n\n${transcriptToText(chunk)}`,
        },
      ]).then((raw) => {
        const parsed = parseModelJson(raw);
        if (parsed.sourceId !== sourceId) throw new Error('模型分段结果的字幕指纹不一致，已停止合并。');
        return parsed;
      }),
    ),
  );

  onProgress('正在合并完整视频笔记…');
  const source = partialNotes
    .map((note, index) => `第 ${index + 1} 段：\n${JSON.stringify(note)}`)
    .join('\n\n');
  const raw = await requestCompletion(settings, [
    { role: 'system', content: '你只输出严格 JSON，并将分段笔记合并为连贯的视频结构。必须原样返回 sourceId。' },
    { role: 'user', content: `${finalPrompt(source, video.title)}\n\n来源指纹 sourceId：${sourceId}\n先判断字幕与视频标题是否属于同一内容。返回 JSON 必须额外包含："sourceId":"${sourceId}","sourceMatch":true或false,"sourceMatchReason":"判断理由"。如果明显无关，sourceMatch 必须为 false。` },
  ]);
  return normalizeAnalysis(parseModelJson(raw), sourceId);
}
