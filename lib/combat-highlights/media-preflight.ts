import "server-only";
import { mediaAssert as check } from "./media-errors";

const MAX_ENTRIES = 20_000;
const MAX_METADATA = 1_048_576;
type Box = { type: string; start: number; data: number; end: number };
type Track = {
  handler?: string;
  codec?: string;
  sizes?: number[];
  sampleSize?: number;
  sampleCount?: number;
  chunks?: number[];
  mapping?: { first: number; count: number }[];
};
export type ContainerProof = { container: "mp4" | "webm"; trackCount: number };

export function preflightMedia(bytes: Uint8Array): ContainerProof {
  check(bytes.length >= 16);
  if (ascii(bytes, 4, 4) === "ftyp") return mp4(bytes);
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return webm(bytes);
  check(false, "unsupportedVideo");
}
function ascii(b: Uint8Array, p: number, n: number) {
  return String.fromCharCode(...b.subarray(p, p + n));
}
function mp4(b: Uint8Array): ContainerProof {
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const tracks: Track[] = [];
  const media: { start: number; end: number }[] = [];
  let boxes = 0, expandedEntries = 0;
  let moovCount = 0;
  const u32 = (p: number) => { check(p >= 0 && p + 4 <= b.length); return v.getUint32(p); };
  const u64 = (p: number) => { check(p >= 0 && p + 8 <= b.length); const x = v.getBigUint64(p); check(x <= BigInt(Number.MAX_SAFE_INTEGER)); return Number(x); };
  function read(p: number, end: number): Box {
    check(++boxes <= 4096 && p + 8 <= end);
    const size = u32(p);
    const header = size === 1 ? 16 : 8;
    const length = size === 1 ? u64(p + 8) : size === 0 ? end - p : size;
    check(length >= header && p + length <= end);
    return { type: ascii(b, p + 4, 4), start: p, data: p + header, end: p + length };
  }
  function count(box: Box, stride: number, offset = 4) {
    check(box.data + offset + 4 <= box.end);
    const n = u32(box.data + offset);
    check(n <= MAX_ENTRIES && (expandedEntries += n) <= 60_000 && box.data + offset + 4 + n * stride <= box.end);
    return n;
  }
  function walk(start: number, end: number, depth: number, track?: Track) {
    check(depth <= 12);
    let p = start;
    while (p < end) {
      const box = read(p, end);
      const d = box.data;
      check(!["moof", "mvex", "cmov", "sinf", "pssh", "encv", "enca", "senc", "tenc"].includes(box.type), "unsupportedVideo");
      if (box.type === "mdat") {
        media.push({ start: d, end: box.end });
      } else if (box.type === "ftyp") {
        check(box.end - d >= 8 && box.end - d <= 1024 && (box.end - d) % 4 === 0);
        const brands = [ascii(b, d, 4)];
        for (let i = d + 8; i < box.end; i += 4) brands.push(ascii(b, i, 4));
        check(!brands.includes("qt  ") && brands.some(x => /^(isom|iso[2-9]|mp4[12]|avc1|M4V )$/.test(x)), "unsupportedVideo");
      } else if (box.type === "trak") {
        check(++tracks.length <= 2);
        const next: Track = {};
        tracks[tracks.length - 1] = next;
        walk(d, box.end, depth + 1, next);
      } else if (["moov", "mdia", "minf", "stbl", "edts", "dinf"].includes(box.type)) {
        check(box.end - d <= MAX_METADATA);
        if (box.type === "moov") check(++moovCount === 1);
        walk(d, box.end, depth + 1, track);
      } else if (box.type === "hdlr" && track) {
        check(d + 12 <= box.end && !track.handler);
        track.handler = ascii(b, d + 8, 4);
        check(["vide", "soun"].includes(track.handler), "unsupportedVideo");
      } else if (box.type === "dref") {
        check(d + 8 <= box.end && u32(d + 4) === 1);
        const ref = read(d + 8, box.end);
        check(ref.type === "url " && ref.end === box.end && ref.end - ref.data === 4 && u32(ref.data) === 1, "unsupportedVideo");
      } else if (box.type === "stsd" && track) {
        check(!track.codec && d + 8 <= box.end && u32(d + 4) === 1, "unsupportedVideo");
        const entry = read(d + 8, box.end);
        check(entry.end === box.end && entry.end - entry.data <= 65_536);
        track.codec = entry.type;
        check(["avc1", "avc3", "mp4a"].includes(entry.type), "unsupportedVideo");
        check(entry.data + 8 <= entry.end && v.getUint16(entry.data + 6) === 1, "unsupportedVideo");
        const header = entry.type === "mp4a" ? 28 : 78;
        check(entry.data + header <= entry.end);
        if (entry.type === "mp4a") check(v.getUint16(entry.data + 8) === 0, "unsupportedVideo");
        walk(entry.data + header, entry.end, depth + 1, track);
      } else if (box.type === "stsz" && track) {
        check(track.sampleCount === undefined && d + 12 <= box.end);
        const size = u32(d + 4), n = u32(d + 8);
        check(n > 0 && n <= MAX_ENTRIES && (expandedEntries += n) <= 60_000 && (size !== 0 || d + 12 + n * 4 === box.end));
        track.sampleCount = n;
        track.sampleSize = size;
        if (!size) track.sizes = Array.from({ length: n }, (_, i) => { const s = u32(d + 12 + i * 4); check(s > 0); return s; });
      } else if (box.type === "stz2") {
        check(false, "unsupportedVideo");
      } else if (["stco", "co64"].includes(box.type) && track) {
        check(!track.chunks);
        const stride = box.type === "stco" ? 4 : 8;
        const n = count(box, stride);
        track.chunks = Array.from({ length: n }, (_, i) => stride === 4 ? u32(d + 8 + i * stride) : u64(d + 8 + i * stride));
      } else if (box.type === "stsc" && track) {
        check(!track.mapping);
        const n = count(box, 12);
        track.mapping = Array.from({ length: n }, (_, i) => {
          const p = d + 8 + i * 12, first = u32(p), amount = u32(p + 4);
          check(first > 0 && amount > 0 && amount <= MAX_ENTRIES && u32(p + 8) === 1);
          return { first, count: amount };
        });
      } else if (["stts", "ctts"].includes(box.type)) {
        const n = count(box, 8);
        let total = 0;
        for (let i = 0; i < n; i++) {
          const amount = u32(d + 8 + i * 8);
          check(amount > 0 && (total += amount) <= MAX_ENTRIES && (expandedEntries += amount) <= 60_000);
          if (box.type === "stts") check(u32(d + 12 + i * 8) > 0);
        }
      } else if (box.type === "stss") {
        count(box, 4);
      } else if (box.type === "elst") {
        check(d + 8 <= box.end);
        // Multiple edits may hide samples or create loops; require a standard single media edit.
        const version = b[d];
        check(version === 0 || version === 1);
        check(u32(d + 4) <= 1, "unsupportedVideo");
        count(box, version === 1 ? 20 : 12);
        if (u32(d + 4)) {
          const rate = d + (version === 1 ? 24 : 16);
          check(rate + 4 <= box.end && u32(rate) === 0x00010000, "unsupportedVideo");
        }
      } else if (!["free", "skip", "wide"].includes(box.type)) {
        check(box.end - d <= MAX_METADATA);
      }
      p = box.end;
    }
    check(p === end);
  }
  walk(0, b.length, 0);
  check(moovCount === 1 && tracks.length >= 1 && media.length > 0);
  check(tracks.filter(t => t.handler === "vide").length === 1);
  check(tracks.every(t => t.handler && t.codec && (t.handler === "vide" ? t.codec !== "mp4a" : t.codec === "mp4a")));
  const ranges: { start: number; end: number }[] = [];
  for (const t of tracks) {
    check(t.sampleCount && t.chunks?.length && t.mapping?.length && t.mapping[0].first === 1);
    for (let i = 1; i < t.mapping.length; i++) check(t.mapping[i].first > t.mapping[i - 1].first);
    let sample = 0, m = 0;
    for (let i = 0; i < t.chunks.length; i++) {
      while (m + 1 < t.mapping.length && t.mapping[m + 1].first <= i + 1) m++;
      const n = t.mapping[m].count;
      check(sample + n <= t.sampleCount);
      let length = 0;
      for (let j = 0; j < n; j++) length += t.sampleSize || t.sizes![sample + j];
      sample += n;
      const offset = t.chunks[i];
      check(length > 0 && media.some(r => offset >= r.start && offset + length <= r.end));
      ranges.push({ start: offset, end: offset + length });
    }
    check(sample === t.sampleCount);
  }
  // Alias chunks could otherwise cause a small file to be parsed repeatedly as gigabytes of packets.
  ranges.sort((a, b) => a.start - b.start);
  for (let i = 1; i < ranges.length; i++) check(ranges[i].start >= ranges[i - 1].end);
  return { container: "mp4", trackCount: tracks.length };
}
function webm(b: Uint8Array): ContainerProof {
  const masters = new Set([0x1a45dfa3, 0x18538067, 0x1549a966, 0x1654ae6b, 0xae, 0xe0, 0xe1, 0x1f43b675, 0xa0, 0x1c53bb6b, 0xbb, 0xb7, 0x114d9b74, 0x4dbb, 0x1254c367, 0x7373, 0x63c0, 0x67c8, 0x55b0]);
  const levelOne = new Set([0x1549a966, 0x1654ae6b, 0x1f43b675, 0x1c53bb6b, 0x114d9b74, 0x1254c367]);
  type WebTrack = { type?: number; codec?: string; number?: number };
  const tracks: WebTrack[] = [];
  let elements = 0, blocks = 0, packets = 0, segments = 0, docType = "";
  function vint(p: number, strip: boolean) {
    check(p < b.length && b[p] !== 0);
    let length = 1, marker = 0x80;
    while (!(b[p] & marker)) { marker >>= 1; length++; }
    check(length <= (strip ? 8 : 4) && p + length <= b.length);
    let value = BigInt(strip ? b[p] & (marker - 1) : b[p]);
    for (let i = 1; i < length; i++) value = value * BigInt(256) + BigInt(b[p + i]);
    const unknown = strip && value === (BigInt(1) << BigInt(7 * length)) - BigInt(1);
    check(unknown || value <= BigInt(Number.MAX_SAFE_INTEGER));
    return { value: Number(value), length, unknown };
  }
  function number(p: number, end: number) {
    check(end > p && end - p <= 8);
    let n = 0;
    while (p < end) n = n * 256 + b[p++];
    check(Number.isSafeInteger(n));
    return n;
  }
  function walk(start: number, end: number, depth: number, track?: WebTrack, unknownCluster = false): number {
    check(depth <= 12);
    let p = start;
    while (p < end) {
      check(++elements <= 30_000);
      const id = vint(p, false);
      if (unknownCluster && levelOne.has(id.value)) return p;
      const size = vint(p + id.length, true);
      const d = p + id.length + size.length;
      const last = size.unknown ? end : d + size.value;
      check(last <= end && last >= d);
      check(!size.unknown || id.value === 0x18538067 || id.value === 0x1f43b675);
      check(![0x6d80, 0xa4, 0x1941a469, 0x1b538667, 0x23314f].includes(id.value), "unsupportedVideo");
      if (id.value === 0x18538067) check(++segments === 1);
      if (id.value === 0x4282) { check(last - d <= 32); docType = ascii(b, d, last - d); }
      if (id.value === 0xae) {
        check(tracks.length < 2);
        const t: WebTrack = {};
        tracks.push(t);
        walk(d, last, depth + 1, t);
      } else if (id.value === 0x83 && track) {
        check(track.type === undefined);
        track.type = number(d, last);
        check(track.type === 1 || track.type === 2, "unsupportedVideo");
      } else if (id.value === 0xd7 && track) {
        check(track.number === undefined);
        track.number = number(d, last);
        check(track.number > 0 && track.number <= 126);
      } else if (id.value === 0x86 && track) {
        check(!track.codec && last - d <= 32);
        track.codec = ascii(b, d, last - d);
        check(["V_VP8", "V_VP9", "A_OPUS", "A_VORBIS"].includes(track.codec), "unsupportedVideo");
      } else if (id.value === 0xa3 || id.value === 0xa1) {
        check(++blocks <= MAX_ENTRIES);
        const trackNumber = vint(d, true);
        check(d + trackNumber.length + 3 < last);
        const target = tracks.find(t => t.number === trackNumber.value);
        check(target);
        const flags = b[d + trackNumber.length + 2];
        // Video lacing combines distinct display frames without independent timing.
        check(target.type !== 1 || (flags & 6) === 0, "unsupportedVideo");
        const lacing = (flags & 6) >> 1;
        let cursor = d + trackNumber.length + 3;
        const frames = lacing ? b[cursor++] + 1 : 1;
        check((packets += frames) <= MAX_ENTRIES && cursor < last);
        if (lacing === 2) check((last - cursor) % frames === 0);
        if (lacing === 1 || lacing === 3) {
          let consumed = 0, previous = 0;
          for (let i = 0; i < frames - 1; i++) {
            let length = 0;
            if (lacing === 1) {
              let value: number;
              do { check(cursor < last); value = b[cursor++]; length += value; } while (value === 255);
            } else {
              const value = vint(cursor, true);
              check(!value.unknown && cursor + value.length <= last);
              cursor += value.length;
              length = i === 0 ? value.value : previous + value.value - (2 ** (7 * value.length - 1) - 1);
            }
            check(length > 0 && Number.isSafeInteger(length));
            previous = length;
            consumed += length;
            check(cursor + consumed < last);
          }
          check(last - cursor - consumed > 0);
        }
      } else if (masters.has(id.value)) {
        if (![0x18538067, 0x1f43b675].includes(id.value)) check(last - d <= MAX_METADATA);
        const stop = walk(d, last, depth + 1, track, size.unknown && id.value === 0x1f43b675);
        if (size.unknown && id.value === 0x1f43b675) { p = stop; continue; }
      } else {
        check(last - d <= MAX_METADATA);
      }
      p = last;
    }
    return p;
  }
  walk(0, b.length, 0);
  check(docType === "webm", "unsupportedVideo");
  check(segments === 1 && blocks > 0 && tracks.filter(t => t.type === 1).length === 1);
  check(new Set(tracks.map(t => t.number)).size === tracks.length);
  check(tracks.every(t => t.number && t.type && t.codec && (t.type === 1 ? t.codec.startsWith("V_") : t.codec.startsWith("A_"))));
  return { container: "webm", trackCount: tracks.length };
}
