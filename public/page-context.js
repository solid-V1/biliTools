(() => {
  const ATTRIBUTE = 'data-bili-notes-runtime';
  const REQUEST_EVENT = 'bili-notes-request-runtime';

  function safeCall(target, method) {
    try {
      return typeof target?.[method] === 'function' ? target[method]() : null;
    } catch {
      return null;
    }
  }

  function firstValue(objects, keys) {
    for (const object of objects) {
      if (!object || typeof object !== 'object') continue;
      for (const key of keys) {
        const value = object[key];
        if (value !== undefined && value !== null && value !== '') return value;
      }
    }
    return '';
  }

  function publishRuntimeSnapshot() {
    const player = window.player;
    const videoInfo = safeCall(player, 'getVideoInfo');
    const playerState = safeCall(player, 'getPlayerState');
    const playerConfig = player?.config || player?.options || null;
    const initialVideo = window.__INITIAL_STATE__?.videoData || null;
    const playerObjects = [videoInfo, videoInfo?.videoData, playerState, playerConfig];

    const snapshot = {
      playerBvid: String(firstValue(playerObjects, ['bvid', 'bvidString']) || ''),
      playerCid: String(firstValue(playerObjects, ['cid']) || ''),
      initialBvid: String(firstValue([initialVideo], ['bvid']) || ''),
      initialCid: String(firstValue([initialVideo], ['cid']) || ''),
      href: location.href,
      updatedAt: Date.now(),
    };
    document.documentElement?.setAttribute(ATTRIBUTE, JSON.stringify(snapshot));
  }

  window.addEventListener(REQUEST_EVENT, publishRuntimeSnapshot);
  publishRuntimeSnapshot();
  window.setInterval(publishRuntimeSnapshot, 500);
})();
