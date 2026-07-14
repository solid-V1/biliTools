import { describe, expect, it } from 'vitest';
import { countTranscriptCharacters, findActiveSegmentIndex, formatTime, transcriptToText } from './time';

describe('time helpers', () => {
  it('formats video timestamps', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(222.9)).toBe('03:42');
    expect(formatTime(3723)).toBe('1:02:03');
  });

  it('creates timestamped transcript text', () => {
    expect(transcriptToText([{ from: 12.5, content: '字幕文字' }])).toBe('[00:12] 字幕文字');
  });

  it('counts visible transcript characters', () => {
    expect(countTranscriptCharacters([{ content: ' 你好 ' }, { content: '世界' }])).toBe(4);
  });

  it('finds the subtitle at the current playback position', () => {
    const segments = [{ from: 0 }, { from: 12.5 }, { from: 18.3 }];
    expect(findActiveSegmentIndex(segments, 0)).toBe(0);
    expect(findActiveSegmentIndex(segments, 15)).toBe(1);
    expect(findActiveSegmentIndex(segments, 99)).toBe(2);
  });
});
