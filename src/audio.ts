import type { Rarity } from './types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let enabled = true;
const VOLUME_KEY = 'ludodrop.audio.volume';
function savedVolume() {
  try {
    const raw = localStorage.getItem(VOLUME_KEY);
    const parsed = Number(raw);
    if (raw !== null && Number.isFinite(parsed)) return Math.max(0, Math.min(1, parsed));
  } catch { /* Use the default in a storage-restricted browser. */ }
  return .65;
}
let volume = savedVolume();
export const getAudioVolume = () => volume;
function applyLevel() {
  if (ctx && master) master.gain.setTargetAtTime(enabled ? volume : 0, ctx.currentTime, .012);
}
export function setAudioVolume(value: number) {
  if (!Number.isFinite(value)) return;
  volume = Math.max(0, Math.min(1, value));
  applyLevel();
  try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch { /* Volume still works for this session. */ }
}
const FILES = { tick: 'tick.wav', latch: 'unlock.wav', blue: 'reveal.wav', purple: 'reveal-purple.wav', pink: 'reveal-pink.wav', rare: 'rare.wav' };
type CaseSound = keyof typeof FILES;
const buffers = new Map<CaseSound, AudioBuffer>();
const pending = new Map<CaseSound, Promise<AudioBuffer>>();
let noiseBuffer: AudioBuffer | null = null;
let lastClick = -Infinity;
function context() {
  if (!ctx) {
    ctx = new AudioContext({ latencyHint: 'interactive' }); master = ctx.createGain(); master.gain.value = enabled ? volume : 0;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -3; limiter.knee.value = 3; limiter.ratio.value = 12;
    limiter.attack.value = .003; limiter.release.value = .12;
    master.connect(limiter); limiter.connect(ctx.destination);
  }
  return ctx;
}
export function setAudioEnabled(value: boolean) {
  if (enabled === value) return;
  enabled = value;
  applyLevel();
}
export function resumeCaseAudio() {
  try { void context().resume().catch(() => {}); } catch { /* Playback is optional. */ }
}
async function loadCaseSound(name: CaseSound): Promise<AudioBuffer> {
  const cached = buffers.get(name);
  if (cached) return cached;
  const loading = pending.get(name);
  if (loading) return loading;
  const audio = context();
  const request = fetch(`/assets/audio/${FILES[name]}`).then(async response => {
    if (!response.ok) throw new Error('Audio unavailable');
    const buffer = await audio.decodeAudioData(await response.arrayBuffer());
    buffers.set(name, buffer);
    return buffer;
  }).finally(() => pending.delete(name));
  pending.set(name, request);
  return request;
}
export async function preloadCaseSounds(): Promise<boolean> {
  const sounds = Object.keys(FILES) as CaseSound[];
  const loaded = await Promise.allSettled(sounds.map(loadCaseSound));
  return loaded.every(result => result.status === 'fulfilled');
}
function tone(audio: AudioContext, time: number, hz: number, duration: number, volume: number, type: OscillatorType = 'sine', endHz = hz) {
  const source = audio.createOscillator(), gain = audio.createGain();
  source.type = type; source.frequency.setValueAtTime(hz, time);
  source.frequency.exponentialRampToValueAtTime(endHz, time + duration);
  gain.gain.setValueAtTime(0, time); gain.gain.linearRampToValueAtTime(volume, time + .003); gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
  source.connect(gain); gain.connect(master!); source.start(time); source.stop(time + duration);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  return source;
}
function whiteNoise(audio: AudioContext) {
  if (!noiseBuffer) {
    noiseBuffer = audio.createBuffer(1, audio.sampleRate, audio.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}
function noise(audio: AudioContext, time: number, duration: number, volume: number, frequency: number, type: BiquadFilterType = 'bandpass', attack = .003) {
  const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), gain = audio.createGain();
  source.buffer = whiteNoise(audio); filter.type = type; filter.frequency.value = frequency; filter.Q.value = .7;
  gain.gain.setValueAtTime(.0001, time); gain.gain.linearRampToValueAtTime(volume, time + attack);
  gain.gain.exponentialRampToValueAtTime(.0001, time + duration);
  source.connect(filter); filter.connect(gain); gain.connect(master!); source.start(time); source.stop(time + duration);
  source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
  return source;
}
function mechanicalTick(audio: AudioContext, time: number) { return noise(audio, time, .032, .16, 2300, 'highpass'); }
function sample(name: CaseSound, time: number, volume = 1, speed = 1) {
  const audio = context(), buffer = buffers.get(name);
  // A missing sample must not turn the familiar opening into a synthetic melody.
  if (!buffer) return noise(audio, time, .04, name === 'tick' ? .08 : .03, 1400);
  const source = audio.createBufferSource(), gain = audio.createGain();
  source.buffer = buffer; source.playbackRate.value = speed; gain.gain.value = volume;
  source.connect(gain); gain.connect(master!); source.start(time);
  source.onended = () => { source.disconnect(); gain.disconnect(); };
  return source;
}
function stopSources(sources: AudioScheduledSourceNode[]) { return () => { sources.forEach(source => { try { source.stop(); } catch { /* Already ended. */ } }); }; }
export function playCaseOpening() {
  try {
    const audio = context(); void audio.resume().catch(() => {}); void preloadCaseSounds();
    return stopSources([sample('latch', audio.currentTime, .78)]);
  } catch { return () => {}; }
}
export function playCollectibleOpening(kind: 'capsule' | 'pin-pack', duration: number) {
  if (!enabled || !volume) return () => {};
  try {
    const audio = context(), now = audio.currentTime;
    if (kind === 'capsule') return stopSources([
      noise(audio, now, duration * .42, .13, 680, 'bandpass', duration * .06),
      noise(audio, now + duration * .46, .072, .14, 1250, 'bandpass'),
      tone(audio, now + duration * .46, 280, .072, .035, 'sine', 175),
    ]);
    // Tension builds along the scored seam, followed by a single crumple of the freed edge.
    return stopSources([
      noise(audio, now, duration * .44, .13, 1600, 'bandpass', duration * .1),
      noise(audio, now + duration * .24, duration * .25, .085, 2700, 'bandpass', duration * .035),
      noise(audio, now + duration * .55, .095, .10, 1160, 'bandpass', .018),
    ]);
  } catch { return () => {}; }
}
export function playDeviceScan(kind: 'terminal' | 'xray', seconds: number) {
  if (!enabled || !volume) return () => {};
  try {
    const audio = context(), start = audio.currentTime;
    const xray = kind === 'xray';
    return stopSources([
      noise(audio, start, .055, .09, xray ? 1200 : 920),
      tone(audio, start + seconds * .08, xray ? 240 : 115, seconds * .48, .035, 'sine', xray ? 670 : 178),
      noise(audio, start + seconds * .16, seconds * .52, .060, xray ? 2700 : 1840, 'bandpass', seconds * .12),
      tone(audio, start + seconds * .75, xray ? 760 : 875, .068, .049, 'sine'),
      tone(audio, start + seconds * .81, xray ? 1040 : 1090, .112, .037, 'sine'),
    ]);
  } catch { return () => {}; }
}
export function createReelTicks() {
  const playing = new Set<AudioScheduledSourceNode>();
  function queue(time: number) {
    const source = sample('tick', time, .55);
    playing.add(source);
    source.addEventListener('ended', () => playing.delete(source), { once: true });
  }
  return {
    play() {
      if (!enabled || !volume) return;
      try { queue(context().currentTime); } catch { /* Audio is optional. */ }
    },
    schedule(times: number[], elapsed: number) {
      try {
        const now = context().currentTime;
        for (const time of times) {
          if (time > elapsed) queue(now + (time - elapsed) / 1000);
        }
      } catch { /* Audio is optional. */ }
    },
    stop() {
      stopSources([...playing])();
      playing.clear();
    },
  };
}
export function renderUpgradeTicks(audio: BaseAudioContext, tick: AudioBuffer, crossings: readonly number[], duration: number) {
  const hz = tick.sampleRate;
  // This isolated attack in CS2's crate-item scroll cue reads as one card passing the marker.
  const clipStart = Math.round(.0955 * hz);
  const clipLength = Math.round(.027 * hz);
  const attack = .0007 * hz, release = .005 * hz;
  const firstChannel = tick.getChannelData(0);
  let peak = 0;
  for (let i = 1; i < .008 * hz; i++) {
    if (Math.abs(firstChannel[clipStart + i]) > Math.abs(firstChannel[clipStart + peak])) peak = i;
  }
  const frames = crossings.map(ms => Math.max(0, Math.round(ms * hz / 1000) - peak));
  const length = Math.max(Math.ceil(duration * hz / 1000), (frames.at(-1) ?? 0) + clipLength);
  const buffer = audio.createBuffer(tick.numberOfChannels, length, hz);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = tick.getChannelData(channel), output = buffer.getChannelData(channel);
    frames.forEach((start, i) => {
      const next = frames[i + 1];
      const length = next === undefined ? clipLength : Math.min(clipLength, Math.floor((next - start) * .80));
      const gap = (start - (frames[i - 1] ?? 0)) / hz;
      const gain = .76 + .24 * Math.min(1, gap / .1);
      for (let j = 0; j < length; j++) {
        const envelope = Math.min(1, j / attack, (length - 1 - j) / release);
        output[start + j] = source[clipStart + j] * gain * envelope;
      }
    });
  }
  return buffer;
}

// Convert a source start time to the performance clock used by document.timeline.
// The common master compressor has 6 ms of lookahead before the output device.
function upgradePresentationTime(audio: AudioContext, when: number) {
  const stamp = audio.getOutputTimestamp?.();
  const now = performance.now();
  if (stamp?.performanceTime && stamp.contextTime !== undefined && Math.abs(now - stamp.performanceTime) < 1000) {
    return Math.max(now, stamp.performanceTime + (when - stamp.contextTime) * 1000) + 6;
  }
  const latency = (audio.baseLatency || 0) + (audio.outputLatency || 0);
  return now + (Math.max(0, when - audio.currentTime) + latency) * 1000 + 6;
}

export function createUpgradeSpinPlayback(animation: Animation, tickTimes: readonly number[], duration: number) {
  let rendered: AudioBuffer | undefined;
  let voice: { source: AudioBufferSourceNode; level: GainNode } | undefined;
  let startFrame = 0;
  let resumeTimer: number | undefined;
  let generation = 0;
  function stop(allowTail = false) {
    generation++;
    window.cancelAnimationFrame(startFrame);
    window.clearTimeout(resumeTimer);
    if (!voice || allowTail) return;
    const { source, level } = voice;
    voice = undefined;
    const now = source.context.currentTime;
    level.gain.cancelScheduledValues(now);
    level.gain.setTargetAtTime(0, now, .0015);
    source.stop(now + .008);
  }
  function begin(elapsed: number, current: number) {
    let resumeAt = performance.now();
    try {
      const audio = context();
      const schedule = (tick: AudioBuffer, startingTogether: boolean) => {
        rendered ??= renderUpgradeTicks(audio, tick, tickTimes, duration);
        const when = audio.currentTime + .008;
        const heardAt = upgradePresentationTime(audio, when);
        if (startingTogether && enabled && volume > 0) {
          const nextMark = tickTimes.find(time => time >= elapsed);
          // Use silence before the next tick as pre-roll, including the source's fade-in.
          if (nextMark !== undefined) resumeAt = Math.max(performance.now(), heardAt - Math.max(0, nextMark - elapsed - 10));
        }
        const cursor = (heardAt - resumeAt + elapsed) / 1000;
        if (cursor >= rendered.duration) return;
        const start = when + Math.max(0, -cursor);
        const source = audio.createBufferSource(), level = audio.createGain();
        source.buffer = rendered;
        level.gain.setValueAtTime(0, start);
        level.gain.linearRampToValueAtTime(.48, start + .006);
        source.connect(level); level.connect(master!);
        source.onended = () => {
          source.disconnect(); level.disconnect();
          if (voice?.source === source) voice = undefined;
        };
        source.start(start, Math.max(0, cursor));
        voice = { source, level };
      };
      const tick = buffers.get('tick');
      if (tick && audio.state === 'running') schedule(tick, true);
      else void Promise.all([audio.resume(), loadCaseSound('tick')]).then(([, loaded]) => {
        if (generation === current && !document.hidden) schedule(loaded, false);
      }).catch(() => { /* The pointer runs independently when audio is unavailable. */ });
    } catch { /* The upgrade can still finish with audio unavailable. */ }
    const resume = () => {
      animation.play();
      animation.startTime = resumeAt - elapsed;
    };
    const wait = resumeAt - performance.now();
    if (elapsed > 0 && wait > 0) resumeTimer = window.setTimeout(resume, wait);
    else resume();
  }
  function pause() {
    const elapsed = Math.max(0, Number(animation.currentTime));
    stop();
    animation.pause();
    animation.currentTime = elapsed;
    return elapsed;
  }
  function play() {
    const elapsed = pause(), current = generation;
    // Let the game's state update commit before starting either clock on a visible frame.
    startFrame = window.requestAnimationFrame(() => begin(elapsed, current));
  }
  function end(allowTail: boolean) {
    stop(allowTail);
    animation.onfinish = null;
    animation.cancel();
  }
  return { play, pause, cancel: () => end(false), complete: () => end(animation.playState === 'finished') };
}
export function playCaseStop() {
  try {
    const audio = context(), now = audio.currentTime;
    return stopSources([
      noise(audio, now, .055, .13, 850, 'lowpass'),
      tone(audio, now, 126, .1, .09, 'sine', 54),
    ]);
  } catch { return () => {}; }
}
export function playCaseReveal(rarity: Rarity) {
  try {
    const audio = context(); void audio.resume().catch(() => {});
    const now = audio.currentTime;
    const sources: AudioScheduledSourceNode[] = [sample(rarity === 'gold' || rarity === 'red' ? 'rare' : rarity, now, .82)];
    if (rarity === 'gold' || rarity === 'red') sources.push(tone(audio, now, rarity === 'gold' ? 84 : 75, .7, .18, 'sine', 38));
    return stopSources(sources);
  } catch { return () => {}; }
}
export function sound(type: 'click' | 'tick' | 'win' | 'lose' | 'gem' | 'start') {
  if (!enabled) return;
  try {
    const audio = context(); void audio.resume().catch(() => {});
    const now = audio.currentTime;
    if (type === 'tick') { mechanicalTick(audio, audio.currentTime); return; }
    if (type === 'click') {
      if (now - lastClick < .055) return;
      lastClick = now;
      noise(audio, now, .035, .075, 1800); tone(audio, now, 180, .035, .04, 'sine', 95);
    } else if (type === 'start') {
      sample('latch', now, .32);
      noise(audio, now + .025, .24, .085, 900, 'bandpass', .08);
      tone(audio, now, 70, .22, .09, 'sine', 140);
    } else if (type === 'gem') {
      noise(audio, now, .03, .05, 3500, 'highpass');
      tone(audio, now, 1200, .28, .045, 'sine', 1170);
      tone(audio, now, 2380, .13, .015);
      tone(audio, now + .045, 600, .2, .025);
    } else if (type === 'win') {
      tone(audio, now, 110, .3, .12, 'sine', 75);
      noise(audio, now + .02, .32, .09, 2600, 'bandpass', .035);
      // A short, warm chord with a quiet tail, without an arcade arpeggio.
      [330, 440, 660].forEach(hz => {
        tone(audio, now + .045, hz, .55, .035);
        tone(audio, now + .16, hz, .55, .009);
      });
    } else {
      noise(audio, now, .19, .14, 560, 'lowpass');
      tone(audio, now, 125, .33, .12, 'sine', 45);
      tone(audio, now + .04, 72, .18, .04, 'triangle', 40);
    }
  } catch { /* Sound is optional. */ }
}
