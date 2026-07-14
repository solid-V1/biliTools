import { describe, expect, it } from 'vitest';
import { migrateSettings } from './storage';

describe('settings migration', () => {
  it('uses deepseek-v4-flash for a fresh install', () => {
    expect(migrateSettings({}).model).toBe('deepseek-v4-flash');
  });

  it('migrates the previous untouched default model', () => {
    expect(migrateSettings({ model: 'deepseek-chat' }).model).toBe('deepseek-v4-flash');
  });

  it('preserves a model explicitly chosen by the user', () => {
    expect(migrateSettings({ model: 'custom-model' }).model).toBe('custom-model');
    expect(migrateSettings({ settingsVersion: 2, model: 'deepseek-chat' }).model).toBe('deepseek-chat');
  });
});
