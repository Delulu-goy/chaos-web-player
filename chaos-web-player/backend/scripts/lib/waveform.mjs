// Chaos Radio — Calcolo della waveform (picchi) di un brano MP3
//
// Stellar non ha ffmpeg, quindi il decoding avviene con `mpg123-decoder`
// (build WebAssembly di mpg123: nessuna dipendenza nativa, gira su Node 20+).
//
// Tre scelte tecniche:
//
// 1. DECODE A CHUNK. I frame MPEG vengono passati a `decodeFrames()` a gruppi
//    di poche decine: il PCM non viene mai materializzato per intero. Il
//    decode "tutto in un colpo" di un brano da 6 minuti tiene in memoria
//    ~127 MB di Float32 stereo, che su un hosting condiviso è rischioso.
//    Con i chunk la memoria resta sotto 1 MB.
//
// 2. RMS, NON MAX. Il max per bucket su un master moderno compresso è
//    praticamente a pieno scala in ogni punto della traccia: la waveform
//    risulterebbe piatta. L'RMS per bucket riflette l'energia media.
//
// 3. NORMALIZZAZIONE ADATTIVA. La finestra in dB non è fissa (-60..0 dB
//    schiaccia i brani loud in cima al 100%): viene calcolata sul brano
//    stesso, dal 5° al 95° percentile dei valori in dB. Ogni brano usa
//    così tutto il range verticale disponibile.
//
// Output: un Buffer di `buckets` byte (0-255) con l'ampiezza di ogni
// bucket. Va serializzato in base64 per il DB.

import fs from "node:fs";
import { MPEGDecoder } from "mpg123-decoder";

/** Numero di bucket della waveform salvata nel DB. */
export const WAVEFORM_BUCKETS = 300;

/** Frame MPEG decodificati per chunk: tiene bassa la memoria del PCM. */
const CHUNK_FRAMES = 64;

/** Percentili usati per la finestra di normalizzazione adattiva. */
const DB_WINDOW_LOW = 0.05;
const DB_WINDOW_HIGH = 0.95;

/** Gamma applicata dopo la normalizzazione: alza le parti basse. */
const GAMMA = 0.7;

// ── Parsing dei frame MPEG ───────────────────────────────────────────────

const BITRATE_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const BITRATE_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
const SAMPLE_RATES = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };

/**
 * Legge l'header di un frame MPEG all'offset dato.
 * @returns null se non è un header valido.
 */
function readFrameHeader(buf, i) {
  if (i + 4 > buf.length) return null;
  if (buf[i] !== 0xff || (buf[i + 1] & 0xe0) !== 0xe0) return null;

  const version = (buf[i + 1] >> 3) & 0x03; // 3=MPEG1, 2=MPEG2, 0=MPEG2.5
  const layer = (buf[i + 1] >> 1) & 0x03; // 1=Layer III
  if (version === 1 || layer !== 1) return null;

  const brIndex = (buf[i + 2] >> 4) & 0x0f;
  const srIndex = (buf[i + 2] >> 2) & 0x03;
  if (brIndex === 0 || brIndex === 15 || srIndex === 3) return null;

  const bitrate = (version === 3 ? BITRATE_V1_L3 : BITRATE_V2_L3)[brIndex] * 1000;
  const sampleRate = SAMPLE_RATES[version][srIndex];
  const padding = (buf[i + 2] >> 1) & 0x01;

  const length =
    version === 3
      ? Math.floor((144 * bitrate) / sampleRate) + padding
      : Math.floor((72 * bitrate) / sampleRate) + padding;

  return {
    version,
    length,
    samplesPerFrame: version === 3 ? 1152 : 576,
  };
}

/** Offset del primo byte utile (salta il tag ID3v2). */
function skipId3(buf) {
  if (buf.length < 10 || buf.toString("latin1", 0, 3) !== "ID3") return 0;
  const size =
    ((buf[6] & 0x7f) << 21) |
    ((buf[7] & 0x7f) << 14) |
    ((buf[8] & 0x7f) << 7) |
    (buf[9] & 0x7f);
  return Math.min(10 + size, buf.length);
}

/**
 * Trova l'offset del primo frame di una catena valida.
 * Un singolo 0xFF 0xEx dentro i dati audio è un falso sync: si esige che
 * il frame candidato sia seguito da altri due frame validi alle posizioni
 * esatte.
 */
function findFirstFrame(buf, from) {
  const limit = Math.min(buf.length - 4, from + 500000);
  for (let i = from; i < limit; i++) {
    const h = readFrameHeader(buf, i);
    if (!h) continue;
    const h2 = readFrameHeader(buf, i + h.length);
    if (!h2) continue;
    const h3 = readFrameHeader(buf, i + h.length + h2.length);
    if (!h3) continue;
    return i;
  }
  return -1;
}

// ── Calcolo dei picchi ───────────────────────────────────────────────────

/**
 * Calcola la waveform di un file MP3.
 *
 * @param {string} filePath percorso assoluto del file
 * @param {number} buckets numero di bucket da produrre
 * @returns {Promise<{peaks: Buffer, sampleRate: number, durationSeconds: number, frames: number}>}
 */
export async function computeWaveform(filePath, buckets = WAVEFORM_BUCKETS) {
  const buf = fs.readFileSync(filePath);
  const start = findFirstFrame(buf, skipId3(buf));
  if (start < 0) {
    throw new Error("Nessun frame MPEG valido trovato nel file");
  }

  const decoder = new MPEGDecoder();
  await decoder.ready;

  // Somme dei quadrati per frame: un valore per frame, non per campione.
  // Per un brano da 6 minuti sono ~13.700 float (110 KB): trascurabile.
  const frameSums = [];
  const frameCounts = [];

  let samplesPerFrame = 1152;
  let sampleRate = 44100;
  let chunk = [];
  let decodedSamples = 0;

  const processChunk = (frames) => {
    if (frames.length === 0) return;
    const { channelData, samplesDecoded, sampleRate: sr, errors } =
      decoder.decodeFrames(frames);
    if (errors && errors.length > 0) {
      // Errori di decodifica singoli frame: si prosegue, il brano resta
      // riproducibile e la waveform resta un'approssimazione.
    }
    if (sr) sampleRate = sr;
    const pcm = channelData?.[0];
    if (!pcm) return;

    let cursor = 0;
    const total = pcm.length;
    while (cursor < total) {
      const n = Math.min(samplesPerFrame, total - cursor);
      let sum = 0;
      for (let j = 0; j < n; j++) {
        const v = pcm[cursor + j];
        sum += v * v;
      }
      frameSums.push(sum);
      frameCounts.push(n);
      cursor += n;
    }
    decodedSamples += samplesDecoded ?? 0;
  };

  // Segui la catena dei frame a partire dal primo valido.
  let offset = start;
  let frames = 0;
  while (offset + 4 <= buf.length) {
    const header = readFrameHeader(buf, offset);
    if (!header) break;
    if (frames === 0) {
      samplesPerFrame = header.samplesPerFrame;
    }
    chunk.push(buf.subarray(offset, offset + header.length));
    frames++;
    if (chunk.length >= CHUNK_FRAMES) {
      processChunk(chunk);
      chunk = [];
    }
    offset += header.length;
  }
  processChunk(chunk);

  if (frameSums.length === 0) {
    throw new Error("Decodifica MP3 non ha prodotto campioni");
  }

  // ── Dal per-frame ai bucket ────────────────────────────────────────────
  const totalSamples = frameCounts.reduce((a, b) => a + b, 0);
  const samplesPerBucket = totalSamples / buckets;
  const rmsPerBucket = new Float64Array(buckets);

  let frameIndex = 0;
  let consumed = 0;
  for (let b = 0; b < buckets; b++) {
    const bucketEnd = Math.round((b + 1) * samplesPerBucket);
    let sum = 0;
    let count = 0;
    while (frameIndex < frameSums.length && consumed < bucketEnd) {
      sum += frameSums[frameIndex];
      count += frameCounts[frameIndex];
      consumed += frameCounts[frameIndex];
      frameIndex++;
    }
    rmsPerBucket[b] = count > 0 ? Math.sqrt(sum / count) : 0;
  }

  // ── Normalizzazione adattiva in dB ─────────────────────────────────────
  const dbs = Array.from(rmsPerBucket, (rms) =>
    20 * Math.log10(Math.max(rms, 1e-6)),
  );
  const sorted = [...dbs].sort((a, b) => a - b);
  const lo = sorted[Math.floor(sorted.length * DB_WINDOW_LOW)];
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * DB_WINDOW_HIGH))];
  const span = Math.max(hi - lo, 1e-6);

  const peaks = Buffer.alloc(buckets);
  for (let b = 0; b < buckets; b++) {
    const normalized = Math.min(1, Math.max(0, (dbs[b] - lo) / span));
    peaks[b] = Math.round(normalized ** GAMMA * 255);
  }

  return {
    peaks,
    sampleRate,
    durationSeconds: decodedSamples > 0 ? decodedSamples / sampleRate : totalSamples / sampleRate,
    frames,
  };
}

/**
 * Serializza i picchi per il DB: base64 di 300 byte = 400 caratteri.
 * @param {Buffer} peaks
 */
export function serializeWaveform(peaks) {
  return peaks.toString("base64");
}

/**
 * Decodifica una waveform serializzata in una lista di numeri 0..1.
 * @param {string} encoded base64
 * @returns {number[]}
 */
export function deserializeWaveform(encoded) {
  if (!encoded) return [];
  const buf = Buffer.from(encoded, "base64");
  return Array.from(buf, (b) => b / 255);
}
