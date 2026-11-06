import { filmTime, getShowcaseFilm } from './showcase-film.mjs';
import { loadDeviceFrame } from './device-frame.mjs';
import './video-demo.css';

const controlsShade = '#00000063';
// Sample a less-dimmed frame to preserve detail within the glass.
const glassSourceShade = '#0000002e';

export async function createVideoDemo({ stage, scope, localMedia, optical, icon, button }) {
  const [film, frame] = await Promise.all([
    getShowcaseFilm(localMedia, scope.signal),
    loadDeviceFrame('iphone', scope.signal),
  ]);
  const poster = new Image();
  poster.src = film.poster;
  await poster.decode();
  if (scope.signal.aborted) return;

  const { screen } = frame;
  const caseWidth = frame.height, caseHeight = frame.width;
  const screenBox = `--screen-left:${screen.y / caseWidth * 100}%;--screen-top:${(caseHeight - screen.x - screen.width) / caseHeight * 100}%;--screen-width:${screen.height / caseWidth * 100}%;--screen-height:${screen.width / caseHeight * 100}%;--screen-radius:${screen.radius / screen.height * 100}% / ${screen.radius / screen.width * 100}%`;
  const skip = (id, direction) => `<button id="${id}" class="player-skip" aria-label="${direction} ten seconds">${icon('rewind')}<span aria-hidden="true">10</span></button>`;
  stage.innerHTML = `<figure class="video-figure">
    <div class="video-device" style="aspect-ratio:${caseWidth}/${caseHeight};${screenBox}">
      <div class="video-player demo-root" aria-label="${film.title} landscape player">
        <video id="demo-video" playsinline preload="metadata" poster="${film.poster}" src="${film.file}" aria-label="${film.title}">
          <track id="video-subtitle-track" kind="subtitles" srclang="en" label="English" src="${film.subtitles}">
        </video>
        <div class="video-controls">
          <div class="glass player-glass player-close" data-glass>${button('video-close', 'Hide playback controls', 'close')}</div>
          <div class="glass player-glass player-output" data-glass>${button('video-pip', 'Picture in picture', 'pip')}${button('video-fullscreen', 'Enter full screen', 'display')}</div>
          <div class="glass player-glass player-volume" data-glass><input id="video-volume" type="range" min="0" max="1" step="0.01" value="0.18" aria-label="Volume">${button('video-mute', 'Mute audio', 'speaker', 'aria-pressed="false"')}</div>
          <div class="player-center">
            <div class="glass player-glass" data-glass>${skip('video-back', 'Back')}</div>
            <div class="glass player-glass player-play" data-glass>${button('video-play', 'Play video', 'player-play')}</div>
            <div class="glass player-glass" data-glass>${skip('video-next', 'Forward')}</div>
          </div>
          <div class="glass player-glass player-options" data-glass>
            <label class="player-rate">${icon('speed')}<select id="video-rate" aria-label="Playback speed"><option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="1.25">1.25×</option><option value="1.5">1.5×</option><option value="2">2×</option></select></label>
            ${button('video-captions', 'English subtitles', 'captions', 'aria-pressed="false"')}
          </div>
          <div class="glass player-glass player-seek" data-glass><span id="video-time">${filmTime(film.start).padStart(5, '0')}</span><input id="video-seek" type="range" min="0" max="${film.duration}" step="0.05" value="${film.start}" aria-label="Video position"><span id="video-remaining">−${filmTime(Math.ceil(film.duration - film.start))}</span></div>
        </div>
        <button class="player-reopen" hidden>Show playback controls</button>
      </div>
      <img class="video-device-frame" src="./devices/${frame.file}" style="width:${caseHeight / caseWidth * 100}%;height:${caseWidth / caseHeight * 100}%" alt="" draggable="false">
    </div>
    <div class="video-subtitle-line" role="group" aria-label="English subtitles" hidden></div>
    <figcaption class="video-credit"><a href="https://studio.blender.org/films/sprite-fright/">Sprite Fright</a> · © Blender Foundation / Blender Studio · <a href="https://studio.blender.org/projects/sprite-fright/pages/about/">CC BY 1.0 and credits</a>${film.reencoded ? ' · Re-encoded for web playback' : ''} · <a href="${film.subtitleCredits}">English subtitles</a> by Pacha Tchernof and Gabldotink · <a href="https://creativecommons.org/licenses/by-sa/4.0/">CC BY-SA 4.0</a></figcaption>
    <p id="video-message" class="video-message" role="status"></p>
  </figure>`;

  const root = stage.querySelector('.video-player');
  root.style.setProperty('--player-shade', controlsShade);
  const get = id => root.querySelector('#' + id);
  const video = get('demo-video');
  const play = get('video-play');
  const seek = get('video-seek');
  const volume = get('video-volume');
  const pip = get('video-pip');
  const fullscreen = get('video-fullscreen');
  const subtitles = get('video-captions');
  const subtitleTrack = get('video-subtitle-track');
  const subtitleLine = stage.querySelector('.video-subtitle-line');
  const controls = root.querySelector('.video-controls');
  const reopen = root.querySelector('.player-reopen');
  const message = stage.querySelector('#video-message');
  const source = document.createElement('canvas');
  const ctx = source.getContext('2d', { alpha: false });
  const nativeFrames = typeof video.requestVideoFrameCallback === 'function';
  let layer, callback = 0, decodedFrame = false, previousPaint = 0;
  video.volume = Number(volume.value);
  volume.style.setProperty('--range-fill', `${video.volume * 100}%`);

  function paint() {
    const width = root.clientWidth, height = root.clientHeight;
    if (!width || !height) return;
    const scale = Math.min(1, 1120 / width);
    const w = Math.max(1, Math.round(width * scale)), h = Math.max(1, Math.round(height * scale));
    if (source.width !== w || source.height !== h) {
      source.width = w;
      source.height = h;
    }
    const image = decodedFrame && video.readyState >= 2 ? video : poster;
    const iw = image.videoWidth || image.naturalWidth, ih = image.videoHeight || image.naturalHeight;
    const fit = Math.min(w / iw, h / ih);
    ctx.fillStyle = '#080808';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(image, (w - iw * fit) / 2, (h - ih * fit) / 2, iw * fit, ih * fit);
    ctx.fillStyle = glassSourceShade;
    ctx.fillRect(0, 0, w, h);
    const duration = Number.isFinite(video.duration) ? video.duration : film.duration;
    seek.max = duration;
    seek.value = video.readyState ? video.currentTime : film.start;
    seek.style.setProperty('--range-fill', `${Number(seek.value) / duration * 100}%`);
    get('video-time').textContent = filmTime(Math.round(Number(seek.value))).padStart(5, '0');
    get('video-remaining').textContent = '−' + filmTime(Math.round(duration - Number(seek.value)));
    layer?.invalidate();
  }

  function stopFrames() {
    if (!callback) return;
    if (nativeFrames) video.cancelVideoFrameCallback(callback);
    else cancelAnimationFrame(callback);
    callback = 0;
  }

  function requestFrame() {
    callback = nativeFrames ? video.requestVideoFrameCallback(frameTick) : requestAnimationFrame(frameTick);
  }

  function frameTick(now) {
    callback = 0;
    if (video.paused || scope.signal.aborted) return;
    decodedFrame = true;
    if (nativeFrames || now - previousPaint >= 32) {
      paint();
      previousPaint = now;
    }
    requestFrame();
  }

  function seekTo(seconds) {
    if (Number.isFinite(video.duration)) video.currentTime = Math.max(0, Math.min(video.duration, seconds));
  }

  async function togglePlayback() {
    if (!video.paused) video.pause();
    else {
      try { await video.play(); }
      catch { message.textContent = 'Playback could not start.'; }
    }
  }

  scope.on(play, 'click', togglePlayback);
  scope.on(video, 'loadedmetadata', () => { seekTo(film.start); paint(); });
  scope.on(video, 'seeked', () => { decodedFrame = true; paint(); });
  scope.on(video, 'play', () => {
    message.textContent = '';
    play.innerHTML = icon('player-pause');
    play.setAttribute('aria-label', 'Pause video');
    stopFrames();
    requestFrame();
  });
  scope.on(video, 'pause', () => {
    stopFrames();
    play.innerHTML = icon('player-play');
    play.setAttribute('aria-label', 'Play video');
    paint();
  });
  scope.on(video, 'error', () => { message.textContent = 'The video could not load.'; });
  scope.on(seek, 'input', () => seekTo(Number(seek.value)));
  scope.on(get('video-back'), 'click', () => seekTo(video.currentTime - 10));
  scope.on(get('video-next'), 'click', () => seekTo(video.currentTime + 10));
  scope.on(volume, 'input', () => { video.volume = Number(volume.value); video.muted = false; });
  scope.on(get('video-mute'), 'click', () => { video.muted = !video.muted; });
  scope.on(video, 'volumechange', () => {
    volume.value = video.volume;
    volume.style.setProperty('--range-fill', `${video.volume * 100}%`);
    const mute = get('video-mute');
    mute.innerHTML = icon(video.muted ? 'speaker-muted' : 'speaker');
    mute.setAttribute('aria-pressed', String(video.muted));
    mute.setAttribute('aria-label', video.muted ? 'Unmute audio' : 'Mute audio');
  });
  scope.on(get('video-rate'), 'change', event => { video.playbackRate = Number(event.target.value); });

  function renderSubtitles() {
    const cues = Array.from(subtitleTrack.track.activeCues ?? []);
    subtitleLine.replaceChildren(...cues.map(cue => {
      const line = document.createElement('div');
      line.append(cue.getCueAsHTML());
      return line;
    }));
  }

  function syncSubtitles() {
    const mode = subtitleTrack.track.mode;
    subtitles.setAttribute('aria-pressed', String(mode !== 'disabled'));
    subtitleLine.hidden = mode !== 'hidden';
    renderSubtitles();
  }

  function setSubtitles(enabled) {
    const nativePresentation = document.fullscreenElement === root || document.pictureInPictureElement === video;
    subtitleTrack.track.mode = enabled ? (nativePresentation ? 'showing' : 'hidden') : 'disabled';
    syncSubtitles();
  }

  const updateSubtitlePresentation = () => setSubtitles(subtitleTrack.track.mode !== 'disabled');
  scope.on(subtitles, 'click', () => setSubtitles(subtitleTrack.track.mode === 'disabled'));
  scope.on(video.textTracks, 'change', syncSubtitles);
  scope.on(subtitleTrack.track, 'cuechange', renderSubtitles);
  scope.on(video, 'enterpictureinpicture', updateSubtitlePresentation);
  scope.on(video, 'leavepictureinpicture', updateSubtitlePresentation);
  scope.on(subtitleTrack, 'error', () => {
    setSubtitles(false);
    subtitles.disabled = true;
    subtitles.setAttribute('aria-label', 'English subtitles unavailable');
    message.textContent = 'English subtitles could not load.';
  });
  syncSubtitles();

  pip.disabled = !document.pictureInPictureEnabled;
  const airPlay = typeof video.webkitShowPlaybackTargetPicker === 'function';
  fullscreen.disabled = !airPlay && !document.fullscreenEnabled;
  if (airPlay) {
    fullscreen.setAttribute('aria-label', 'Choose AirPlay destination');
    fullscreen.title = 'Choose AirPlay destination';
  }
  scope.on(pip, 'click', async () => {
    try {
      if (document.pictureInPictureElement === video) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch { message.textContent = 'Picture in picture is unavailable for this playback.'; }
  });
  scope.on(fullscreen, 'click', async () => {
    try {
      if (airPlay) { video.webkitShowPlaybackTargetPicker(); return; }
      if (document.fullscreenElement === root) await document.exitFullscreen();
      else await root.requestFullscreen();
    } catch { message.textContent = 'Full screen is unavailable for this playback.'; }
  });
  scope.on(document, 'fullscreenchange', () => {
    if (!airPlay) fullscreen.setAttribute('aria-label', document.fullscreenElement === root ? 'Exit full screen' : 'Enter full screen');
    updateSubtitlePresentation();
    paint();
  });
  scope.on(get('video-close'), 'click', async () => {
    if (document.fullscreenElement === root) { await document.exitFullscreen(); return; }
    video.pause();
    controls.hidden = true;
    reopen.hidden = false;
    layer?.pause();
    reopen.focus();
  });
  scope.on(reopen, 'click', () => {
    reopen.hidden = true;
    controls.hidden = false;
    layer?.resume();
    paint();
    play.focus();
  });
  const resize = new ResizeObserver(paint);
  resize.observe(root);
  scope.own(() => {
    resize.disconnect();
    stopFrames();
    if (document.pictureInPictureElement === video) void document.exitPictureInPicture().catch(() => {});
    video.pause();
    video.removeAttribute('src');
    video.load();
    layer?.dispose();
  });
  paint();
  layer = await optical(root, source, scope, {
    tint: [.48, .42, .36, .16], rim: .015, bevel: 17, blurRadius: 3, dispersion: 0, refractionScale: 1.85,
  });
  if (scope.signal.aborted) { layer.dispose(); return; }
  return {
    root,
    sourceImage: () => source.toDataURL('image/png'),
    pause() { video.pause(); layer.pause(); },
    resume() { if (!controls.hidden) layer.resume(); },
    get diagnostics() {
      return { film: film.title, playing: !video.paused, time: video.currentTime, duration: video.duration,
        muted: video.muted, speed: video.playbackRate, readyState: video.readyState, frameCallback: !!callback, layer: layer.diagnostics };
    },
  };
}
