import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BrandMark, CloseIcon, RefreshIcon, SettingsIcon } from './components/Icons';
import { MainPanel } from './components/MainPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { analyzeTranscript } from './lib/deepseek';
import { captureCurrentVideo, DEMO_ANALYSIS, DEMO_CAPTURE, getPlaybackState, inspectCurrentVideo, seekCurrentVideo } from './lib/bilibili';
import { formatTime } from './lib/time';
import { getDefaultSettings, loadSettings } from './lib/storage';

function notesAsPlainText(capture, analysis) {
  const lines = [
    capture.video.title,
    `来源：${capture.video.bvid} · CID ${capture.video.cid} · 字幕指纹 ${capture.video.sourceId || '无'}`,
    '',
    '视频讲了什么',
    analysis.summary,
    '',
    '关键要点',
    ...analysis.keyPoints.map((point) => `- ${point}`),
    '',
    '章节时间线',
    ...analysis.chapters.map((chapter) => `${formatTime(chapter.start)}  ${chapter.title}\n${chapter.summary}`),
    '',
    '字幕原文',
    ...capture.segments.map((segment) => `[${formatTime(segment.from)}] ${segment.content}`),
  ];
  return lines.join('\n');
}

export function App() {
  const demo = useMemo(() => new URLSearchParams(window.location.search).has('demo'), []);
  const [view, setView] = useState('main');
  const [settings, setSettings] = useState(getDefaultSettings);
  const [status, setStatus] = useState(demo ? 'success' : 'idle');
  const [stageText, setStageText] = useState('正在读取字幕…');
  const [capture, setCapture] = useState(demo ? DEMO_CAPTURE : null);
  const [analysis, setAnalysis] = useState(demo ? DEMO_ANALYSIS : null);
  const [activeTab, setActiveTab] = useState('summary');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [copied, setCopied] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const [followPlayback, setFollowPlayback] = useState(true);
  const [sourceAudit, setSourceAudit] = useState(demo ? DEMO_CAPTURE.sourceAudit : { status: 'checking' });
  const pendingCapture = useRef(null);
  const captureOperation = useRef(0);

  useEffect(() => {
    loadSettings().then(setSettings).catch(() => {});
  }, []);

  useEffect(() => {
    if (demo) return undefined;
    let cancelled = false;
    inspectCurrentVideo()
      .then((audit) => { if (!cancelled && captureOperation.current === 0) setSourceAudit(audit); })
      .catch((inspectError) => {
        if (!cancelled && captureOperation.current === 0) setSourceAudit({ status: 'error', message: inspectError.message });
      });
    return () => { cancelled = true; };
  }, [demo]);

  useEffect(() => {
    if (activeTab !== 'transcript' || !capture?.sourceTabId || demo) return undefined;
    let cancelled = false;
    let timerId;

    const pollPlayback = async () => {
      try {
        const playback = await getPlaybackState({
          demo,
          tabId: capture.sourceTabId,
          bvid: capture.video.bvid,
          page: capture.video.page,
        });
        if (!cancelled) setPlaybackTime(playback.currentTime);
      } catch {
        // A temporary navigation or player reload should not destroy the saved notes.
      } finally {
        if (!cancelled) timerId = window.setTimeout(pollPlayback, 700);
      }
    };

    pollPlayback();
    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [activeTab, capture?.sourceTabId, capture?.video?.bvid, capture?.video?.page, demo]);

  const runAnalysis = async (captured, activeSettings, operationId) => {
    setStatus('analyzing');
    setStageText('正在生成摘要与章节…');
    setError('');
    try {
      const nextAnalysis = demo
        ? DEMO_ANALYSIS
        : await analyzeTranscript({
            ...captured,
            settings: activeSettings,
            onProgress: (text) => {
              if (operationId === captureOperation.current) setStageText(text);
            },
          });
      if (operationId !== captureOperation.current) return;
      setAnalysis(nextAnalysis);
      setActiveTab('summary');
      setStatus('success');
      pendingCapture.current = null;
    } catch (analysisError) {
      if (operationId !== captureOperation.current) return;
      setStatus('error');
      setError(analysisError.message);
    }
  };

  const handleCapture = async () => {
    const operationId = captureOperation.current + 1;
    captureOperation.current = operationId;
    setStatus('capturing');
    setStageText('正在读取字幕…');
    setError('');
    setCopied(false);
    setCapture(null);
    setAnalysis(null);
    setPlaybackTime(0);
    pendingCapture.current = null;
    setSourceAudit((previous) => ({ ...previous, status: 'checking', message: '' }));
    try {
      const captured = await captureCurrentVideo({
        demo,
        onSourceResolved: (audit) => {
          if (operationId === captureOperation.current) setSourceAudit(audit);
        },
      });
      if (operationId !== captureOperation.current) return;
      setCapture(captured);
      setSourceAudit(captured.sourceAudit);
      pendingCapture.current = captured;
      if (!settings.apiKey.trim() && !demo) {
        setStatus('idle');
        setNotice(`已抓取 ${captured.characterCount.toLocaleString('zh-CN')} 字字幕，保存 API 设置后会自动继续分析。`);
        setView('settings');
        return;
      }
      await runAnalysis(captured, settings, operationId);
    } catch (captureError) {
      if (operationId !== captureOperation.current) return;
      setStatus('error');
      setError(captureError.message);
      setSourceAudit((previous) => ({
        ...previous,
        status: 'error',
        message: captureError.message,
      }));
    }
  };

  const handleSettingsSaved = async (nextSettings) => {
    setSettings(nextSettings);
    if (pendingCapture.current) {
      setView('main');
      setNotice('');
      await runAnalysis(pendingCapture.current, nextSettings, captureOperation.current);
    }
  };

  const handleSeek = async (seconds) => {
    setError('');
    setPlaybackTime(seconds);
    try {
      await seekCurrentVideo(seconds, {
        demo,
        tabId: capture?.sourceTabId,
        bvid: capture?.video?.bvid,
        page: capture?.video?.page,
      });
    } catch (seekError) {
      setError(seekError.message);
    }
  };

  const handleCopy = async () => {
    if (!capture || !analysis) return;
    try {
      await navigator.clipboard.writeText(notesAsPlainText(capture, analysis));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('复制失败，请检查浏览器的剪贴板权限。');
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <button className="brand" type="button" onClick={() => setView('main')} aria-label="返回哔力大增主面板">
          <BrandMark size={31} />
          <span>哔力大增</span>
        </button>
        <div className="header-actions">
          <button className="icon-button" type="button" onClick={handleCapture} aria-label="重新抓取字幕" disabled={status === 'capturing' || status === 'analyzing'}><RefreshIcon /></button>
          <button className={`icon-button${view === 'settings' ? ' is-active' : ''}`} type="button" onClick={() => setView('settings')} aria-label="打开 API 设置"><SettingsIcon /></button>
          <button className="icon-button close-action" type="button" onClick={() => window.close()} aria-label="关闭侧边栏"><CloseIcon /></button>
        </div>
      </header>

      {view === 'settings' ? (
        <SettingsPanel
          initialSettings={settings}
          notice={notice}
          onBack={() => setView('main')}
          onSaved={handleSettingsSaved}
        />
      ) : (
        <MainPanel
          status={status}
          stageText={stageText}
          error={error}
          sourceAudit={sourceAudit}
          capture={capture}
          analysis={analysis}
          activeTab={activeTab}
          copied={copied}
          playbackTime={playbackTime}
          followPlayback={followPlayback}
          onCapture={handleCapture}
          onTabChange={setActiveTab}
          onFollowPlaybackChange={setFollowPlayback}
          onSeek={handleSeek}
          onCopy={handleCopy}
        />
      )}

      <footer className="partner-footer">
        <a href="https://itssold.net" target="_blank" rel="noopener noreferrer" aria-label="访问 itsSOLD：超多产品线索">
          <img src="/assets/itssold-logo.png" alt="itsSOLD" />
          <span>超多产品线索</span>
        </a>
      </footer>
    </div>
  );
}
