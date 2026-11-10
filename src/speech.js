// Speaking a word aloud: the page side. Which recordings to play is worked
// out in speechPlan.js; read its opening comment first.
//
// Recordings are fetched from the app's own address when first played and
// kept on the device from then on, so a word heard once can be heard again
// without a connection. (All of them can be saved at once from Settings;
// see offline.js.)

import { planSpeech } from './speechPlan.js';

// BASE_URL is the folder the app is served from.
const BASE = import.meta.env.BASE_URL;
const address = (file) => new URL(`${BASE}audio/${file}`, window.location.href).href;

// The store recordings are kept in. The service worker answers from it as
// from the others (see serviceWorker.js); offline.js fills it too.
const AUDIO_CACHE = 'offline-audio';

// How long a recording not yet on the device is waited for. With a
// connection that doesn't reach the internet (Wi-Fi without it, weak mobile
// data) a request can hang for a long time, and the words asked for
// meanwhile all played at once when it ended (the owner, 2026-11-10). After
// this the device's own voice speaks instead; the recording goes on loading
// and is kept for next time.
const NETWORK_WAIT_MS = 1500;

// What recordings there are, read once: { words: Set, syllables: Set }.
let indexPromise = null;
function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetch(address('index.json'))
      .then((response) => response.json())
      .then((index) => ({ words: new Set(index.words), syllables: new Set(index.syllables) }))
      // Without the list (no connection yet, say) only the device's voice is left.
      .catch(() => {
        indexPromise = null;
        return { words: new Set(), syllables: new Set() };
      });
  }
  return indexPromise;
}

// Fetches a recording, from the device if it was played before. The Cache
// API (`caches`) only exists at https and localhost addresses.
async function fetchRecording(file) {
  const url = address(`${file}.mp3`);
  const cache = 'caches' in window ? await caches.open(AUDIO_CACHE) : null;
  const saved = cache && (await cache.match(url));
  if (saved) {
    return saved.arrayBuffer();
  }
  // The browser knows it has no connection at all: not worth asking.
  if (!navigator.onLine) {
    throw new Error(`${url}: offline`);
  }
  const loading = fetch(url).then((response) => {
    if (!response.ok) {
      throw new Error(`${url}: ${response.status}`);
    }
    if (cache) {
      // Not waited for: playing does not depend on it.
      cache.put(url, response.clone()).catch(() => {});
    }
    return response.arrayBuffer();
  });
  // Once given up on (below), its failing later is nobody's concern.
  loading.catch(() => {});
  const tooSlow = new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error(`${url}: too slow`)), NETWORK_WAIT_MS);
  });
  return Promise.race([loading, tooSlow]);
}

// The Web Audio API plays sound from memory at exact times, which is what
// playing syllables back to back takes. One AudioContext serves the page.
let audioContext = null;

// Only the word asked for last is heard: each request to speak is counted,
// and one overtaken while its recordings loaded plays nothing. What is
// still sounding stops when the next word begins.
let requests = 0;
let sounding = [];

function stopSounding() {
  for (const source of sounding) {
    source.stop();
  }
  sounding = [];
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
  }
}

// Where the sound in a recording begins and ends, in seconds. Syllable
// recordings have a moment of silence at either end, which would make a
// word spoken syllable by syllable sound halting.
function soundSpan(buffer) {
  const samples = buffer.getChannelData(0);
  const loud = (sample) => Math.abs(sample) > 0.02;
  let first = 0;
  while (first < samples.length && !loud(samples[first])) {
    first += 1;
  }
  let last = samples.length - 1;
  while (last > first && !loud(samples[last])) {
    last -= 1;
  }
  const margin = 0.02;
  const start = Math.max(0, first / buffer.sampleRate - margin);
  const end = Math.min(buffer.duration, last / buffer.sampleRate + margin);
  return { start, duration: Math.max(0.05, end - start) };
}

// Plays recordings one after another.
//
// files:  as planSpeech gives them
// volume: from 0 (silent) to 1 (as recorded)
// asked:  the request's number (`requests`); nothing is played if another
//         came meanwhile
//
// Returns false if it was overtaken and played nothing.
async function playRecordings(files, volume, asked) {
  audioContext = audioContext || new AudioContext();
  // A browser keeps the context asleep until the page has been tapped, and
  // resume() then waits for that tap. It is given a moment and no more, so
  // that nothing here hangs; what was started plays once the context wakes.
  await Promise.race([audioContext.resume(), new Promise((resolve) => setTimeout(resolve, 300))]);
  const buffers = await Promise.all(
    files.map(async (file) => audioContext.decodeAudioData(await fetchRecording(file))),
  );
  if (asked !== requests) {
    return false;
  }
  stopSounding();
  // A "gain node" sits between the recordings and the loudspeaker and
  // turns them down. Loudness is heard in proportions, not in steps, so the
  // slider's value is squared: half-way on the slider then sounds about
  // half as loud.
  const gain = audioContext.createGain();
  gain.gain.value = volume * volume;
  gain.connect(audioContext.destination);
  let time = audioContext.currentTime + 0.05;
  for (const buffer of buffers) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(gain);
    // A single recording is played whole; syllables are trimmed and joined.
    const span = buffers.length > 1 ? soundSpan(buffer) : { start: 0, duration: buffer.duration };
    source.start(time, span.start, span.duration);
    time += span.duration;
    sounding.push(source);
  }
  return true;
}

// The device's Chinese voice for a region ('taiwan' or 'mainland'), or one
// for the other region, or null if it has none. Only voices that work
// without a connection are used.
function deviceVoice(region) {
  if (!('speechSynthesis' in window)) {
    return null;
  }
  const voices = window.speechSynthesis.getVoices().filter((voice) => voice.lang.toLowerCase().startsWith('zh') && voice.localService);
  const wanted = region === 'taiwan' ? 'tw' : 'cn';
  return voices.find((voice) => voice.lang.toLowerCase().replace('_', '-').endsWith(wanted)) || voices[0] || null;
}

function speakWithVoice(text, region, volume) {
  const voice = deviceVoice(region);
  if (!voice) {
    return false;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  utterance.volume = volume;
  stopSounding();
  window.speechSynthesis.speak(utterance);
  return true;
}

// Plays one recording by its name ("s/ma1", "w/5988-5988"), for "Basics of
// Chinese" (basics.js). Returns false if it could not be played.
export async function playRecording(file, volume = 1) {
  requests += 1;
  try {
    await playRecordings([file], volume, requests);
    return true;
  } catch {
    return false;
  }
}

// Speaks a word.
//
// word:    the word record
// reading: the reading shown for it, as stored (see readingsFor in tones.js)
// region:  'taiwan' or 'mainland', for the device's voice
// volume:  from 0 (silent) to 1 (full), as the Volume setting has it
//
// Returns how it was spoken: 'word', 'syllables' or 'voice'; null if it
// could not be (no recording that can be fetched, and no Chinese voice); or
// 'overtaken' if another word was asked for before this one could be
// played, and nothing was.
export async function speak(word, reading, region, volume = 1) {
  requests += 1;
  const asked = requests;
  const plan = planSpeech(word, reading, await loadIndex());
  if (plan.kind !== 'voice') {
    try {
      const played = await playRecordings(plan.kind === 'word' ? [plan.file] : plan.files, volume, asked);
      return played ? plan.kind : 'overtaken';
    } catch {
      // No connection, or too slow, and not played before; or the browser
      // would not play it: the device's voice is tried instead.
    }
  }
  if (asked !== requests) {
    return 'overtaken';
  }
  return speakWithVoice(word.simplified === word.traditional ? word.simplified : word[region === 'taiwan' ? 'traditional' : 'simplified'], region, volume)
    ? 'voice'
    : null;
}
