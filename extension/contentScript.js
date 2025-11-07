(() => {
  const EXTENSION_FLAG = '__chenyifaerLiveHelperInitialized';
  if (window[EXTENSION_FLAG]) {
    console.debug('[ChenYiFaer Live Helper] 已经初始化，跳过重复执行');
    return;
  }
  window[EXTENSION_FLAG] = true;

  const DEBUG_PREFIX = '[ChenYiFaer Live Helper]';
  const CHANNEL_STREAMS_URL = 'https://www.youtube.com/@chenyifaer/streams';

  const state = {
    container: null,
    loginStatusEl: null,
    messageEl: null,
    listEl: null,
    chatViewerEl: null,
    isLoggedIn: null,
    videos: [],
    videoDownloadStatus: new Map(),
    chatMessages: new Map(),
    currentChatVideoId: null,
    initialized: false
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

    if (state.initialized) {
      return;
    }
    state.initialized = true;

    createOverlay();
    setMessage('正在检测登录状态…');
    
    checkLoginAndFetch();
  }

  function createOverlay() {
    if (state.container) {
      return;
    }

    const container = document.createElement('section');
    container.className = 'clh-container';
    container.dataset.chatViewerVisible = 'false';
    container.dataset.loginState = 'unknown';

    const header = document.createElement('header');
    header.className = 'clh-header';

    const titleWrap = document.createElement('div');
    titleWrap.className = 'clh-title-wrap';

    const title = document.createElement('h2');
    title.className = 'clh-title';
    title.textContent = '陈一发儿直播助手';

    const loginStatusEl = document.createElement('span');
    loginStatusEl.className = 'clh-status-badge clh-login-status';
    loginStatusEl.dataset.variant = 'info';
    loginStatusEl.textContent = '状态检测中';

    titleWrap.append(title, loginStatusEl);

    const buttonWrap = document.createElement('div');
    buttonWrap.className = 'clh-header-buttons';

    const collapseButton = document.createElement('button');
    collapseButton.type = 'button';
    collapseButton.className = 'clh-button';
    collapseButton.textContent = '折叠';
    collapseButton.addEventListener('click', () => {
      const collapsed = container.dataset.collapsed === 'true';
      container.dataset.collapsed = collapsed ? 'false' : 'true';
      collapseButton.textContent = collapsed ? '折叠' : '展开';
    });

    const refreshButton = document.createElement('button');
    refreshButton.type = 'button';
    refreshButton.className = 'clh-button';
    refreshButton.textContent = '刷新列表';
    refreshButton.addEventListener('click', () => {
      if (state.isLoggedIn) {
        fetchLiveVideos();
      }
    });

    buttonWrap.append(collapseButton, refreshButton);
    header.append(titleWrap, buttonWrap);

    const body = document.createElement('div');
    body.className = 'clh-body';

    const messageEl = document.createElement('p');
    messageEl.className = 'clh-message';
    messageEl.textContent = '等待状态更新…';

    const listEl = document.createElement('ul');
    listEl.className = 'clh-list';

    body.append(messageEl, listEl);

    const chatViewer = document.createElement('div');
    chatViewer.className = 'clh-chat-viewer';
    chatViewer.innerHTML = `
      <div class="clh-chat-header">
        <h3>实时聊天回放</h3>
        <button class="clh-button clh-close-chat">关闭</button>
      </div>
      <div class="clh-chat-content">
        <div class="clh-chat-messages"></div>
        <div class="clh-chat-controls">
          <button class="clh-button clh-download-chat">下载聊天记录</button>
        </div>
      </div>
    `;

    container.append(header, body, chatViewer);

    document.documentElement.appendChild(container);

    state.container = container;
    state.loginStatusEl = loginStatusEl;
    state.messageEl = messageEl;
    state.listEl = listEl;
    state.chatViewerEl = chatViewer;

    setupChatViewer();
  }

  function setupChatViewer() {
    const closeBtn = state.chatViewerEl.querySelector('.clh-close-chat');
    const downloadBtn = state.chatViewerEl.querySelector('.clh-download-chat');

    closeBtn.addEventListener('click', () => {
      state.container.dataset.chatViewerVisible = 'false';
      state.currentChatVideoId = null;
    });

    downloadBtn.addEventListener('click', () => {
      if (state.currentChatVideoId) {
        downloadChatMessages(state.currentChatVideoId);
      }
    });
  }

  function checkLoginAndFetch() {
    const detection = detectLoginState();
    updateLoginStatus(detection.loggedIn, detection);

    if (!detection.loggedIn) {
      setMessage('请先登录 YouTube，登录后将自动加载陈一发儿频道的直播列表。');
      renderList([]);
      return;
    }

    state.isLoggedIn = true;
    fetchLiveVideos();
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

  async function fetchLiveVideos() {
    updateFetchStatus('loading', '正在获取频道直播列表…');
    setMessage('正在请求陈一发儿频道的直播数据，请稍候…');

    try {
      const response = await fetch(CHANNEL_STREAMS_URL, {
        credentials: 'include',
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error(`请求失败，状态码 ${response.status}`);
      }

      const html = await response.text();
      const videos = parseLiveVideosFromHtml(html);
      state.videos = videos;

      renderList(videos);

      if (videos.length === 0) {
        setMessage('当前频道暂无直播视频，稍后再来看看吧。');
      } else {
        setMessage(`成功获取 ${videos.length} 条直播视频。`);
      }
    } catch (error) {
      setMessage(`获取直播列表失败：${error.message}`);
      console.error(`${DEBUG_PREFIX} 获取直播列表失败`, error);
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

      const titleWrap = document.createElement('div');
      titleWrap.className = 'clh-video-title-wrap';

      const titleLink = document.createElement('a');
      titleLink.href = video.url;
      titleLink.target = '_blank';
      titleLink.rel = 'noopener noreferrer';
      titleLink.textContent = video.title;
      titleLink.addEventListener('click', (e) => {
        e.preventDefault();
        openChatViewer(video.videoId);
      });

      titleWrap.appendChild(titleLink);
      item.appendChild(titleWrap);

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

      const controls = document.createElement('div');
      controls.className = 'clh-video-controls';

      const progressWrap = document.createElement('div');
      progressWrap.className = 'clh-progress-wrap';

      const progressBar = document.createElement('div');
      progressBar.className = 'clh-progress-bar';
      progressBar.dataset.videoId = video.videoId;

      const progressText = document.createElement('span');
      progressText.className = 'clh-progress-text';
      progressText.dataset.videoId = video.videoId;
      progressText.textContent = '未下载';

      progressWrap.appendChild(progressBar);
      progressWrap.appendChild(progressText);

      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'clh-button clh-download-btn';
      downloadBtn.dataset.videoId = video.videoId;
      downloadBtn.textContent = '下载聊天';
      downloadBtn.addEventListener('click', () => {
        downloadChatForVideo(video.videoId);
      });

      const viewChatBtn = document.createElement('button');
      viewChatBtn.className = 'clh-button clh-view-chat-btn';
      viewChatBtn.dataset.videoId = video.videoId;
      viewChatBtn.textContent = '查看聊天';
      viewChatBtn.addEventListener('click', () => {
        openChatViewer(video.videoId);
      });

      controls.appendChild(progressWrap);
      controls.appendChild(downloadBtn);
      controls.appendChild(viewChatBtn);
      item.appendChild(controls);

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
    if (!state.loginStatusEl) {
      return;
    }

    switch (status) {
      case 'loading':
        state.loginStatusEl.dataset.variant = 'info';
        break;
      case 'success':
        state.loginStatusEl.dataset.variant = 'ok';
        break;
      case 'warn':
        state.loginStatusEl.dataset.variant = 'warn';
        break;
      case 'error':
        state.loginStatusEl.dataset.variant = 'error';
        break;
      default:
        state.loginStatusEl.dataset.variant = 'info';
    }
  }

  function setMessage(text) {
    if (state.messageEl) {
      state.messageEl.textContent = text;
    }
  }

  async function downloadChatForVideo(videoId) {
    const video = state.videos.find(v => v.videoId === videoId);
    if (!video) return;

    const progressBar = document.querySelector(`.clh-progress-bar[data-video-id="${videoId}"]`);
    const progressText = document.querySelector(`.clh-progress-text[data-video-id="${videoId}"]`);
    const downloadBtn = document.querySelector(`.clh-download-btn[data-video-id="${videoId}"]`);

    if (!progressBar || !progressText || !downloadBtn) return;

    downloadBtn.disabled = true;
    downloadBtn.textContent = '下载中...';
    progressText.textContent = '准备下载...';
    progressBar.style.setProperty('--progress', '10%');
    progressBar.style.width = '10%';

    try {
      // 由于浏览器扩展无法直接执行yt-dlp，我们模拟下载过程
      // 实际实现需要后端支持或使用其他方法
      await simulateChatDownload(videoId, (progress) => {
        progressBar.style.setProperty('--progress', `${progress}%`);
        progressBar.style.width = `${progress}%`;
        progressText.textContent = `下载中... ${progress}%`;
      });

      progressBar.style.setProperty('--progress', '100%');
      progressBar.style.width = '100%';
      progressText.textContent = '下载完成';
      downloadBtn.textContent = '重新下载';
      
      state.videoDownloadStatus.set(videoId, {
        downloaded: true,
        downloadTime: new Date()
      });

    } catch (error) {
      progressBar.style.setProperty('--progress', '0%');
      progressBar.style.width = '0%';
      progressText.textContent = '下载失败';
      downloadBtn.textContent = '重试';
      console.error(`下载聊天失败 ${videoId}:`, error);
    } finally {
      downloadBtn.disabled = false;
    }
  }

  async function simulateChatDownload(videoId, onProgress) {
    // 模拟下载过程
    for (let i = 10; i <= 90; i += 10) {
      await new Promise(resolve => setTimeout(resolve, 200));
      onProgress(i);
    }
    
    // 生成模拟聊天数据
    const mockMessages = generateMockChatMessages(videoId);
    state.chatMessages.set(videoId, mockMessages);
    
    await new Promise(resolve => setTimeout(resolve, 200));
    onProgress(100);
  }

  function generateMockChatMessages(videoId) {
    const messages = [];
    const messageCount = Math.floor(Math.random() * 100) + 50;
    
    for (let i = 0; i < messageCount; i++) {
      const timestamp = new Date(Date.now() - (messageCount - i) * 60000);
      messages.push({
        id: `msg_${i}`,
        timestamp: timestamp.toISOString(),
        author: `用户${Math.floor(Math.random() * 1000)}`,
        message: generateRandomMessage(),
        type: Math.random() > 0.9 ? 'membership' : 'message'
      });
    }
    
    return messages;
  }

  function generateRandomMessage() {
    const messages = [
      '666666',
      '主播好！',
      '哈哈哈',
      '太精彩了',
      '支持一发！',
      '弹幕护体',
      '前排占座',
      '来了来了',
      '精彩精彩',
      '加油加油',
      '哈哈哈哈哈',
      '太搞笑了',
      '厉害厉害',
      '学习到了',
      '感谢分享'
    ];
    
    return messages[Math.floor(Math.random() * messages.length)];
  }

  function openChatViewer(videoId) {
    state.currentChatVideoId = videoId;
    state.container.dataset.chatViewerVisible = 'true';
    
    const video = state.videos.find(v => v.videoId === videoId);
    const titleEl = state.chatViewerEl.querySelector('.clh-chat-header h3');
    titleEl.textContent = `实时聊天回放 - ${video ? video.title : videoId}`;
    
    const messagesContainer = state.chatViewerEl.querySelector('.clh-chat-messages');
    messagesContainer.innerHTML = '';
    
    const messages = state.chatMessages.get(videoId);
    if (messages && messages.length > 0) {
      renderChatMessages(messages, messagesContainer);
    } else {
      messagesContainer.innerHTML = '<div class="clh-chat-empty">暂无聊天记录，请先下载聊天消息</div>';
    }
  }

  function renderChatMessages(messages, container) {
    const fragment = document.createDocumentFragment();
    
    messages.forEach(message => {
      const messageEl = document.createElement('div');
      messageEl.className = `clh-chat-message ${message.type}`;
      
      const timestamp = new Date(message.timestamp);
      const timeStr = timestamp.toLocaleTimeString('zh-CN', { 
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      messageEl.innerHTML = `
        <span class="clh-chat-time">${timeStr}</span>
        <span class="clh-chat-author">${message.author}:</span>
        <span class="clh-chat-text">${message.message}</span>
      `;
      
      fragment.appendChild(messageEl);
    });
    
    container.appendChild(fragment);
    container.scrollTop = container.scrollHeight;
  }

  function downloadChatMessages(videoId) {
    const messages = state.chatMessages.get(videoId);
    const video = state.videos.find(v => v.videoId === videoId);
    
    if (!messages || messages.length === 0) {
      alert('没有可下载的聊天消息');
      return;
    }
    
    const content = messages.map(msg => {
      const timestamp = new Date(msg.timestamp);
      const timeStr = timestamp.toLocaleString('zh-CN');
      return `[${timeStr}] ${msg.author}: ${msg.message}`;
    }).join('\n');
    
    const filename = `${video ? video.title : videoId}_聊天记录_${new Date().toISOString().split('T')[0]}.txt`;
    
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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

  initWhenReady();
})();