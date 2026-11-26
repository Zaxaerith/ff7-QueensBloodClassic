// Narrow fixed bridge calls; no user-provided paths or code. GPL-3.0-only
const $ = id => document.getElementById(id);

const I18N = {
  zh: {
    langBtn: 'EN',
    detectedArt: n => `⚡ 检测到现成完整卡包（${n} 张）· 一键挂载并启用`,
    detectedAudio: n => `⚡ 检测到本地音乐包（${n} 首）· 一键挂载`,
    cancelConfirm: '取消', acceptConfirm: '确定',
    kicker: 'FINAL FANTASY VII · CLASSIC WINDOWS LAUNCHER',
    subtitle: '本机离线运行 · 不上传游戏文件 · 原游戏目录始终只读',
    playWithArt: '▶ 立即开始游戏（含验证卡图）',
    playWithoutArt: '▶ 立即开始游戏（经典字形）',
    playPlain: '经典无图模式进入',
    autoEnterLabel: '下次启动直接进入游戏（可随时通过窗口菜单 Desktop → Launcher & Resource Setup 返回）',
    artReady: (portraits, cards) => `已就绪 · ${portraits} 张已验证卡图（共 ${cards} 条目录）`,
    artMissing: '未挂载卡图（可直接以经典字形模式游玩）',
    audioReady: (count, tracks) => `已挂载 ${count} 首本地 BGM（${tracks.join(' / ')}）+ 内置 PS1 音效`,
    audioMissing: '未挂载本地 BGM（内置 11 项 PS1 合成音效已就绪）',
    taskTitle: '实时任务进度',
    cancelTask: '安全取消任务',
    logSummary: '诊断日志与详细信息',
    mod1Title: '卡图资源配置（二选一）',
    mod1Hint: '从本地正版 FF7 Original 一键构建 145 卡图，或直接加载已有的 145 / 166 完整卡包',
    buildCardTitle: '从 FF7 Original 目录一键构建',
    buildCardTag: '首次推荐',
    buildCardDesc: '支持 Steam 英文版 FF7 Original。离线解析本地 LGP 档案生成 145 张卡图，输出至独立用户数据目录，原安装文件只读。',
    sourceLabel: '当前游戏目录',
    sourceEmpty: '尚未选择。可点击下方“自动探测 Steam 目录”或手动浏览。',
    detectSteam: '自动探测 Steam 目录',
    chooseSource: '手动选择目录…',
    oneClickBuild: '一键校验并生成 145 张卡图',
    advancedSummary: '高级工具：单独校验、生产计划与指定卡号重试',
    inspectOnly: '仅检查档案',
    planSource: '检查 145 卡计划',
    subsetLabel: '指定卡牌编号（逗号分隔）',
    buildSubset: '生成指定卡牌…',
    packCardTitle: '加载已有 Art Pack 卡包',
    packCardTag: '支持 145 / 166 卡',
    packCardDesc: '若你已拥有生成好的 145 卡或含代币 166 卡完整私人卡包目录，可直接只读校验并秒速挂载，无需重新渲染。',
    packLabel: '当前已验证卡包',
    packEmpty: '未挂载卡包（将以经典字形模式游玩）',
    packSummary: (portraits, cards, path) => `${portraits} 张已验证卡图（${cards} 条） · ${path}`,
    choosePack: '选择已有 Art Pack 目录…',
    recheckPrev: '重新验证上次卡包',
    mod2Title: '本地音乐包（可选 BGM）',
    audioDesc: '游戏内置 11 项纯程序化 1997 PS1 风格合成音效（发牌、落子、强化、摧毁、连击、胜利等），无需外部音频即可完整游玩。如需本地古典 BGM 循环，可挂载包含 audio-pack.local.json 的目录。',
    chooseAudio: '选择本地音乐包目录…',
    clearAudio: '清除音乐包',
    audioPathLabel: '本地 BGM 状态',
    audioEmpty: '未挂载本地 BGM（仅使用内置 PS1 合成音效）',
    audioSummary: (count, tracks, path) => `${count} 首已验证音轨（${tracks.join(', ')}） · ${path}`,
    footerCopy: '非官方同人作品 · 卡图与音乐包仅供本机私人使用 · 不联网不上传',
    confirmOneClick: '本地 FF7 Original 档案校验通过！\n\n将在新的私人数据目录离线生成 145 张卡图（首次约需 15–20 分钟，原游戏目录保持只读）。立即开始？',
    confirmSubset: ids => `将在新的私人目录生成指定卡牌 ${ids}（不会修改历史卡包）。开始？`,
    detectNotFound: '未在 C:–G: 常见 Steam 路径中找到 FF7 Original，请点击“手动选择目录…”指定游戏安装目录。',
    detectFound: path => `已自动定位 Steam FF7 Original 目录：${path}`,
    statusIdle: '等待操作',
    statusRunning: '正在执行',
    statusCancelling: '正在安全取消',
    statusComplete: '已完成',
    statusCancelled: '已取消',
    statusFailed: '执行失败',
    completedCount: (done, req) => `已完成 ${done}/${req}`,
    planRow: '生产计划',
    cardFailed: id => `#${id} 生成失败`,
  },
  en: {
    langBtn: '中文',
    detectedArt: n => `⚡ Complete Art Pack found (${n} portraits) · Mount now`,
    detectedAudio: n => `⚡ Local Audio Pack found (${n} tracks) · Mount now`,
    cancelConfirm: 'Cancel', acceptConfirm: 'Confirm',
    kicker: 'FINAL FANTASY VII · CLASSIC WINDOWS LAUNCHER',
    subtitle: 'Offline local host · No uploads · Original game files stay read-only',
    playWithArt: '▶ Launch Game (Verified Art Pack)',
    playWithoutArt: '▶ Launch Game (Classic Glyph Mode)',
    playPlain: 'Play Without Art Pack',
    autoEnterLabel: 'Auto-enter game on next launch (return anytime via Desktop → Launcher & Resource Setup)',
    artReady: (portraits, cards) => `Ready · ${portraits} verified card portraits (${cards} entries)`,
    artMissing: 'No Art Pack mounted (ready to play in Classic Glyph mode)',
    audioReady: (count, tracks) => `${count} local BGM track(s) mounted (${tracks.join(' / ')}) + built-in PS1 SFX`,
    audioMissing: 'No local BGM mounted (11 built-in PS1 synth SFX active)',
    taskTitle: 'Live Task Progress',
    cancelTask: 'Cancel Safely',
    logSummary: 'Diagnostic Log & Details',
    mod1Title: 'Card Artwork Setup (Choose One)',
    mod1Hint: 'Build 145 portraits locally from FF7 Original, or mount an existing 145 / 166 Art Pack',
    buildCardTitle: 'Build from FF7 Original Directory',
    buildCardTag: 'First-Time',
    buildCardDesc: 'Supports Steam English FF7 Original. Reads local LGP archives offline to render 145 portraits into a fresh user data folder without modifying game files.',
    sourceLabel: 'FF7 Original Directory',
    sourceEmpty: 'Not selected yet. Click "Auto-Detect Steam" or browse manually.',
    detectSteam: 'Auto-Detect Steam',
    chooseSource: 'Browse Folder…',
    oneClickBuild: 'Verify & Build All 145 Portraits',
    advancedSummary: 'Advanced: Archive Check, 145-Card Plan & Targeted Retry',
    inspectOnly: 'Inspect Archives',
    planSource: 'Check 145-Card Plan',
    subsetLabel: 'Card IDs (comma-separated)',
    buildSubset: 'Build Selected Cards…',
    packCardTitle: 'Load Existing Art Pack',
    packCardTag: '145 / 166 Cards',
    packCardDesc: 'Already have a verified 145-card or full 166-card (with tokens) personal Art Pack? Verify and mount it read-only in seconds.',
    packLabel: 'Mounted Art Pack',
    packEmpty: 'None mounted (Classic Glyph mode)',
    packSummary: (portraits, cards, path) => `${portraits} verified portraits (${cards} entries) · ${path}`,
    choosePack: 'Select Art Pack Folder…',
    recheckPrev: 'Re-Verify Previous Pack',
    mod2Title: 'Local BGM Audio Pack (Optional)',
    audioDesc: '11 built-in 1997 PS1 procedural synth SFX (draw, play, buff, destroy, combo, victory) work out of the box. Optionally mount a folder containing audio-pack.local.json for local BGM loops.',
    chooseAudio: 'Select Audio Pack Folder…',
    clearAudio: 'Clear Audio Pack',
    audioPathLabel: 'Local BGM Status',
    audioEmpty: 'Not mounted (built-in PS1 synth SFX active)',
    audioSummary: (count, tracks, path) => `${count} verified track(s) (${tracks.join(', ')}) · ${path}`,
    footerCopy: 'Unofficial fan project · Personal local packs only · Fully offline',
    confirmOneClick: 'FF7 Original archives verified!\n\nGenerate all 145 portraits into a new private directory (takes ~15–20 min; original game files stay read-only). Start now?',
    confirmSubset: ids => `Generate selected cards (${ids}) into a new private directory without touching previous packs?`,
    detectNotFound: 'No Steam FF7 Original installation was found on C:–G:. Click "Browse Folder…" to choose it manually.',
    detectFound: path => `Detected Steam FF7 Original: ${path}`,
    statusIdle: 'Idle',
    statusRunning: 'Running',
    statusCancelling: 'Cancelling',
    statusComplete: 'Complete',
    statusCancelled: 'Cancelled',
    statusFailed: 'Failed',
    completedCount: (done, req) => `${done}/${req} completed`,
    planRow: 'Production Plan',
    cardFailed: id => `#${id} failed`,
  },
};

let api = null;
let pending = false;
let lastDetail = '';
let lastStatus = null;
let localNotice = '';
let pendingOneClickJobId = null;
let lang = localStorage.getItem('qb.launcher.lang') === 'en' ? 'en' : 'zh';

function t(key) {
  return I18N[lang][key];
}

function applyStaticI18n() {
  document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  $('lang-toggle').textContent = t('langBtn');
  for (const el of document.querySelectorAll('[data-i18n]')) {
    const key = el.getAttribute('data-i18n');
    if (key && typeof I18N[lang][key] === 'string') {
      el.textContent = I18N[lang][key];
    }
  }
}

function setNotice(text) {
  localNotice = text || '';
  renderNotice(lastStatus?.notice || '');
}

function renderNotice(serverNotice) {
  const combined = localNotice || serverNotice || '';
  const el = $('notice');
  el.textContent = combined;
  el.hidden = !combined;
}

function row(left, right, bad = false) {
  const div = document.createElement('div');
  div.className = 'row' + (bad ? ' bad' : '');
  const a = document.createElement('span');
  const b = document.createElement('span');
  a.textContent = left;
  b.textContent = right;
  div.append(a, b);
  return div;
}

async function call(name, ...args) {
  if (pending || !api) return null;
  pending = true;
  try {
    const res = await api[name](...args);
    localNotice = '';
    return res;
  } catch (error) {
    setNotice(String(error?.message ?? error));
    return null;
  } finally {
    pending = false;
    await refresh();
  }
}

function confirmInPage(message) {
  return new Promise(resolve => {
    const dialog = $('confirm-dialog');
    $('confirm-message').textContent = message;
    const finish = result => { dialog.close(); resolve(result); };
    $('confirm-accept').onclick = () => finish(true);
    $('confirm-cancel').onclick = () => finish(false);
    dialog.oncancel = event => { event.preventDefault(); finish(false); };
    dialog.showModal();
  });
}

function statusLabel(status) {
  const map = {
    idle: t('statusIdle'),
    running: t('statusRunning'),
    cancelling: t('statusCancelling'),
    complete: t('statusComplete'),
    cancelled: t('statusCancelled'),
    failed: t('statusFailed'),
  };
  return map[status] || status;
}

function renderState(s) {
  lastStatus = s;
  const j = s.job;
  const busy = ['running', 'cancelling'].includes(j.status);

  // Version footer & header badge
  const version = s.appVersion || '1.0.0-rc.1';
  $('version-badge').textContent = `v${version}`;
  $('footer-version').textContent = `Game v${version}`;

  // Hero status chips
  const artChip = $('chip-art');
  artChip.classList.toggle('ready', Boolean(s.pack));
  $('chip-art-text').textContent = s.pack
    ? t('artReady')(s.pack.portraits, s.pack.cards)
    : t('artMissing');

  const audioChip = $('chip-audio');
  audioChip.classList.toggle('ready', Boolean(s.audioPack));
  $('chip-audio-text').textContent = s.audioPack
    ? t('audioReady')(s.audioPack.count, s.audioPack.tracks)
    : t('audioMissing');

  // Primary Launch CTA + optional plain mode button
  $('play-primary-label').textContent = s.pack ? t('playWithArt') : t('playWithoutArt');
  $('play-plain').hidden = !s.pack;
  $('auto-enter').checked = Boolean(s.autoEnterGame);
  $('auto-enter').disabled = busy || pending;

  // Source & pack paths
  $('source').textContent = s.source || t('sourceEmpty');
  $('pack').textContent = s.pack
    ? t('packSummary')(s.pack.portraits, s.pack.cards, s.pack.path)
    : t('packEmpty');
  $('previous').hidden = !s.previousPack || Boolean(s.pack);

  const art = s.detectedPacks.find(p => p.kind === 'art');
  const audio = s.detectedPacks.find(p => p.kind === 'audio');
  $('detected-art').hidden = !art || (s.pack && s.pack.portraits >= 145);
  $('detected-audio').hidden = !audio || Boolean(s.audioPack);
  if (art) { $('detected-art').textContent = t('detectedArt')(art.portraits); $('detected-art').onclick = () => call('mount_detected_pack', art.index); }
  if (audio) { $('detected-audio').textContent = t('detectedAudio')(audio.count); $('detected-audio').onclick = () => call('mount_detected_pack', audio.index); }

  // Audio pack
  $('audio-pack').textContent = s.audioPack
    ? t('audioSummary')(s.audioPack.count, s.audioPack.tracks, s.audioPack.path)
    : t('audioEmpty');
  $('audio-clear').hidden = !s.audioPack;

  // Button disabled states
  for (const b of document.querySelectorAll('[data-job]')) {
    b.disabled = busy || pending;
  }
  const hasSource = Boolean(s.source);
  $('inspect').disabled ||= !hasSource;
  $('plan').disabled ||= !hasSource;
  $('build').disabled ||= !hasSource;
  $('build-subset').disabled ||= !hasSource;

  // Task progress panel visibility & Mako bar
  const showTask = j.status !== 'idle' || Boolean(j.id);
  const taskPanel = $('task-panel');
  taskPanel.hidden = !showTask;
  const isError = j.status === 'failed' || (j.failures && j.failures.length > 0);
  taskPanel.classList.toggle('is-error', isError);

  const badge = $('task-badge');
  badge.textContent = j.status.toUpperCase();
  badge.className = 'task-badge ' + (busy ? 'running' : j.status);

  $('cancel').hidden = !busy;
  $('cancel').disabled = j.status === 'cancelling';

  const parts = [statusLabel(j.status)];
  if (j.message) parts.push(j.message);
  if (j.requested) parts.push(t('completedCount')(j.completed, j.requested));
  if (j.seconds) parts.push(`${j.seconds}s`);
  $('status').textContent = parts.join(' · ');

  const maxVal = j.requested || 145;
  const curVal = j.completed || 0;
  $('progress').max = maxVal;
  $('progress').value = curVal;

  const barWrap = $('mako-bar-wrap');
  const barFill = $('mako-bar-fill');
  const barText = $('mako-bar-text');
  barWrap.setAttribute('aria-valuemax', String(maxVal));
  barWrap.setAttribute('aria-valuenow', String(curVal));
  barWrap.classList.toggle('error', isError);

  if (busy && !j.requested) {
    barWrap.classList.add('indeterminate');
    barFill.style.width = '';
    barText.textContent = statusLabel(j.status);
  } else {
    barWrap.classList.remove('indeterminate');
    const pct = j.status === 'complete' && !j.requested
      ? 100
      : Math.min(100, Math.round((curVal / Math.max(1, maxVal)) * 100));
    barFill.style.width = `${pct}%`;
    barText.textContent = j.requested ? `${pct}% (${curVal}/${maxVal})` : `${pct}%`;
  }

  $('current').textContent = j.current
    ? `#${String(j.current.cardId).padStart(3, '0')} ${j.current.name}`
    : '';

  // Details & log
  const key = JSON.stringify([j.id, j.status, j.result, lang]);
  if (key !== lastDetail) {
    lastDetail = key;
    $('details').replaceChildren();
    const inspection = j.result?.inspection ?? (j.result?.archives ? j.result : null);
    if (inspection) {
      for (const a of inspection.archives) {
        const bad = !['validated', 'not-required'].includes(a.status);
        $('details').append(row(a.role, `${a.status}${a.reason ? ' · ' + a.reason : ''}`, bad));
      }
    }
    if (j.kind === 'plan' && j.result?.cards) {
      const readyCount = j.result.cards.filter(c => c.status === 'ready').length;
      $('details').append(row(t('planRow'), `${readyCount}/${j.result.cards.length} ready`));
      for (const c of j.result.cards.filter(c => c.status !== 'ready')) {
        $('details').append(row(`#${c.cardId} ${c.name}`, JSON.stringify(c.problems), true));
      }
    }
    for (const failure of j.failures ?? []) {
      const id = String(failure.cardId).padStart(3, '0');
      $('details').append(row(t('cardFailed')(id), failure.message ?? failure.code, true));
    }
    if (isError) {
      $('log-drawer').open = true;
    }
  }

  $('log').textContent = JSON.stringify({
    kind: j.kind,
    status: j.status,
    failures: j.failures,
    events: j.events,
    stderr: j.stderr,
  }, null, 2);

  renderNotice(s.notice);

  // Chained one-click flow: once inspect succeeds, confirm and launch full 145 build.
  if (pendingOneClickJobId && j.id === pendingOneClickJobId && !busy) {
    pendingOneClickJobId = null;
    if (j.status === 'complete') {
      setTimeout(async () => {
        if (await confirmInPage(t('confirmOneClick'))) {
          call('start_generation', 'all');
        }
      }, 60);
    } else {
      $('log-drawer').open = true;
    }
  }
}

async function refresh() {
  if (!api) return;
  try {
    const s = await api.status();
    renderState(s);
  } catch (error) {
    setNotice(String(error?.message ?? error));
  }
}

window.addEventListener('DOMContentLoaded', () => {
  applyStaticI18n();
  $('lang-toggle').addEventListener('click', () => {
    lang = lang === 'zh' ? 'en' : 'zh';
    localStorage.setItem('qb.launcher.lang', lang);
    applyStaticI18n();
    if (lastStatus) renderState(lastStatus);
  });
});

window.addEventListener('pywebviewready', () => {
  api = window.pywebview.api;

  $('play-primary').addEventListener('click', () => {
    const useArt = Boolean(lastStatus?.pack);
    call('enter_game', useArt);
  });
  $('play-plain').addEventListener('click', () => call('enter_game', false));

  $('auto-enter').addEventListener('change', event => {
    call('set_auto_enter', Boolean(event.target.checked));
  });

  $('source-detect').addEventListener('click', async () => {
    const res = await call('auto_detect_source');
    if (res && !res.ok) {
      setNotice(t('detectNotFound'));
    } else if (res && res.ok && res.path) {
      setNotice('');
    }
  });

  for (const [id, method] of [
    ['source-select', 'choose_source'],
    ['inspect', 'inspect_source'],
    ['plan', 'plan_source'],
    ['pack-select', 'choose_pack'],
    ['previous', 'check_previous_pack'],
    ['audio-select', 'choose_audio_pack'],
    ['audio-clear', 'clear_audio_pack'],
    ['cancel', 'cancel_generation'],
  ]) {
    $(id).addEventListener('click', () => call(method));
  }

  $('build').addEventListener('click', async () => {
    const res = await call('inspect_source');
    if (res && res.ok && res.jobId) {
      pendingOneClickJobId = res.jobId;
    }
  });

  $('build-subset').addEventListener('click', async () => {
    const ids = $('cards').value.trim();
    if (await confirmInPage(t('confirmSubset')(ids))) {
      call('start_generation', ids);
    }
  });

  refresh();
  setInterval(refresh, 750);
});
