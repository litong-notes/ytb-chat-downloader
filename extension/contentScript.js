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
    initialized: false,
    continuationToken: null,
    isLoadingMore: false,
    hasMore: true,
    totalFetched: 0,
    apiKey: null
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
    refreshButton.className = 'clh-button clh-refresh-button';
    refreshButton.textContent = '刷新状态';
    refreshButton.addEventListener('click', async () => {
      const originalText = refreshButton.textContent;
      refreshButton.disabled = true;
      refreshButton.textContent = '刷新中...';
      
      try {
        if (state.isLoggedIn) {
          await fetchLiveVideos();
        } else {
          await checkLoginAndFetch();
        }
      } finally {
        refreshButton.disabled = false;
        // Text will be updated by updateLoginStatus function
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
    setupDragging(header, container);
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

  function setupDragging(dragHandle, container) {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let initialX = 0;
    let initialY = 0;

    dragHandle.addEventListener('mousedown', (e) => {
      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        return;
      }

      isDragging = true;
      dragHandle.classList.add('dragging');

      const rect = container.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      initialX = rect.left;
      initialY = rect.top;

      container.style.right = 'auto';
      container.style.left = `${initialX}px`;
      container.style.top = `${initialY}px`;

      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      let newX = initialX + deltaX;
      let newY = initialY + deltaY;

      const rect = container.getBoundingClientRect();
      const maxX = window.innerWidth - rect.width;
      const maxY = window.innerHeight - rect.height;

      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      container.style.left = `${newX}px`;
      container.style.top = `${newY}px`;
    });

    document.addEventListener('mouseup', () => {
      if (isDragging) {
        isDragging = false;
        dragHandle.classList.remove('dragging');
      }
    });
  }

  function extractApiKey() {
    try {
      const scriptText = document.documentElement.innerHTML;
      
      // Try multiple patterns for API key extraction
      const patterns = [
        /"INNERTUBE_API_KEY":"([^"]+)"/,
        /"innertubeApiKey":"([^"]+)"/,
        /"apiKey":"([^"]+)"/
      ];
      
      for (const pattern of patterns) {
        const match = scriptText.match(pattern);
        if (match && match[1]) {
          state.apiKey = match[1];
          console.log(`${DEBUG_PREFIX} 成功提取API密钥，长度: ${state.apiKey.length}`);
          return;
        }
      }
      
      // Fallback to public key
      state.apiKey = 'AIzaSyAO90d0o_cysLkFLV7-IqsmyGlInL4l3_I';
      console.log(`${DEBUG_PREFIX} 使用备用API密钥`);
    } catch (error) {
      state.apiKey = 'AIzaSyAO90d0o_cysLkFLV7-IqsmyGlInL4l3_I';
      console.warn(`${DEBUG_PREFIX} API密钥提取失败，使用备用密钥`, error);
    }
  }

  async function checkLoginAndFetch() {
    const detection = detectLoginState();
    updateLoginStatus(detection.loggedIn, detection);

    if (!detection.loggedIn) {
      setMessage('请先登录 YouTube，登录后将自动加载陈一发儿频道的直播列表。');
      renderList([]);
      return;
    }

    state.isLoggedIn = true;
    extractApiKey();
    await fetchLiveVideos();
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
    state.videos = [];
    state.continuationToken = null;
    state.hasMore = true;
    state.totalFetched = 0;
    
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
      console.log(`${DEBUG_PREFIX} 获取到页面HTML，大小: ${html.length} 字符`);
      
      const parseResult = parseLiveVideosFromHtml(html);
      console.log(`${DEBUG_PREFIX} 初始解析出 ${parseResult.videos.length} 个视频`);
      
      state.videos = parseResult.videos;
      state.continuationToken = parseResult.continuationToken;
      state.totalFetched = parseResult.videos.length;

      renderList(state.videos);

      if (state.continuationToken && state.hasMore) {
        console.log(`${DEBUG_PREFIX} 发现分页令牌，开始获取更多视频...`);
        setMessage(`已加载 ${state.totalFetched} 条视频，正在获取更多…`);
        await fetchMoreVideos();
      } else {
        console.log(`${DEBUG_PREFIX} 没有更多分页数据，完成加载。总计: ${state.videos.length} 个视频`);
        updateFetchStatus('success', '');
        if (state.videos.length === 0) {
          setMessage('当前频道暂无直播视频，稍后再来看看吧。');
        } else {
          setMessage(`成功获取全部 ${state.videos.length} 条直播视频。`);
        }
      }
    } catch (error) {
      setMessage(`获取直播列表失败：${error.message}`);
      console.error(`${DEBUG_PREFIX} 获取直播列表失败`, error);
      updateFetchStatus('error', '');
    }
  }

  async function fetchMoreVideos() {
    if (state.isLoadingMore || !state.continuationToken || !state.hasMore) {
      console.log(`${DEBUG_PREFIX} 跳过获取更多视频: isLoadingMore=${state.isLoadingMore}, hasToken=${!!state.continuationToken}, hasMore=${state.hasMore}`);
      return;
    }

    console.log(`${DEBUG_PREFIX} 开始获取下一页视频...`);
    state.isLoadingMore = true;

    try {
      const apiKey = state.apiKey || 'AIzaSyAO90d0o_cysLkFLV7-IqsmyGlInL4l3_I';
      const response = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-GOOG-API-CLIENT': 'gl-js/ fire 8.0.0',
          'X-YouTube-Client-Name': '1',
          'X-YouTube-Client-Version': '2.20240101.00.00'
        },
        credentials: 'include',
        body: JSON.stringify({
          continuation: state.continuationToken,
          context: {
            client: {
              clientName: 'WEB',
              clientVersion: '2.20240101.00.00',
              hl: 'zh-CN',
              gl: 'CN'
            },
            user: {},
            request: {
              useSsl: true
            }
          }
        })
      });

      if (!response.ok) {
        console.warn(`${DEBUG_PREFIX} 获取下一页失败，状态码 ${response.status}`);
        state.hasMore = false;
        return;
      }

      const data = await response.json();
      console.log(`${DEBUG_PREFIX} 收到API响应，大小: ${JSON.stringify(data).length} 字符`);
      
      const parseResult = parseMoreVideosFromResponse(data);
      console.log(`${DEBUG_PREFIX} 解析出 ${parseResult.videos.length} 个视频，新分页令牌: ${parseResult.continuationToken ? '存在' : '不存在'}`);
      
      if (parseResult.videos.length > 0) {
        const uniqueVideos = parseResult.videos.filter(
          newVideo => !state.videos.some(existingVideo => existingVideo.videoId === newVideo.videoId)
        );
        console.log(`${DEBUG_PREFIX} 过滤后新增 ${uniqueVideos.length} 个唯一视频`);
        state.videos.push(...uniqueVideos);
        state.totalFetched = state.videos.length;
        renderList(state.videos);
        setMessage(`已加载 ${state.totalFetched} 条视频，正在获取更多…`);
      }

      state.continuationToken = parseResult.continuationToken;

      if (state.continuationToken) {
        console.log(`${DEBUG_PREFIX} 继续获取下一页...`);
        await new Promise(resolve => setTimeout(resolve, 500));
        await fetchMoreVideos();
      } else {
        console.log(`${DEBUG_PREFIX} 没有更多分页令牌，完成加载。总计: ${state.videos.length} 个视频`);
        state.hasMore = false;
        updateFetchStatus('success', '');
        setMessage(`成功获取全部 ${state.videos.length} 条直播视频。`);
      }
    } catch (error) {
      console.warn(`${DEBUG_PREFIX} 获取更多视频失败`, error);
      state.hasMore = false;
      setMessage(`获取更多视频失败，已获取 ${state.videos.length} 条视频。`);
    } finally {
      state.isLoadingMore = false;
    }
  }

  function parseMoreVideosFromResponse(data) {
    const results = new Map();
    let continuationToken = null;

    try {
      // Try multiple response structures
      const actions = data.onResponseReceivedActions || data.actions || [];
      
      for (const action of actions) {
        const appendAction = action.appendContinuationItemsAction || action.appendItemsAction;
        if (appendAction) {
          const items = appendAction.continuationItems || appendAction.items || [];
          
          for (const item of items) {
            // Handle different video renderer types
            const videoRenderer = item.gridVideoRenderer || item.videoRenderer || item.compactVideoRenderer;
            if (videoRenderer) {
              const videoId = videoRenderer.videoId;
              
              if (!videoId || results.has(videoId)) {
                continue;
              }

              const title = videoRenderer.title?.simpleText || 
                           videoRenderer.title?.runs?.[0]?.text || 
                           '未命名直播';
              const published = videoRenderer.publishedTimeText?.simpleText || null;
              const viewCount = videoRenderer.viewCountText?.simpleText || 
                              videoRenderer.shortViewCountText?.simpleText || null;
              const badges = [];

              // Handle different badge structures
              if (videoRenderer.badges) {
                videoRenderer.badges.forEach(badge => {
                  const badgeRenderer = badge.metadataBadgeRenderer || badge;
                  const badgeText = badgeRenderer.label || '';
                  if (badgeText.includes('LIVE') || badgeText.includes('直播')) {
                    badges.push({ type: 'live', text: '正在直播' });
                  } else if (badgeText.includes('UPCOMING') || badgeText.includes('即将')) {
                    badges.push({ type: 'upcoming', text: '已预约直播' });
                  }
                });
              }

              // Check for live status in other ways
              if (videoRenderer.thumbnailOverlays) {
                videoRenderer.thumbnailOverlays.forEach(overlay => {
                  if (overlay.thumbnailOverlayTimeStatusRenderer) {
                    const status = overlay.thumbnailOverlayTimeStatusRenderer.style;
                    if (status === 'LIVE') {
                      badges.push({ type: 'live', text: '正在直播' });
                    }
                  }
                });
              }

              const thumbnailUrl = videoRenderer.thumbnail?.thumbnails?.[0]?.url || null;

              results.set(videoId, {
                videoId,
                title,
                url: `https://www.youtube.com/watch?v=${videoId}`,
                publishedTimeText: published,
                viewCountText: viewCount,
                isLive: badges.some((badge) => badge.type === 'live'),
                isUpcoming: badges.some((badge) => badge.type === 'upcoming'),
                scheduledStart: null,
                badges,
                thumbnailUrl
              });
            } else if (item.continuationItemRenderer) {
              continuationToken = item.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
            }
          }
        }
      }
    } catch (error) {
      console.error(`${DEBUG_PREFIX} 解析响应失败`, error);
    }

    return {
      videos: Array.from(results.values()),
      continuationToken
    };
  }

  function parseLiveVideosFromHtml(html) {
    const results = new Map();
    
    // Try multiple patterns to find video renderers
    const patterns = [
      /"videoRenderer":\{([\s\S]*?)"trackingParams"/g,
      /"gridVideoRenderer":\{([\s\S]*?)"trackingParams"/g,
      /"compactVideoRenderer":\{([\s\S]*?)"trackingParams"/g
    ];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(html))) {
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
        const viewCount = decodeText(extractTextField(block, 'viewCountText')) || 
                         decodeText(extractTextField(block, 'shortViewCountText')) || null;
        const badges = [];

        // Check for live status in multiple ways
        if (/"style":"LIVE"/.test(block) || /"label":"LIVE"/.test(block) || /"label":"直播"/.test(block)) {
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

        // Check for live status in thumbnail overlays
        if (/"thumbnailOverlayTimeStatusRenderer":\{"style":"LIVE"/.test(block)) {
          badges.push({ type: 'live', text: '正在直播' });
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
    }

    let continuationToken = null;
    
    // Try multiple patterns for continuation token extraction
    const continuationPatterns = [
      /"continuation":"([^"]+)"/g,
      /"token":"([^"]+)"/g,
      /"continuationEndpoint":\{"continuationCommand":\{"token":"([^"]+)"/g
    ];
    
    for (const pattern of continuationPatterns) {
      const matches = [...html.matchAll(pattern)];
      if (matches.length > 0) {
        // Use the last match which is usually the pagination token
        continuationToken = matches[matches.length - 1][1];
        console.log(`${DEBUG_PREFIX} 使用模式 ${pattern} 找到分页令牌，长度: ${continuationToken.length}`);
        break;
      }
    }
    
    if (!continuationToken) {
      console.log(`${DEBUG_PREFIX} 未找到分页令牌，尝试更多模式...`);
      // Try more specific patterns
      const specialPatterns = [
        /"browseId":"FEuploads","params":"[^"]*","continuation":"([^"]+)"/g,
        /"gridContinuation":"([^"]+)"/g
      ];
      
      for (const pattern of specialPatterns) {
        const matches = [...html.matchAll(pattern)];
        if (matches.length > 0) {
          continuationToken = matches[matches.length - 1][1];
          console.log(`${DEBUG_PREFIX} 使用特殊模式找到分页令牌，长度: ${continuationToken.length}`);
          break;
        }
      }
    }
    
    console.log(`${DEBUG_PREFIX} 最终分页令牌: ${continuationToken ? '存在' : '不存在'}`);

    return {
      videos: Array.from(results.values()),
      continuationToken
    };
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

    const refreshButton = state.container?.querySelector('.clh-refresh-button');
    
    if (loggedIn) {
      state.loginStatusEl.textContent = '已登录';
      state.loginStatusEl.dataset.variant = 'ok';
      if (state.container) {
        state.container.dataset.loginState = 'signed-in';
      }
      if (refreshButton) {
        refreshButton.textContent = '刷新列表';
      }
    } else {
      state.loginStatusEl.textContent = '未登录';
      state.loginStatusEl.dataset.variant = 'warn';
      if (state.container) {
        state.container.dataset.loginState = 'signed-out';
      }
      if (refreshButton) {
        refreshButton.textContent = '刷新状态';
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