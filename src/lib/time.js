export function formatTime(totalSeconds) {
  const safeSeconds = Math.max(0, Math.floor(Number(totalSeconds) || 0));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;
  const mmss = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return hours > 0 ? `${hours}:${mmss}` : mmss;
}

export function transcriptToText(segments) {
  return segments
    .map((segment) => `[${formatTime(segment.from)}] ${segment.content.trim()}`)
    .join('\n');
}

export function countTranscriptCharacters(segments) {
  return segments.reduce((sum, segment) => sum + segment.content.trim().length, 0);
}

export function findActiveSegmentIndex(segments, currentTime) {
  if (!segments.length) return -1;
  const time = Math.max(0, Number(currentTime) || 0);
  let low = 0;
  let high = segments.length - 1;
  let result = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (Number(segments[middle].from) <= time) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return result;
}
