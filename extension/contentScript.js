(() => {
  const EXTENSION_FLAG = '__chenyifaerLiveHelperInitialized';
  if (window[EXTENSION_FLAG]) {
    console.debug('[ChenYiFaer Live Helper] 已经初始化，跳过重复执行');
    return;
  }
  window[EXTENSION_FLAG] = true;

  const DEBUG_PREFIX = '[ChenYiFaer Live Helper]';
  const CHANNEL_STREAMS_URL = 'https://www.youtube.com/@chenyifaer/streams';
  const LOGIN_CHECK_INTERVAL_MS = 5000;
  const FETCH_THROTTLE_MS = 2 * 60 * 1000;
  const LOG_HISTORY_LIMIT = 200;

  const state = {
    container: null,
    loginStatusEl: null,
    fetchStatusEl: null,
    messageEl: null,
    listEl: null,
    debugEl: null,
    refreshButton: null,
    toggleDebugButton: null,
    copyLogsButton: null,
    collapseButton: null,
    isLoggedIn: null,
    fetchInProgress: false,
    lastFetchTime: 0,
    videos: [],
    logs: [],
    intervalId: null,
    pendingLogRemovalNeeded: false
  };

  function initWhenReady() {
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      init();
    } else {
      document.addEventListener('DOMContentLoaded', init, { once: true });
    }
  }

  function init() {
    if (!document.body) {
      setTimeout(init, 50);
      return;
    }

    createOverlay();
    setMessage('正在检测登录状态…');
    logDebug('扩展初始化完成', { url: window.location.href });

    evaluateLoginAndMaybeFetch(true);
    setupObservers();
  }

  function createOverlay() {
    if (state.container) {
      return;
    }

    const container = document.createElement('section');
    container.className = 'clh-container';
    container.dataset.debugVisible = 'false';
    container.dataset.collapsed = 'false';
    container.dataset.loginState = 'unknown';

    const header = document.createElement('header');
    header.className = 'clh-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'clh-title-wrap';

    const title = document.createElement('h2');
    title.className = 'clh-title';
    title.textContent = '陈一发儿直播助手';

    const statusWrapper = document.createElement('div');
    statusWrapper.className = 'clh-status-wrapper';

    const loginStatusEl = document.createElement('span');
    loginStatusEl.className = 'clh-status-badge clh-login-status';
    loginStatusEl.dataset.variant = 'info';
    loginStatusEl.textContent = '状态检测中';

    const fetchStatusEl = document.createElement('span');
    fetchStatusEl.className = 'clh-status-badge clh-fetch-status';
    fetchStatusEl.dataset.variant = 'info';
    fetchStatusEl.textContent = '等待触发';

    statusWrapper.append(loginStatusEl, fetchStatusEl);
    titleWrap.append(title, statusWrapper);

    const buttonWrap = document.createElement('div');
    buttonWrap.className = 'clh-header-buttons';

    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'clh-button';
    refreshButton.textContent = '手动刷新';
    refreshButton.addEventListener('click', () => {
      logDebug('用户触发手动刷新');
      evaluateLoginAndMaybeFetch(true, { source: 'manual' });
    });

    const toggleDebugButton = document.createElement('button');
    toggleDebugButton.type = 'button';
    toggleDebugButton.className = 'clh-button';
    toggleDebugButton.textContent = '调试面板';
    toggleDebugButton.addEventListener('click', () => {
      const visible = container.dataset.debugVisible === 'true';
      container.dataset.debugVisible = visible ? 'false' : 'true';
      logDebug(visible ? '隐藏调试面板' : '展开调试面板');
    });

    const collapseButton = document.createElement('button');
    collapseButton.type = 'button';
    collapseButton.className = 'clh-button';
    collapseButton.textContent = '折叠';
    collapseButton.addEventListener('click', () => {
      const collapsed = container.dataset.collapsed === 'true';
      container.dataset.collapsed = collapsed ? 'false' : 'true';
      collapseButton.textContent = collapsed ? '折叠' : '展开';
      logDebug(collapsed ? '展开主面板' : '折叠主面板');
    });

    const copyLogsButton = document.createElement('button');
    copyLogsButton.type = 'button';
    copyLogsButton.className = 'clh-button';
    copyLogsButton.textContent = '复制日志';
    copyLogsButton.addEventListener('click', () => {
      copyLogs();
    });
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      copyLogsButton.disabled = true;
      copyLogsButton.title = '当前环境无法使用剪贴板 API';
    }

    buttonWrap.append(refreshButton, toggleDebugButton, collapseButton, copyLogsButton);

    header.append(titleWrap, buttonWrap);

    const body = document.createElement('div');
    body.className = 'clh-body';

    const messageEl = document.createElement('p');
    messageEl.className = 'clh-message';
    messageEl.textContent = '等待状态更新…';

    const listEl = document.createElement('ul');
    listEl.className = 'clh-list';

    body.append(messageEl, listEl);

    const debugPanel = document.createElement('div');
    debugPanel.className = 'clh-debug';

    container.append(header, body, debugPanel);

    document.documentElement.appendChild(container);

    state.container = container;
    state.loginStatusEl = loginStatusEl;
    state.fetchStatusEl = fetchStatusEl;
    state.messageEl = messageEl;
    state.listEl = listEl;
    state.debugEl = debugPanel;
    state.refreshButton = refreshButton;
    state.toggleDebugButton = toggleDebugButton;
    state.copyLogsButton = copyLogsButton;
    state.collapseButton = collapseButton;

    refreshLogPanel();

    logDebug('调试覆盖层已注入');
  }

  function setupObservers() {
    if (state.intervalId) {
      clearInterval(state.intervalId);
    }

    state.intervalId = window.setInterval(() => {
      evaluateLoginAndMaybeFetch(false, { source: 'interval' });
    }, LOGIN_CHECK_INTERVAL_MS);
    logDebug('启动登录状态巡检定时器', { intervalMs: LOGIN_CHECK_INTERVAL_MS });

    const navigationHandler = () => {
      logDebug('检测到 YouTube 导航事件', { url: window.location.href });
      evaluateLoginAndMaybeFetch(true, { source: 'navigation' });
    };

    window.addEventListener('yt-navigate-finish', navigationHandler);
    window.addEventListener('yt-page-data-updated', navigationHandler);

    const visibilityHandler = () => {
      if (!document.hidden) {
        logDebug('页面重新可见，尝试刷新状态');
        evaluateLoginAndMaybeFetch(false, { source: 'visibility' });
      }
    };
    window.addEventListener('visibilitychange', visibilityHandler);

    const masthead = document.querySelector('ytd-masthead');
    if (masthead) {
      const mastheadObserver = new MutationObserver(() => {
        const detection = detectLoginState();
        if (detection.loggedIn !== state.isLoggedIn) {
          logDebug('通过 masthead DOM 变更检测到登录状态变化', detection);
          evaluateLoginAndMaybeFetch(true, { source: 'masthead-observer' });
        }
      });
      mastheadObserver.observe(masthead, { childList: true, subtree: true });
      logDebug('已开始监听 masthead 节点变化');
    } else {
      logDebug('未找到 ytd-masthead 节点，将在其出现时再挂载观察者');
      const bodyObserver = new MutationObserver((_mutations, observer) => {
        const node = document.querySelector('ytd-masthead');
        if (node) {
          logDebug('ytd-masthead 节点已出现，开始监听登录状态变化');
          const mastheadObserver = new MutationObserver(() => {
            const detection = detectLoginState();
            if (detection.loggedIn !== state.isLoggedIn) {
              logDebug('通过 masthead (延迟安装) 观察者检测到状态变化', detection);
              evaluateLoginAndMaybeFetch(true, { source: 'masthead-delayed-observer' });
            }
          });
          mastheadObserver.observe(node, { childList: true, subtree: true });
          observer.disconnect();
        }
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  function evaluateLoginAndMaybeFetch(force = false, context = {}) {
    const detection = detectLoginState();
    updateLoginStatus(detection.loggedIn, detection);

    if (state.isLoggedIn !== detection.loggedIn) {
      state.isLoggedIn = detection.loggedIn;
      logDebug('登录状态发生变化', detection);
    }

    if (!detection.loggedIn) {
      state.lastFetchTime = 0;
      updateFetchStatus('idle', '等待登录');
      setMessage('请先登录 YouTube，登录后将自动加载陈一发儿频道的直播列表。');
      renderList([]);
      return;
    }

    if (state.fetchInProgress) {
      logDebug('忽略此次获取请求：已有请求在进行中', context);
      return;
    }

    const now = Date.now();
    const elapsed = now - state.lastFetchTime;
    if (!force && state.lastFetchTime && elapsed < FETCH_THROTTLE_MS) {
      logDebug('忽略此次获取请求：命中节流策略', { elapsedMs: elapsed, context });
      updateFetchStatus('idle', `最近已更新（${formatRelativeTime(elapsed)}前）`);
      return;
    }

    fetchLiveVideos(context);
  }

  function detectLoginState() {
    const avatarButton = document.querySelector('ytd-topbar-menu-button-renderer button#avatar-btn, ytd-topbar-menu-button-renderer #avatar-btn, tp-yt-iron-icon[icon="yt-icons:account_circle"]');
    const signInLink = document.querySelector('a[href^="https://accounts.google.com/ServiceLogin"], a[href*="accounts.google.com/ServiceLogin"]');
    const badge = document.querySelector('ytd-mini-guide-entry-renderer[aria-label*="You"]');

    const loggedIn = Boolean(avatarButton || badge);
    return {
      loggedIn,
      avatarDetected: Boolean(avatarButton),
      signInButtonDetected: Boolean(signInLink),
      badgeDetected: Boolean(badge)
    };
  }

  async function fetchLiveVideos(context = {}) {
    state.fetchInProgress = true;
    if (state.refreshButton) {
      state.refreshButton.disabled = true;
    }

    updateFetchStatus('loading', '正在获取频道直播列表…');
    setMessage('正在请求陈一发儿频道的直播数据，请稍候…');
    logDebug('开始请求频道直播页面', context);

    try {
      const response = await fetch(CHANNEL_STREAMS_URL, {
        credentials: 'include',
        cache: 'no-store'
      });

      logDebug('频道页面响应已返回', { ok: response.ok, status: response.status });

      if (!response.ok) {
        throw new Error(`请求失败，状态码 ${response.status}`);
      }

      const html = await response.text();
      logDebug('已获取频道页面 HTML，开始解析', { length: html.length });

      const videos = parseLiveVideosFromHtml(html);
      state.videos = videos;
      state.lastFetchTime = Date.now();

      renderList(videos);

      if (videos.length === 0) {
        updateFetchStatus('warn', '未找到直播内容');
        setMessage('当前频道暂无直播视频，稍后再来看看吧。');
      } else {
        updateFetchStatus('success', `共获取 ${videos.length} 条直播`);
        setMessage(`成功获取 ${videos.length} 条直播视频。`);
      }

      logDebug('直播列表解析完成', {
        videoCount: videos.length,
        firstVideo: videos[0]?.title || null
      });
    } catch (error) {
      updateFetchStatus('error', '获取失败');
      setMessage(`获取直播列表失败：${error.message}`);
      logDebug('获取直播列表时发生错误', {
        message: error.message,
        stack: error.stack,
        context
      });
    } finally {
      state.fetchInProgress = false;
      if (state.refreshButton) {
        state.refreshButton.disabled = false;
      }
    }
  }

  function parseLiveVideosFromHtml(html) {
    const results = new Map();
    const videoRendererRegex = /"videoRenderer":\{([\s\S]*?)"trackingParams"/g;
    let match;

    while ((match = videoRendererRegex.exec(html))) {
      const block = match[1];
      const videoIdMatch = block.match(/"videoId":"([^"]+)"/);
      if (!videoIdMatch) {
        continue;
      }

      const videoId = videoIdMatch[1];
      if (results.has(videoId)) {
        continue;
      }

      const title = decodeText(extractTextField(block, 'title')) || '未命名直播';
      const published = decodeText(extractTextField(block, 'publishedTimeText')) || null;
      const viewCount = decodeText(extractTextField(block, 'viewCountText')) || null;
      const badges = [];

      if (/"style":"LIVE"/.test(block) || /"label":"LIVE"/.test(block)) {
        badges.push({ type: 'live', text: '正在直播' });
      }

      const upcomingMatch = block.match(/"upcomingEventData":\{"startTime":"(\d+)"(?:,"upcomingEventType":"([^"]+)")?/);
      let scheduledStart = null;
      if (upcomingMatch) {
        const timestamp = Number(upcomingMatch[1]) * 1000;
        if (Number.isFinite(timestamp)) {
          scheduledStart = new Date(timestamp);
          badges.push({ type: 'upcoming', text: '已预约直播' });
        }
      }

      const thumbnailMatch = block.match(/"thumbnails":\[\{"url":"([^"]+)"/);
      const thumbnailUrl = thumbnailMatch ? decodeText(thumbnailMatch[1]) : null;

      results.set(videoId, {
        videoId,
        title,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        publishedTimeText: published,
        viewCountText: viewCount,
        isLive: badges.some((badge) => badge.type === 'live'),
        isUpcoming: badges.some((badge) => badge.type === 'upcoming'),
        scheduledStart,
        badges,
        thumbnailUrl
      });
    }

    return Array.from(results.values());
  }

  function renderList(videos) {
    if (!state.listEl) {
      return;
    }

    state.listEl.innerHTML = '';

    if (!videos.length) {
      const emptyEl = document.createElement('li');
      emptyEl.className = 'clh-empty-hint';
      emptyEl.textContent = '暂未找到直播视频。';
      state.listEl.appendChild(emptyEl);
      return;
    }

    const fragment = document.createDocumentFragment();

    videos.forEach((video) => {
      const item = document.createElement('li');
      item.className = 'clh-item';

      const titleLink = document.createElement('a');
      titleLink.href = video.url;
      titleLink.target = '_blank';
      titleLink.rel = 'noopener noreferrer';
      titleLink.textContent = video.title;

      item.appendChild(titleLink);

      if (video.badges?.length) {
        const badgeWrap = document.createElement('div');
        badgeWrap.className = 'clh-badges';
        video.badges.forEach((badge) => {
          const badgeEl = document.createElement('span');
          badgeEl.className = 'clh-badge';
          badgeEl.dataset.type = badge.type;
          badgeEl.textContent = badge.text;
          badgeWrap.appendChild(badgeEl);
        });
        item.appendChild(badgeWrap);
      }

      const meta = document.createElement('div');
      meta.className = 'clh-meta';

      if (video.publishedTimeText) {
        const publishedEl = document.createElement('span');
        publishedEl.textContent = video.publishedTimeText;
        meta.appendChild(publishedEl);
      }

      if (video.viewCountText) {
        const viewsEl = document.createElement('span');
        viewsEl.textContent = video.viewCountText;
        meta.appendChild(viewsEl);
      }

      if (video.scheduledStart && video.isUpcoming) {
        const startEl = document.createElement('span');
        startEl.textContent = `开播时间：${formatDateTime(video.scheduledStart)}`;
        meta.appendChild(startEl);
      }

      if (meta.childElementCount > 0) {
        item.appendChild(meta);
      }

      fragment.appendChild(item);
    });

    state.listEl.appendChild(fragment);
  }

  function updateLoginStatus(loggedIn, details) {
    if (!state.loginStatusEl) {
      return;
    }

    if (loggedIn) {
      state.loginStatusEl.textContent = '已登录';
      state.loginStatusEl.dataset.variant = 'ok';
      if (state.container) {
        state.container.dataset.loginState = 'signed-in';
      }
    } else {
      state.loginStatusEl.textContent = '未登录';
      state.loginStatusEl.dataset.variant = 'warn';
      if (state.container) {
        state.container.dataset.loginState = 'signed-out';
      }
    }

    state.loginStatusEl.title = `avatar: ${details.avatarDetected ? '是' : '否'} | badge: ${details.badgeDetected ? '是' : '否'} | signInButton: ${details.signInButtonDetected ? '是' : '否'}`;
  }

  function updateFetchStatus(status, text) {
    if (!state.fetchStatusEl) {
      return;
    }

    state.fetchStatusEl.textContent = text;

    switch (status) {
      case 'loading':
        state.fetchStatusEl.dataset.variant = 'info';
        break;
      case 'success':
        state.fetchStatusEl.dataset.variant = 'ok';
        break;
      case 'warn':
        state.fetchStatusEl.dataset.variant = 'warn';
        break;
      case 'error':
        state.fetchStatusEl.dataset.variant = 'error';
        break;
      default:
        state.fetchStatusEl.dataset.variant = 'info';
    }
  }

  function setMessage(text) {
    if (state.messageEl) {
      state.messageEl.textContent = text;
    }
  }

  function copyLogs() {
    const logText = state.logs
      .map((entry) => {
        const timestamp = entry.timestamp.toISOString();
        const details = entry.details ? `\n${formatDetails(entry.details)}` : '';
        return `[${timestamp}] ${entry.message}${details}`;
      })
      .join('\n');

    if (!logText) {
      logDebug('暂无可复制的日志');
      return;
    }

    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      logDebug('剪贴板 API 不可用，无法复制日志');
      return;
    }

    navigator.clipboard.writeText(logText).then(() => {
      logDebug('日志已复制到剪贴板', { lines: state.logs.length });
    }).catch((error) => {
      logDebug('复制日志到剪贴板失败', { message: error.message });
    });
  }

  function refreshLogPanel() {
    if (!state.debugEl) {
      return;
    }
    state.debugEl.innerHTML = '';
    state.logs.forEach((entry) => {
      const element = createLogElement(entry);
      state.debugEl.appendChild(element);
    });
    state.debugEl.scrollTop = state.debugEl.scrollHeight;
  }

  function createLogElement(entry) {
    const row = document.createElement('div');
    row.className = 'clh-debug-entry';

    const timeEl = document.createElement('span');
    timeEl.className = 'clh-debug-time';
    timeEl.textContent = formatTime(entry.timestamp);

    const messageEl = document.createElement('span');
    messageEl.className = 'clh-debug-message';
    messageEl.textContent = entry.message;

    row.append(timeEl, messageEl);

    if (entry.details !== undefined && entry.details !== null) {
      const detailEl = document.createElement('pre');
      detailEl.className = 'clh-debug-detail';
      detailEl.textContent = formatDetails(entry.details);
      row.appendChild(detailEl);
    }

    return row;
  }

  function logDebug(message, details) {
    const entry = {
      timestamp: new Date(),
      message,
      details
    };

    state.logs.push(entry);
    if (state.logs.length > LOG_HISTORY_LIMIT) {
      state.logs.shift();
      if (state.debugEl && state.debugEl.firstChild) {
        state.debugEl.removeChild(state.debugEl.firstChild);
      } else if (!state.debugEl) {
        state.pendingLogRemovalNeeded = true;
      }
    }

    console.debug(`${DEBUG_PREFIX} ${message}`, details ?? '');

    if (!state.debugEl) {
      return;
    }

    if (state.pendingLogRemovalNeeded) {
      refreshLogPanel();
      state.pendingLogRemovalNeeded = false;
    } else {
      const element = createLogElement(entry);
      state.debugEl.appendChild(element);
      state.debugEl.scrollTop = state.debugEl.scrollHeight;
    }
  }

  function extractTextField(block, key) {
    const simpleTextPattern = new RegExp(`"${key}":\\{"simpleText":"([^"]+)"`);
    const simpleMatch = block.match(simpleTextPattern);
    if (simpleMatch) {
      return simpleMatch[1];
    }
    const runsPattern = new RegExp(`"${key}":\\{"runs":\\[\\{"text":"([^"]+)"`);
    const runsMatch = block.match(runsPattern);
    if (runsMatch) {
      return runsMatch[1];
    }
    return null;
  }

  function decodeText(text) {
    if (!text) {
      return text;
    }
    try {
      const escaped = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
      return JSON.parse(`"${escaped}"`);
    } catch (_error) {
      return text
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, code) => String.fromCharCode(parseInt(code, 16)))
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t');
    }
  }

  function formatDateTime(date) {
    const options = {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    };
    try {
      return new Intl.DateTimeFormat('zh-CN', options).format(date);
    } catch (_error) {
      return date.toLocaleString();
    }
  }

  function formatTime(date) {
    return date.toLocaleTimeString('zh-CN', { hour12: false });
  }

  function formatRelativeTime(ms) {
    const seconds = Math.max(0, Math.floor(ms / 1000));
    if (seconds < 60) {
      return `${seconds} 秒`;
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `${minutes} 分钟`;
    }
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
      return `${hours} 小时`;
    }
    const days = Math.floor(hours / 24);
    return `${days} 天`;
  }

  function formatDetails(details) {
    if (details === null || details === undefined) {
      return '';
    }
    if (typeof details === 'string') {
      return details;
    }
    try {
      return JSON.stringify(details, (_key, value) => {
        if (value instanceof Node) {
          return `[Node ${value.nodeName}]`;
        }
        if (value instanceof Window) {
          return '[Window]';
        }
        return value;
      }, 2);
    } catch (_error) {
      return String(details);
    }
  }

  initWhenReady();
})();
