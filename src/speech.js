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
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`);
  }
  if (cache) {
    // Not waited for: playing does not depend on it.
    cache.put(url, response.clone()).catch(() => {});
  }
  return response.arrayBuffer();
}

// The Web Audio API plays sound from memory at exact times, which is what
// playing syllables back to back takes. One AudioContext serves the page.
let audioContext = null;

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

// Plays recordings one after another. files: as planSpeech gives them.
async function playRecordings(files) {
  audioContext = audioContext || new AudioContext();
  // A browser keeps the context asleep until the page has been tapped, and
  // resume() then waits for that tap. It is given a moment and no more, so
  // that nothing here hangs; what was started plays once the context wakes.
  await Promise.race([audioContext.resume(), new Promise((resolve) => setTimeout(resolve, 300))]);
  const buffers = await Promise.all(
    files.map(async (file) => audioContext.decodeAudioData(await fetchRecording(file))),
  );
  let time = audioContext.currentTime + 0.05;
  for (const buffer of buffers) {
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioContext.destination);
    // A single recording is played whole; syllables are trimmed and joined.
    const span = buffers.length > 1 ? soundSpan(buffer) : { start: 0, duration: buffer.duration };
    source.start(time, span.start, span.duration);
    time += span.duration;
  }
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

function speakWithVoice(text, region) {
  const voice = deviceVoice(region);
  if (!voice) {
    return false;
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.voice = voice;
  utterance.lang = voice.lang;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
  return true;
}

// Speaks a word.
//
// word:    the word record
// reading: the reading shown for it, as stored (see readingsFor in tones.js)
// region:  'taiwan' or 'mainland', for the device's voice
//
// Returns how it was spoken: 'word', 'syllables' or 'voice'; or null if it
// could not be (no recording that can be fetched, and no Chinese voice).
export async function speak(word, reading, region) {
  const plan = planSpeech(word, reading, await loadIndex());
  if (plan.kind !== 'voice') {
    try {
      await playRecordings(plan.kind === 'word' ? [plan.file] : plan.files);
      return plan.kind;
    } catch {
      // No connection and not played before, or the browser would not play
      // it: the device's voice is tried instead.
    }
  }
  return speakWithVoice(word.simplified === word.traditional ? word.simplified : word[region === 'taiwan' ? 'traditional' : 'simplified'], region)
    ? 'voice'
    : null;
}
