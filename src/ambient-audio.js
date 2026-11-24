const AudioContextCtor =
  typeof globalThis !== 'undefined'
    ? globalThis.AudioContext || globalThis.webkitAudioContext || null
    : null;

export const ambientAudioAvailable = typeof AudioContextCtor === 'function';

const MASTER_VOLUME = 0.32;
const RAIN_BODY_VOLUME = 0.28;
const RAIN_AIR_VOLUME = 0.08;
const FADE_IN_SECONDS = 0.85;
const FADE_OUT_SECONDS = 0.4;
const HIDDEN_FADE_SECONDS = 0.15;
const NOISE_DURATION_SECONDS = 4;
const DROPLET_MIN_DELAY_MS = 1800;
const DROPLET_MAX_DELAY_MS = 5200;

let operationId = 0;
let desiredEnabled = false;
let engine = null;
let dropletTimer = null;
let suspendTimer = null;
let visibilityBound = false;

function isDocumentHidden() {
  return typeof document !== 'undefined' && Boolean(document.hidden);
}

function clearDropletTimer() {
  if (dropletTimer !== null) {
    clearTimeout(dropletTimer);
    dropletTimer = null;
  }
}

function clearSuspendTimer() {
  if (suspendTimer !== null) {
    clearTimeout(suspendTimer);
    suspendTimer = null;
  }
}

function createSeamlessRainBuffer(ctx) {
  const sampleRate = ctx.sampleRate || 44100;
  const frameCount = Math.max(1, Math.floor(sampleRate * NOISE_DURATION_SECONDS));
  const buffer = ctx.createBuffer(2, frameCount, sampleRate);
  const crossfadeSamples = Math.min(Math.floor(sampleRate * 0.25), Math.floor(frameCount / 4));

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const data = buffer.getChannelData(channel);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;

    for (let i = 0; i < frameCount; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.055;
      b6 = white * 0.115926;
      data[i] = Math.max(-1, Math.min(1, pink));
    }

    for (let i = 0; i < crossfadeSamples; i++) {
      const t = i / crossfadeSamples;
      const tailIndex = frameCount - crossfadeSamples + i;
      data[i] = data[i] * t + data[tailIndex] * (1 - t);
    }
  }

  return buffer;
}

function buildEngine() {
  const ctx = new AudioContextCtor();
  const now = ctx.currentTime;

  const masterGain = ctx.createGain();
  masterGain.gain.setValueAtTime(0, now);
  masterGain.connect(ctx.destination);

  const rainBuffer = createSeamlessRainBuffer(ctx);
  const rainSource = ctx.createBufferSource();
  rainSource.buffer = rainBuffer;
  rainSource.loop = true;

  const rainHighpass = ctx.createBiquadFilter();
  rainHighpass.type = 'highpass';
  rainHighpass.frequency.setValueAtTime(240, now);

  const rainLowpass = ctx.createBiquadFilter();
  rainLowpass.type = 'lowpass';
  rainLowpass.frequency.setValueAtTime(1900, now);
  rainLowpass.Q.setValueAtTime(0.6, now);

  const rainBodyGain = ctx.createGain();
  rainBodyGain.gain.setValueAtTime(RAIN_BODY_VOLUME, now);

  const rainAirFilter = ctx.createBiquadFilter();
  rainAirFilter.type = 'bandpass';
  rainAirFilter.frequency.setValueAtTime(4200, now);
  rainAirFilter.Q.setValueAtTime(0.8, now);

  const rainAirGain = ctx.createGain();
  rainAirGain.gain.setValueAtTime(RAIN_AIR_VOLUME, now);

  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(0.09, now);

  const lfoGain = ctx.createGain();
  lfoGain.gain.setValueAtTime(260, now);
  lfo.connect(lfoGain);
  lfoGain.connect(rainLowpass.frequency);

  rainSource.connect(rainHighpass);
  rainHighpass.connect(rainLowpass);
  rainLowpass.connect(rainBodyGain);
  rainBodyGain.connect(masterGain);

  rainSource.connect(rainAirFilter);
  rainAirFilter.connect(rainAirGain);
  rainAirGain.connect(masterGain);

  rainSource.start(now);
  lfo.start(now);

  return {
    ctx,
    masterGain,
    rainSource,
    lfo,
    activeDroplets: new Set(),
    nodes: [
      rainSource,
      rainHighpass,
      rainLowpass,
      rainBodyGain,
      rainAirFilter,
      rainAirGain,
      lfo,
      lfoGain,
      masterGain,
    ],
  };
}

function rampMasterGain(target, durationSeconds) {
  if (!engine) return;
  const { ctx, masterGain } = engine;
  const now = ctx.currentTime;
  const gainParam = masterGain.gain;

  if (typeof gainParam.cancelAndHoldAtTime === 'function') {
    try {
      gainParam.cancelAndHoldAtTime(now);
    } catch {
      gainParam.cancelScheduledValues(now);
      gainParam.setValueAtTime(gainParam.value, now);
    }
  } else {
    gainParam.cancelScheduledValues(now);
    gainParam.setValueAtTime(gainParam.value, now);
  }

  gainParam.linearRampToValueAtTime(target, now + Math.max(0.01, durationSeconds));
}

function triggerDroplet(currentEngine) {
  if (!currentEngine || currentEngine !== engine) return;
  if (!desiredEnabled || isDocumentHidden()) return;
  if (currentEngine.ctx.state !== 'running') return;

  const { ctx, masterGain, activeDroplets } = currentEngine;
  const now = ctx.currentTime;

  const startFreq = 720 + Math.random() * 680;
  const endFreq = startFreq * (1.35 + Math.random() * 0.35);
  const decaySeconds = 0.08 + Math.random() * 0.07;
  const peakGain = 0.05 + Math.random() * 0.045;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(startFreq, now);
  osc.frequency.exponentialRampToValueAtTime(endFreq, now + decaySeconds * 0.7);

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, now);
  env.gain.linearRampToValueAtTime(peakGain, now + 0.004);
  env.gain.exponentialRampToValueAtTime(0.0001, now + decaySeconds);

  let panner = null;
  if (typeof ctx.createStereoPanner === 'function') {
    panner = ctx.createStereoPanner();
    panner.pan.setValueAtTime((Math.random() * 2 - 1) * 0.65, now);
    osc.connect(env);
    env.connect(panner);
    panner.connect(masterGain);
  } else {
    osc.connect(env);
    env.connect(masterGain);
  }

  const dropletRecord = { osc, env, panner };
  activeDroplets.add(dropletRecord);

  osc.onended = () => {
    activeDroplets.delete(dropletRecord);
    try {
      osc.disconnect();
    } catch {}
    try {
      env.disconnect();
    } catch {}
    if (panner) {
      try {
        panner.disconnect();
      } catch {}
    }
  };

  osc.start(now);
  osc.stop(now + decaySeconds + 0.02);
}

function scheduleNextDroplet(currentEngine, expectedOpId) {
  clearDropletTimer();
  if (!currentEngine || currentEngine !== engine) return;
  if (!desiredEnabled || isDocumentHidden() || expectedOpId !== operationId) return;

  const delay =
    DROPLET_MIN_DELAY_MS + Math.random() * (DROPLET_MAX_DELAY_MS - DROPLET_MIN_DELAY_MS);

  dropletTimer = setTimeout(() => {
    dropletTimer = null;
    if (currentEngine !== engine || !desiredEnabled || isDocumentHidden()) return;
    triggerDroplet(currentEngine);
    scheduleNextDroplet(currentEngine, expectedOpId);
  }, delay);
}

function fadeOutAndSuspend(durationSeconds, expectedOpId) {
  clearDropletTimer();
  clearSuspendTimer();
  if (!engine) return;

  const targetEngine = engine;
  rampMasterGain(0, durationSeconds);

  suspendTimer = setTimeout(() => {
    suspendTimer = null;
    if (targetEngine !== engine) return;
    if (desiredEnabled && !isDocumentHidden() && expectedOpId === operationId) return;
    if (targetEngine.ctx.state === 'running' && typeof targetEngine.ctx.suspend === 'function') {
      targetEngine.ctx.suspend().catch(() => {});
    }
  }, Math.ceil(durationSeconds * 1000) + 40);
}

async function resumePlayback(expectedOpId) {
  if (!engine || !desiredEnabled || isDocumentHidden()) return false;

  const targetEngine = engine;
  clearSuspendTimer();

  if (targetEngine.ctx.state === 'suspended' && typeof targetEngine.ctx.resume === 'function') {
    await targetEngine.ctx.resume();
  }

  if (expectedOpId !== operationId || targetEngine !== engine || !desiredEnabled || isDocumentHidden()) {
    return false;
  }

  if (targetEngine.ctx.state !== 'running') {
    return false;
  }

  rampMasterGain(MASTER_VOLUME, FADE_IN_SECONDS);
  scheduleNextDroplet(targetEngine, expectedOpId);
  return true;
}

function handleVisibilityChange() {
  if (!engine) return;
  const currentOpId = operationId;

  if (isDocumentHidden()) {
    fadeOutAndSuspend(HIDDEN_FADE_SECONDS, currentOpId);
    return;
  }

  if (desiredEnabled) {
    resumePlayback(currentOpId).catch(() => {});
  }
}

function bindVisibilityListener() {
  if (!visibilityBound && typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
    visibilityBound = true;
  }
}

function unbindVisibilityListener() {
  if (visibilityBound && typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    visibilityBound = false;
  }
}

function teardownEngine(targetEngine) {
  if (!targetEngine) return;

  for (const droplet of targetEngine.activeDroplets) {
    try {
      droplet.osc.onended = null;
      droplet.osc.stop();
    } catch {}
    try {
      droplet.osc.disconnect();
    } catch {}
    try {
      droplet.env.disconnect();
    } catch {}
    if (droplet.panner) {
      try {
        droplet.panner.disconnect();
      } catch {}
    }
  }
  targetEngine.activeDroplets.clear();

  try {
    targetEngine.rainSource.stop();
  } catch {}
  try {
    targetEngine.lfo.stop();
  } catch {}

  for (const node of targetEngine.nodes) {
    try {
      node.disconnect();
    } catch {}
  }

  if (targetEngine.ctx.state !== 'closed' && typeof targetEngine.ctx.close === 'function') {
    try {
      const closeResult = targetEngine.ctx.close();
      if (closeResult && typeof closeResult.catch === 'function') {
        closeResult.catch(() => {});
      }
    } catch {}
  }
}

export async function setAmbientEnabled(enabled) {
  const nextEnabled = Boolean(enabled);
  const currentOpId = ++operationId;

  if (!ambientAudioAvailable) {
    desiredEnabled = false;
    return false;
  }

  desiredEnabled = nextEnabled;

  if (!nextEnabled) {
    fadeOutAndSuspend(FADE_OUT_SECONDS, currentOpId);
    return false;
  }

  try {
    if (!engine || engine.ctx.state === 'closed') {
      engine = buildEngine();
    }
    bindVisibilityListener();

    if (isDocumentHidden()) {
      fadeOutAndSuspend(HIDDEN_FADE_SECONDS, currentOpId);
      return desiredEnabled && currentOpId === operationId;
    }

    const active = await resumePlayback(currentOpId);
    if (!active && currentOpId === operationId) {
      if (isDocumentHidden()) {
        fadeOutAndSuspend(HIDDEN_FADE_SECONDS, currentOpId);
        return desiredEnabled;
      }
      desiredEnabled = false;
      fadeOutAndSuspend(HIDDEN_FADE_SECONDS, currentOpId);
    }
    return active;
  } catch {
    if (currentOpId === operationId) {
      desiredEnabled = false;
      disposeAmbientAudio();
    }
    return false;
  }
}

export function disposeAmbientAudio() {
  operationId++;
  desiredEnabled = false;
  clearDropletTimer();
  clearSuspendTimer();
  unbindVisibilityListener();

  const currentEngine = engine;
  engine = null;
  teardownEngine(currentEngine);
}
