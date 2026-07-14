import React, { useEffect, useMemo, useRef } from 'react';
import { AlertIcon, CheckIcon, CopyIcon, PlayIcon, RefreshIcon } from './Icons';
import { findActiveSegmentIndex, formatTime } from '../lib/time';

function CaptureButton({ hasResult, busy, onClick }) {
  return (
    <button className="primary-button capture-button" type="button" onClick={onClick} disabled={busy}>
      {busy ? <span className="button-spinner" /> : <RefreshIcon size={20} />}
      {busy ? '处理中…' : hasResult ? '重新抓取当前视频' : '一键抓取字幕'}
    </button>
  );
}

function SourceAudit({ audit }) {
  const status = audit?.status || 'checking';
  const verified = status === 'verified';
  const failed = status === 'error';
  return (
    <section className={`source-audit source-audit--${status}`} aria-live="polite">
      <div className="source-audit__heading">
        <strong>{verified ? '本次实际抓取来源' : 'Chrome 当前视频页面'}</strong>
        <span>{status === 'checking' ? '正在现场核对' : failed ? '校验未通过' : verified ? '多重校验通过' : '等待抓取'}</span>
      </div>
      {audit?.bvid ? (
        <>
          <p className="source-audit__title">{audit.title || '正在读取页面标题…'}</p>
          <div className="source-audit__ids">
            <code>{audit.bvid}</code>
            <code>P{audit.page || 1}</code>
            {audit.cid ? <code>CID {audit.cid}</code> : null}
            {audit.tabId ? <code>标签页 #{audit.tabId}</code> : null}
          </div>
          <p className="source-audit__player">
            可见播放器：{formatTime(audit.playerTime || 0)} / {formatTime(audit.playerDuration || 0)}
            {audit.language ? ` · ${audit.language}` : ''}
          </p>
          {audit.cid ? (
            <p className="source-audit__identity">
              接口 CID {audit.cid}
              {audit.runtimeCid ? ` · 播放器 CID ${audit.runtimeCid}` : ''}
              {audit.networkCid ? ` · 网络 CID ${audit.networkCid}` : ''}
            </p>
          ) : null}
          {audit.sourceId ? <code className="source-audit__fingerprint">字幕指纹 {audit.sourceId}</code> : null}
          {audit.subtitleDuration !== undefined ? (
            <p className={`source-audit__coverage${audit.subtitleCoverage < 0.55 ? ' is-danger' : ''}`}>
              字幕时间轴 {formatTime(audit.subtitleDuration)} / 视频 {formatTime(audit.playerDuration || 0)}
              {audit.subtitleCoverage ? ` · 覆盖 ${Math.round(audit.subtitleCoverage * 100)}%` : ''}
            </p>
          ) : null}
          {audit.transcriptPreview?.length ? (
            <div className="source-audit__preview">
              <strong>实际下载的字幕证据（首 / 中 / 尾）</strong>
              {audit.transcriptPreview.map((item, index) => (
                <p key={`${item.at}-${index}`}><time>{formatTime(item.at)}</time><span>{item.content}</span></p>
              ))}
            </div>
          ) : null}
          <a className="source-audit__url" href={audit.url} target="_blank" rel="noreferrer" title={audit.url}>{audit.url}</a>
        </>
      ) : (
        <p className="source-audit__empty">{audit?.message || '正在读取当前活动标签页、页面地址和可见播放器…'}</p>
      )}
      {failed && audit?.bvid && audit.message ? <p className="source-audit__error">{audit.message}</p> : null}
    </section>
  );
}

function EmptyState({ busy, stageText, error, sourceAudit, onCapture }) {
  return (
    <section className="empty-state">
      <div className={`caption-orbit${busy ? ' is-spinning' : ''}`} aria-hidden="true">
        <span className="caption-orbit__track" />
        <span className="caption-orbit__mark">字</span>
      </div>
      <h1>{busy ? stageText : error ? '这次没有抓到字幕' : '把视频变成可检索的笔记'}</h1>
      <p>
        {busy
          ? '请保持目标 Bilibili 视频页面打开。'
          : error || '打开已登录的 Bilibili 视频，一次完成字幕抓取、摘要和章节整理。'}
      </p>
      <SourceAudit audit={sourceAudit} />
      <CaptureButton busy={busy} hasResult={false} onClick={onCapture} />
      {!busy && !error ? (
        <ol className="how-it-works">
          <li><span>1</span><div><strong>读取 AI 字幕</strong><small>自动绑定当前视频与分 P</small></div></li>
          <li><span>2</span><div><strong>生成结构化摘要</strong><small>调用你配置的 DeepSeek API</small></div></li>
          <li><span>3</span><div><strong>字幕跟随与跳转</strong><small>播放到哪，字幕就滚动到哪</small></div></li>
        </ol>
      ) : null}
      {error ? <div className="inline-error" role="alert"><AlertIcon size={17} />{error}</div> : null}
    </section>
  );
}

function VideoHeader({ capture, busy, onCapture }) {
  return (
    <>
      <div className="video-context">
        <div className="video-thumbnail" aria-hidden="true"><span><PlayIcon size={18} /></span></div>
        <div className="video-context__text">
          <h1>{capture.video.title}</h1>
          <p>{formatTime(capture.video.duration)} · {capture.characterCount.toLocaleString('zh-CN')} 字字幕</p>
        </div>
      </div>
      <CaptureButton busy={busy} hasResult onClick={onCapture} />
      <p className="subtitle-status"><span><CheckIcon size={14} /></span>已绑定当前视频 · {capture.video.languageLabel || '中文字幕'}</p>
    </>
  );
}

function SummaryView({ analysis }) {
  return (
    <div className="summary-view">
      <h2>视频讲了什么</h2>
      <p className="summary-copy">{analysis.summary}</p>
      {analysis.keyPoints.length ? (
        <>
          <h3>关键要点</h3>
          <ul className="key-points">
            {analysis.keyPoints.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </>
      ) : null}
    </div>
  );
}

function TimelineView({ chapters, onSeek }) {
  return (
    <ol className="timeline-list">
      {chapters.map((chapter, index) => (
        <li key={`${chapter.start}-${chapter.title}`} className={index === 0 ? 'is-current' : ''}>
          <span className="timeline-dot" />
          <button className="timestamp" type="button" onClick={() => onSeek(chapter.start)} aria-label={`跳转到 ${formatTime(chapter.start)}`}>
            {formatTime(chapter.start)}
          </button>
          <button className="chapter-copy" type="button" onClick={() => onSeek(chapter.start)}>
            <strong>{chapter.title}</strong>
            <small>{chapter.summary}</small>
          </button>
          <button className="chapter-play" type="button" onClick={() => onSeek(chapter.start)} aria-label={`播放章节：${chapter.title}`}>
            <PlayIcon size={15} />
          </button>
        </li>
      ))}
    </ol>
  );
}

function TranscriptView({ segments, currentTime, followPlayback, onFollowChange, onSeek }) {
  const scrollContainer = useRef(null);
  const rowRefs = useRef([]);
  const activeIndex = useMemo(
    () => findActiveSegmentIndex(segments, currentTime),
    [segments, currentTime],
  );

  useEffect(() => {
    if (!followPlayback || activeIndex < 0) return;
    const container = scrollContainer.current;
    const row = rowRefs.current[activeIndex];
    if (!container || !row) return;
    const top = row.offsetTop - container.clientHeight / 2 + row.clientHeight / 2;
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
  }, [activeIndex, followPlayback]);

  return (
    <div className="transcript-view">
      <div className="transcript-toolbar">
        <div>
          <strong>{segments.length} 条字幕</strong>
          <span>当前 {formatTime(currentTime)}</span>
        </div>
        <label className="follow-toggle">
          <input
            type="checkbox"
            checked={followPlayback}
            onChange={(event) => onFollowChange(event.target.checked)}
          />
          <span aria-hidden="true" />
          跟随播放
        </label>
      </div>
      <div className="transcript-scroll" ref={scrollContainer}>
        {segments.map((segment, index) => (
          <button
            key={`${segment.from}-${index}`}
            ref={(node) => { rowRefs.current[index] = node; }}
            className={`transcript-row${index === activeIndex ? ' is-active' : ''}`}
            type="button"
            onClick={() => onSeek(segment.from)}
            aria-label={`跳转到 ${formatTime(segment.from)}：${segment.content}`}
          >
            <time>{formatTime(segment.from)}</time>
            <span>{segment.content}</span>
            <PlayIcon size={14} />
          </button>
        ))}
      </div>
    </div>
  );
}

export function MainPanel({
  status,
  stageText,
  error,
  sourceAudit,
  capture,
  analysis,
  activeTab,
  copied,
  playbackTime,
  followPlayback,
  onCapture,
  onTabChange,
  onFollowPlaybackChange,
  onSeek,
  onCopy,
}) {
  const busy = status === 'capturing' || status === 'analyzing';
  if (!capture || !analysis) {
    return <EmptyState busy={busy} stageText={stageText} error={error} sourceAudit={sourceAudit} onCapture={onCapture} />;
  }

  return (
    <main className="main-page">
      <SourceAudit audit={sourceAudit || capture.sourceAudit} />
      <VideoHeader capture={capture} busy={busy} onCapture={onCapture} />
      {busy ? <div className="progress-strip"><span /><p>{stageText}</p></div> : null}
      {error ? <div className="inline-error" role="alert"><AlertIcon size={17} />{error}</div> : null}

      <section className="results-panel">
        <div className="tabs" role="tablist" aria-label="笔记视图">
          <button type="button" role="tab" aria-selected={activeTab === 'summary'} className={activeTab === 'summary' ? 'is-active' : ''} onClick={() => onTabChange('summary')}>总摘要</button>
          <button type="button" role="tab" aria-selected={activeTab === 'timeline'} className={activeTab === 'timeline' ? 'is-active' : ''} onClick={() => onTabChange('timeline')}>章节</button>
          <button type="button" role="tab" aria-selected={activeTab === 'transcript'} className={activeTab === 'transcript' ? 'is-active' : ''} onClick={() => onTabChange('transcript')}>字幕原文</button>
        </div>
        <div className={`results-content${activeTab === 'transcript' ? ' results-content--transcript' : ''}`}>
          {activeTab === 'summary' ? <SummaryView analysis={analysis} /> : null}
          {activeTab === 'timeline' ? <TimelineView chapters={analysis.chapters} onSeek={onSeek} /> : null}
          {activeTab === 'transcript' ? (
            <TranscriptView
              segments={capture.segments}
              currentTime={playbackTime}
              followPlayback={followPlayback}
              onFollowChange={onFollowPlaybackChange}
              onSeek={onSeek}
            />
          ) : null}
        </div>
      </section>

      <button className="copy-button" type="button" onClick={onCopy}>
        {copied ? <CheckIcon size={18} /> : <CopyIcon size={18} />}
        {copied ? '已复制到剪贴板' : '复制全部内容'}
      </button>
    </main>
  );
}
