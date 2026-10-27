// SPDX-License-Identifier: AGPL-3.0-only

/**
 * Narration audio for the evidence bundle: 16 kHz mono 16-bit PCM WAV, the format Muse Voice
 * Transcribe accepts (docs/architecture.md §4.6).
 */

export const NARRATION_SAMPLE_RATE = 16_000;

/** Downsamples mono audio by averaging the input samples that fall into each output sample. */
export function resample(
  input: Float32Array,
  fromRate: number,
  toRate = NARRATION_SAMPLE_RATE,
): Float32Array {
  if (fromRate === toRate) return input.slice();
  if (fromRate < toRate) throw new RangeError("Upsampling is not supported");
  const ratio = fromRate / toRate;
  const output = new Float32Array(Math.floor(input.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j]!;
    output[i] = end > start ? sum / (end - start) : 0;
  }
  return output;
}

/** Root mean square of the samples (0–1). */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}

/** Level in dBFS for an RMS value; silence is -Infinity. */
export function toDbfs(rmsValue: number): number {
  return rmsValue > 0 ? 20 * Math.log10(rmsValue) : Number.NEGATIVE_INFINITY;
}

/** Encodes mono float samples (-1…1) as a 16-bit PCM WAV file. */
export function encodeWav(samples: Float32Array, sampleRate = NARRATION_SAMPLE_RATE): Uint8Array {
  const dataBytes = samples.length * 2;
  const buffer = new ArrayBuffer(44 + dataBytes);
  const view = new DataView(buffer);
  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, "RIFF");
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, "data");
  view.setUint32(40, dataBytes, true);

  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]!));
    view.setInt16(44 + i * 2, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}
