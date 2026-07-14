import React, { useEffect, useState } from 'react';
import { ArrowLeftIcon, CheckIcon, EyeIcon, EyeOffIcon, LockIcon } from './Icons';
import { requestApiOriginPermission, saveSettings } from '../lib/storage';

export function SettingsPanel({ initialSettings, notice, onBack, onSaved }) {
  const [form, setForm] = useState(initialSettings);
  const [showKey, setShowKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(initialSettings);
  }, [initialSettings]);

  const update = (key) => (event) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (!form.baseUrl.trim()) throw new Error('请填写 API 地址。');
      if (!form.apiKey.trim()) throw new Error('请填写 API Key。');
      if (!form.model.trim()) throw new Error('请填写模型名称。');
      await requestApiOriginPermission(form.baseUrl);
      const normalized = await saveSettings({
        ...form,
        temperature: Number(form.temperature),
        maxTokens: Number(form.maxTokens),
      });
      setSaved(true);
      await onSaved(normalized);
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="settings-page">
      <div className="page-heading">
        <button className="icon-button icon-button--boxed" type="button" onClick={onBack} aria-label="返回主面板">
          <ArrowLeftIcon />
        </button>
        <h1>API 设置</h1>
      </div>

      {notice ? <div className="notice-banner"><CheckIcon size={18} />{notice}</div> : null}

      <form className="settings-form" onSubmit={handleSubmit}>
        <label className="field">
          <span>API 地址</span>
          <input type="url" value={form.baseUrl} onChange={update('baseUrl')} placeholder="https://api.deepseek.com" autoComplete="url" />
        </label>

        <label className="field">
          <span>API Key</span>
          <div className="input-with-action">
            <input type={showKey ? 'text' : 'password'} value={form.apiKey} onChange={update('apiKey')} placeholder="sk-..." autoComplete="off" spellCheck="false" />
            <button type="button" onClick={() => setShowKey((value) => !value)} aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}>
              {showKey ? <EyeOffIcon size={19} /> : <EyeIcon size={19} />}
            </button>
          </div>
        </label>

        <label className="field">
          <span>模型名称</span>
          <input type="text" value={form.model} onChange={update('model')} placeholder="deepseek-v4-flash" spellCheck="false" />
        </label>

        <details className="advanced-settings">
          <summary>高级选项 <span>可选</span></summary>
          <div className="advanced-grid">
            <label className="field">
              <span>温度</span>
              <input type="number" min="0" max="2" step="0.1" value={form.temperature} onChange={update('temperature')} />
              <small>范围 0～2，越低越稳定</small>
            </label>
            <label className="field">
              <span>最大输出长度</span>
              <input type="number" min="1024" max="16384" step="256" value={form.maxTokens} onChange={update('maxTokens')} />
              <small>建议 4096 或以上</small>
            </label>
          </div>
        </details>

        <p className="privacy-note"><LockIcon size={16} />密钥仅保存在本机浏览器中</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <button className="primary-button" type="submit" disabled={saving}>
          {saving ? <span className="button-spinner" /> : <CheckIcon size={19} />}
          {saving ? '正在保存…' : '保存设置'}
        </button>
        {saved ? <p className="saved-state"><CheckIcon size={17} />设置已保存</p> : null}
      </form>
    </main>
  );
}
