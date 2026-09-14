import "server-only";
import { mediaAssert as check } from "./media-errors";

type Dimensions = { width: number; height: number };
export type FrameProof = Dimensions & { visible: boolean };
class Bits {
  private bit = 0;
  constructor(private readonly bytes: Uint8Array) {}
  read(count: number): number {
    check(count >= 0 && count <= 32 && this.bit + count <= this.bytes.length * 8);
    let value = 0;
    for (let i = 0; i < count; i++, this.bit++) value = value * 2 + ((this.bytes[this.bit >> 3] >> (7 - (this.bit & 7))) & 1);
    return value;
  }
  ue(): number {
    let zeros = 0;
    while (this.read(1) === 0) check(++zeros <= 24);
    return 2 ** zeros - 1 + this.read(zeros);
  }
  se(): number {
    const value = this.ue();
    return value % 2 ? (value + 1) / 2 : -value / 2;
  }
}
function dimension(width: number, height: number): Dimensions {
  check(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0);
  check(width <= 1920 && height <= 1080, "videoResolution");
  return { width, height };
}
function rbsp(nal: Uint8Array) {
  const result: number[] = [];
  for (let i = 1; i < nal.length; i++) {
    if (i >= 3 && nal[i] === 3 && nal[i - 1] === 0 && nal[i - 2] === 0) {
      check(i + 1 < nal.length && nal[i + 1] <= 3);
      continue;
    }
    result.push(nal[i]);
  }
  return new Uint8Array(result);
}
function sps(nal: Uint8Array): Dimensions & { id: number } {
  check(nal.length >= 5 && nal.length <= 4096 && (nal[0] & 31) === 7);
  const bits = new Bits(rbsp(nal));
  const profile = bits.read(8);
  bits.read(8); bits.read(8);
  const id = bits.ue();
  check(id <= 31);
  let chroma = 1, separate = 0;
  if ([100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135].includes(profile)) {
    chroma = bits.ue(); check(chroma <= 3);
    if (chroma === 3) separate = bits.read(1);
    check(bits.ue() <= 6 && bits.ue() <= 6);
    bits.read(1);
    if (bits.read(1)) {
      const lists = chroma === 3 ? 12 : 8;
      for (let i = 0; i < lists; i++) {
        if (!bits.read(1)) continue;
        let last = 8, next = 8;
        for (let j = 0; j < (i < 6 ? 16 : 64); j++) {
          if (next !== 0) next = (last + bits.se() + 256) % 256;
          if (next !== 0) last = next;
        }
      }
    }
  } else check([66, 77, 88].includes(profile), "unsupportedVideo");
  check(bits.ue() <= 12);
  const poc = bits.ue();
  check(poc <= 2);
  if (poc === 0) check(bits.ue() <= 12);
  if (poc === 1) {
    bits.read(1); bits.se(); bits.se();
    const n = bits.ue(); check(n <= 255);
    for (let i = 0; i < n; i++) bits.se();
  }
  check(bits.ue() <= 32);
  bits.read(1);
  const columns = bits.ue() + 1, rows = bits.ue() + 1;
  // Permit the normal 1088 coded rows cropped to 1080, without allowing a large decode surface hidden by cropping.
  check(columns <= 120 && rows <= 68, "videoResolution");
  const frameOnly = bits.read(1);
  if (!frameOnly) bits.read(1);
  bits.read(1);
  let left = 0, right = 0, top = 0, bottom = 0;
  if (bits.read(1)) { left = bits.ue(); right = bits.ue(); top = bits.ue(); bottom = bits.ue(); }
  const format = separate ? 0 : chroma;
  const cropX = format === 1 || format === 2 ? 2 : 1;
  const cropY = (format === 1 ? 2 : 1) * (2 - frameOnly);
  const size = dimension(columns * 16 - (left + right) * cropX, rows * 16 * (2 - frameOnly) - (top + bottom) * cropY);
  check(frameOnly === 1, "unsupportedVideo");
  return { ...size, id };
}
class AvcInspector {
  private readonly sequences = new Map<number, Dimensions>();
  private readonly pictures = new Map<number, number>();
  private size: Dimensions | undefined;
  private readonly lengthSize: number;
  constructor(config: Uint8Array) {
    check(config.length >= 7 && config.length <= 65_536 && config[0] === 1);
    this.lengthSize = (config[4] & 3) + 1;
    check(this.lengthSize !== 3);
    const sequenceCount = config[5] & 31;
    check(sequenceCount > 0);
    let p = 6;
    const readNal = () => {
      check(p + 2 <= config.length);
      const n = config[p] * 256 + config[p + 1]; p += 2;
      check(n > 0 && p + n <= config.length);
      const nal = config.subarray(p, p + n); p += n;
      this.configuration(nal);
    };
    for (let i = 0; i < sequenceCount; i++) readNal();
    check(p < config.length);
    const pictureCount = config[p++];
    check(pictureCount > 0 && pictureCount <= 32);
    for (let i = 0; i < pictureCount; i++) readNal();
    // High-profile avcC extensions describe bit depth/chroma; SPS remains authoritative.
    check(this.size && this.sequences.size > 0 && this.pictures.size > 0);
  }
  private configuration(nal: Uint8Array) {
    check((nal[0] & 0x80) === 0 && nal.length <= 4096);
    const type = nal[0] & 31;
    if (type === 7) {
      const size = sps(nal);
      if (this.size) check(size.width === this.size.width && size.height === this.size.height, "unsupportedVideo");
      this.size = size;
      this.sequences.set(size.id, size);
    } else if (type === 8) {
      const bits = new Bits(rbsp(nal));
      const id = bits.ue(), sequence = bits.ue();
      check(id <= 255 && this.sequences.has(sequence));
      this.pictures.set(id, sequence);
    } else check(false);
  }
  inspect(data: Uint8Array): FrameProof {
    let p = 0, nals = 0, slices = 0, previousMacroblock = -1;
    while (p < data.length) {
      check(++nals <= 2048 && p + this.lengthSize <= data.length);
      let length = 0;
      for (let i = 0; i < this.lengthSize; i++) length = length * 256 + data[p++];
      check(length > 0 && p + length <= data.length);
      const nal = data.subarray(p, p + length); p += length;
      check((nal[0] & 0x80) === 0);
      const type = nal[0] & 31;
      if (type === 7 || type === 8) this.configuration(nal);
      else if (type === 1 || type === 5) {
        // Only the slice header is needed, never copy the compressed frame into an RBSP buffer.
        const bits = new Bits(rbsp(nal.subarray(0, Math.min(nal.length, 128))));
        const firstMacroblock = bits.ue();
        // Exactly one access unit per MP4 sample. Repeated first slices could conceal extra pictures/fps.
        check(firstMacroblock < 120 * 68 && (slices === 0 ? firstMacroblock === 0 : firstMacroblock > previousMacroblock), "unsupportedVideo");
        previousMacroblock = firstMacroblock;
        check(bits.ue() <= 9);
        check(this.pictures.has(bits.ue()));
        slices++;
      } else check([6, 9, 10, 11, 12, 14].includes(type), "unsupportedVideo");
    }
    check(slices > 0 && this.size);
    return { ...this.size, visible: true };
  }
}
class Vp8Inspector {
  private size: Dimensions | undefined;
  inspect(data: Uint8Array): FrameProof {
    check(data.length >= 3);
    const tag = data[0] + data[1] * 256 + data[2] * 65536;
    check(((tag >> 1) & 7) <= 3 && (tag >>> 5) <= data.length - 3);
    if (!(tag & 1)) {
      check(data.length >= 10 && data[3] === 0x9d && data[4] === 0x01 && data[5] === 0x2a);
      const size = dimension((data[6] + data[7] * 256) & 0x3fff, (data[8] + data[9] * 256) & 0x3fff);
      if (this.size) check(size.width === this.size.width && size.height === this.size.height, "unsupportedVideo");
      this.size = size;
    }
    check(this.size);
    return { ...this.size, visible: Boolean(tag & 16) };
  }
}
class Vp9Inspector {
  private readonly refs: (Dimensions | undefined)[] = Array.from({ length: 8 });
  private size: Dimensions | undefined;
  inspect(data: Uint8Array): FrameProof {
    check(data.length > 0);
    // VP9 superframes may include invisible alternate-reference frames.
    const marker = data[data.length - 1];
    if ((marker & 0xe0) === 0xc0) {
      const count = (marker & 7) + 1, magnitude = ((marker >> 3) & 3) + 1;
      const indexSize = 2 + count * magnitude;
      const start = data.length - indexSize;
      check(start >= 0 && data[start] === marker);
      let p = start + 1, offset = 0;
      let visible: FrameProof | undefined;
      for (let i = 0; i < count; i++) {
        let length = 0;
        for (let j = 0; j < magnitude; j++) length += data[p++] * 2 ** (j * 8);
        check(length > 0 && offset + length <= start);
        const frame = this.frame(data.subarray(offset, offset + length));
        if (frame.visible) { check(!visible, "unsupportedVideo"); visible = frame; }
        offset += length;
      }
      check(offset === start);
      check(this.size);
      return visible ?? { ...this.size, visible: false };
    }
    return this.frame(data);
  }
  private frame(data: Uint8Array): FrameProof {
    const bits = new Bits(data);
    check(bits.read(2) === 2);
    const profile = bits.read(1) + bits.read(1) * 2;
    if (profile === 3) check(bits.read(1) === 0);
    if (bits.read(1)) {
      const size = this.refs[bits.read(3)];
      check(size);
      return { ...size, visible: true };
    }
    const inter = bits.read(1), visible = Boolean(bits.read(1)), resilient = bits.read(1);
    let size: Dimensions;
    let refresh: number;
    const sync = () => check(bits.read(24) === 0x498342);
    const color = () => {
      if (profile >= 2) bits.read(1);
      const space = bits.read(3);
      if (space !== 7) {
        bits.read(1);
        if (profile === 1 || profile === 3) { bits.read(2); check(bits.read(1) === 0); }
      } else {
        check(profile === 1 || profile === 3);
        check(bits.read(1) === 0);
      }
    };
    const readSize = () => dimension(bits.read(16) + 1, bits.read(16) + 1);
    if (!inter) {
      sync(); color(); size = readSize(); refresh = 255;
    } else {
      const intra = visible ? false : Boolean(bits.read(1));
      if (!resilient) bits.read(2);
      if (intra) {
        sync(); if (profile > 0) color();
        refresh = bits.read(8); size = readSize();
      } else {
        refresh = bits.read(8);
        const references: number[] = [];
        for (let i = 0; i < 3; i++) { references.push(bits.read(3)); bits.read(1); }
        let inferred: Dimensions | undefined;
        for (const reference of references) {
          if (bits.read(1)) { inferred = this.refs[reference]; check(inferred); break; }
        }
        size = inferred ?? readSize();
      }
    }
    if (bits.read(1)) {
      const render = readSize();
      check(render.width === size.width && render.height === size.height, "unsupportedVideo");
    }
    if (this.size) check(this.size.width === size.width && this.size.height === size.height, "unsupportedVideo");
    this.size = size;
    for (let i = 0; i < 8; i++) if (refresh & (1 << i)) this.refs[i] = size;
    return { ...size, visible };
  }
}
export function createVideoInspector(codec: "avc" | "vp8" | "vp9", description?: Uint8Array) {
  if (codec === "avc") { check(description); return new AvcInspector(description); }
  return codec === "vp8" ? new Vp8Inspector() : new Vp9Inspector();
}
export function validateAudioConfig(codec: "aac" | "opus" | "vorbis", description: Uint8Array | undefined) {
  check(description && description.length > 0 && description.length <= 65_536);
  if (codec === "aac") {
    const bits = new Bits(description);
    let object = bits.read(5);
    if (object === 31) object = 32 + bits.read(6);
    const frequency = bits.read(4);
    if (frequency === 15) check(bits.read(24) > 0);
    else check(frequency <= 12);
    const channels = bits.read(4);
    check(channels > 0 && channels <= 7, "unsupportedVideo");
    check([2, 5, 29].includes(object), "unsupportedVideo");
  } else if (codec === "opus") {
    check(description.length >= 19 && String.fromCharCode(...description.subarray(0, 8)) === "OpusHead");
    check(description[8] <= 15 && description[9] > 0);
  } else {
    // Matroska Vorbis CodecPrivate: Xiph-laced identification, comment and setup headers.
    check(description[0] === 2);
    let p = 1;
    const lengths: number[] = [];
    for (let i = 0; i < 2; i++) {
      let length = 0, value: number;
      do { check(p < description.length); value = description[p++]; length += value; } while (value === 255);
      check(length > 0); lengths.push(length);
    }
    const headers: Uint8Array[] = [];
    for (const n of lengths) { check(p + n <= description.length); headers.push(description.subarray(p, p + n)); p += n; }
    headers.push(description.subarray(p));
    for (let i = 0; i < 3; i++) {
      check(headers[i].length >= 7 && headers[i][0] === [1, 3, 5][i] && String.fromCharCode(...headers[i].subarray(1, 7)) === "vorbis");
    }
    check(headers[0].length >= 30 && headers[0][11] > 0 && (headers[0][29] & 1) === 1);
  }
}
