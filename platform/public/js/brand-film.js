/* 品牌片：自动播放、声音开关、悬停控制、加载/失败降级、减弱动态 */
(function () {
  'use strict';

  var video = document.getElementById('film');
  var frame = document.getElementById('film-frame');
  var playBtn = document.getElementById('film-play');
  var soundBtn = document.getElementById('film-sound');
  var loader = document.getElementById('film-loader');
  var errorBox = document.getElementById('film-error');
  var retryBtn = document.getElementById('film-retry');
  var errorPlay = document.getElementById('film-error-play');
  var hint = document.getElementById('film-hint');

  if (!video || !frame) return;

  var PLAY_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>';
  var PAUSE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" fill="currentColor"/></svg>';
  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var ready = false;
  var failed = false;
  var retryTimer = null;

  function setPausedUI(paused) {
    playBtn.innerHTML = paused ? PLAY_ICON : PAUSE_ICON;
    playBtn.setAttribute('aria-label', paused ? '播放品牌片' : '暂停品牌片');
    frame.classList.toggle('is-paused', paused);
  }

  function hideLoader() {
    ready = true;
    loader.hidden = true;
    clearTimeout(retryTimer);
  }

  function showLoader(text) {
    if (failed) return;
    loader.hidden = false;
    var label = loader.querySelector('.film-loader__text');
    if (label && text) label.textContent = text;
  }

  function fail() {
    if (failed) return;
    failed = true;
    loader.hidden = true;
    errorBox.hidden = false;
    frame.classList.add('is-paused');
  }

  function togglePlay() {
    if (failed) return;
    if (video.paused) {
      var p = video.play();
      if (p && p.catch) p.catch(function () { setPausedUI(true); });
    } else {
      video.pause();
    }
  }

  // 按屏幕与格式选择码率：手机优先 720p / WebM
  function pickSource() {
    var mobile = window.matchMedia && window.matchMedia('(max-width: 767px)').matches;
    var webm = video.canPlayType('video/webm; codecs="vp9"');
    var src;
    if (mobile) src = webm ? '/assets/video/film-720.webm' : '/assets/video/film-720.mp4';
    else src = '/assets/video/film-1080.mp4';
    video.src = src;
    video.load();
  }

  function updateSoundUI() {
    var on = !video.muted;
    soundBtn.setAttribute('aria-pressed', String(on));
    soundBtn.setAttribute('aria-label', on ? '关闭声音' : '开启声音');
    hint.textContent = on ? '声音已开启 · 再次点击可静音' : '默认静音 · 点击右下角开启声音';
  }

  playBtn.addEventListener('click', function (e) { e.stopPropagation(); togglePlay(); });
  soundBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    video.muted = !video.muted;
    if (!video.muted) {
      video.volume = 1;
      // 真实点击是用户手势，解除静音后确保继续播放（自动播放策略可能把未激活的播放暂停）
      var p = video.play();
      if (p && p.catch) p.catch(function () { setPausedUI(true); });
    }
    updateSoundUI();
  });
  frame.addEventListener('click', function (e) {
    if (e.target.closest('button')) return;
    togglePlay();
  });
  video.addEventListener('play', function () { setPausedUI(false); });
  video.addEventListener('pause', function () { setPausedUI(true); });
  video.addEventListener('playing', function () { hideLoader(); });
  video.addEventListener('canplay', function () { hideLoader(); });
  video.addEventListener('loadeddata', function () { hideLoader(); });
  video.addEventListener('waiting', function () {
    if (!video.paused && !failed) showLoader('正在缓冲');
  });
  video.addEventListener('error', fail);
  video.addEventListener('stalled', function () {
    if (!ready && !failed) showLoader('网络较慢，正在重试');
  });

  function retry() {
    failed = false;
    errorBox.hidden = true;
    showLoader('正在加载品牌片');
    setPausedUI(true);
    pickSource();
    start();
  }
  retryBtn.addEventListener('click', retry);
  errorPlay.addEventListener('click', retry);

  function start() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(function () {
      if (!ready && !failed && video.readyState < 2) fail();
    }, 20000);

    if (reduceMotion && reduceMotion.matches) {
      video.pause();
      setPausedUI(true);
      hint.textContent = '已按系统“减少动态”设置暂停 · 点击播放';
      return;
    }
    setPausedUI(false);
    var p = video.play();
    if (p && p.catch) p.catch(function () {
      setPausedUI(true);
      hint.textContent = '浏览器阻止了自动播放 · 点击播放';
    });
  }

  updateSoundUI();
  pickSource();
  start();

  if (reduceMotion) {
    var onChange = function (e) {
      if (e.matches) {
        video.pause();
        setPausedUI(true);
        hint.textContent = '已按系统“减少动态”设置暂停 · 点击播放';
      }
    };
    if (reduceMotion.addEventListener) reduceMotion.addEventListener('change', onChange);
    else if (reduceMotion.addListener) reduceMotion.addListener(onChange);
  }
})();
