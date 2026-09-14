import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { BufferSource, BufferTarget, EncodedPacketSink, EncodedVideoPacketSource, Input, MP4, Mp4OutputFormat, Output } from "mediabunny";
import { describe, expect, it } from "vitest";
import {
  MAX_POSTER_BYTES, MAX_VIDEO_BYTES, MediaValidationError, validateMedia, validatePoster,
} from "@/lib/combat-highlights/media-validation";

const folder = resolve("tests/fixtures/combat-highlights");
const fixture = (name: string) => new Uint8Array(readFileSync(resolve(folder, name)));
const supplied = (fileName: string) => ({ fileName, contentType: fileName.endsWith(".mp4") ? "video/mp4" : "video/webm" });
function changed(bytes: Uint8Array, marker: string, offset: number, value: number, size: 2 | 4 = 4) {
  const copy = bytes.slice();
  const at = marker === "avc1" ? Buffer.from(copy).lastIndexOf(marker) : Buffer.from(copy).indexOf(marker);
  expect(at).toBeGreaterThan(0);
  const view = new DataView(copy.buffer);
  if (size === 2) view.setUint16(at + offset, value); else view.setUint32(at + offset, value);
  return copy;
}
// Re-mux an original browser-encoded keyframe; no encoder/transcoder is used here.
async function timedAvc(durations: number[], duplicatePictures = false) {
  const input = new Input({ source: new BufferSource(fixture("synthetic-avc-silent.mp4")), formats: [MP4] });
  try {
    const track = (await input.getPrimaryVideoTrack())!;
    const decoderConfig = (await track.getDecoderConfig())!;
    const packet = (await new EncodedPacketSink(track).getFirstPacket())!;
    const target = new BufferTarget();
    const output = new Output({ target, format: new Mp4OutputFormat({ fastStart: "in-memory" }) });
    const source = new EncodedVideoPacketSource("avc");
    output.addVideoTrack(source);
    await output.start();
    let timestamp = 0;
    for (const duration of durations) {
      await source.add(packet.clone({ timestamp, duration, data: duplicatePictures ? Buffer.concat([packet.data, packet.data]) : packet.data }), { decoderConfig });
      timestamp += duration;
    }
    await output.finalize();
    return new Uint8Array(target.buffer!);
  } finally { input.dispose(); }
}
describe("real media verification", () => {
  it.each([
    ["bear-1280x720.mp4", "avc", "aac", 1280, 720],
    ["bear-320x240.webm", "vp8", "vorbis", 320, 240],
    ["bear-vp9-opus.webm", "vp9", "opus", 320, 240],
  ] as const)("verifies independent Chromium fixture %s", async (name, codec, audioCodec, width, height) => {
    const result = await validateMedia(fixture(name), supplied(name));
    expect(result).toMatchObject({ codec, audioCodec, width, height });
    expect(result.durationMs).toBeGreaterThan(2500);
    expect(result.durationMs).toBeLessThan(3000);
    expect(result.fps).toBeGreaterThan(20);
    expect(result.fps).toBeLessThanOrEqual(60);
  });
  it("accepts the exact 15 second boundary after scanning every sample", async () => {
    const bytes = await timedAvc(Array.from({ length: 450 }, () => 1 / 30));
    expect(await validateMedia(bytes, supplied("clip.mp4"))).toMatchObject({ durationMs: 15000, fps: 30 });
  });
  it("rejects a timeline beyond the one millisecond clock tolerance", async () => {
    const bytes = await timedAvc([...Array.from({ length: 449 }, () => 1 / 30), 1 / 30 + 0.002]);
    await expect(validateMedia(bytes, supplied("clip.mp4"))).rejects.toMatchObject({ code: "videoTooLong" });
  });
  it("detects high frame rate after sample 300 even when the whole-clip average is below 60", async () => {
    const bytes = await timedAvc([...Array.from({ length: 300 }, () => 1 / 30), ...Array.from({ length: 30 }, () => 1 / 120)]);
    await expect(validateMedia(bytes, supplied("clip.mp4"))).rejects.toMatchObject({ code: "videoFrameRate" });
  });
  it.each([
    ["synthetic-avc-silent.mp4", "avc", null, 320, 180, 60],
    ["synthetic-vp8-opus.webm", "vp8", "opus", 320, 180, 30],
    ["synthetic-vp9-opus.webm", "vp9", "opus", 320, 180, 30],
    ["synthetic-vp9-silent.webm", "vp9", null, 320, 180, 60],
    ["synthetic-avc-1080p.mp4", "avc", null, 1920, 1080, 30],
  ] as const)("verifies real encoded %s", async (name, codec, audioCodec, width, height, fps) => {
    const bytes = fixture(name);
    const result = await validateMedia(bytes, supplied(name));
    expect(result).toMatchObject({ codec, audioCodec, width, height, byteLength: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex") });
    expect(result.fps).toBeCloseTo(fps, 0);
    expect(result.durationMs).toBeGreaterThan(0);
    expect(result.durationMs).toBeLessThanOrEqual(1100);
  });
  it("rejects multiple AVC pictures concealed inside one timestamped sample", async () => {
    await expect(validateMedia(await timedAvc([1 / 30, 1 / 30], true), supplied("clip.mp4")))
      .rejects.toMatchObject({ code: "unsupportedVideo" });
  });
  it.each(["moof", "pssh"])("rejects declared unsupported fragmentation/encryption box %s", async type => {
    const box = Buffer.alloc(8); box.writeUInt32BE(8, 0); box.write(type, 4);
    await expect(validateMedia(Buffer.concat([fixture("synthetic-avc-silent.mp4"), box]), supplied("clip.mp4")))
      .rejects.toMatchObject({ code: "unsupportedVideo" });
  });
  it("rejects a non-audio/video track and an unsupported codec entry", async () => {
    const textTrack = changed(fixture("synthetic-avc-silent.mp4"), "hdlr", 12, 0x74657874);
    const hevc = changed(fixture("synthetic-avc-silent.mp4"), "avc1", 0, 0x68766331);
    for (const bytes of [textTrack, hevc]) {
      await expect(validateMedia(bytes, supplied("clip.mp4"))).rejects.toMatchObject({ code: "unsupportedVideo" });
    }
  });
  it("rejects overlapping chunk ranges before they can amplify the verification read", async () => {
    const bytes = fixture("synthetic-avc-silent.mp4");
    const position = Buffer.from(bytes).indexOf("stco");
    const firstOffset = new DataView(bytes.buffer).getUint32(position + 12);
    await expect(validateMedia(changed(bytes, "stco", 16, firstOffset), supplied("clip.mp4")))
      .rejects.toMatchObject({ code: "invalidVideo" });
  });
  it("does not accept WebM codec labels in place of actual codec headers", async () => {
    const bytes = fixture("synthetic-vp9-opus.webm");
    const position = Buffer.from(bytes).indexOf("V_VP9");
    bytes[position + 4] = "8".charCodeAt(0);
    await expect(validateMedia(bytes, supplied("clip.webm"))).rejects.toBeInstanceOf(MediaValidationError);
  });
  it("rejects real encoded content above the resolution cap", async () => {
    await expect(validateMedia(fixture("synthetic-avc-oversize.mp4"), supplied("clip.mp4")))
      .rejects.toMatchObject({ code: "videoResolution" });
  });
  it("rejects an actual oversize SPS even after forged container dimensions", async () => {
    const bytes = changed(fixture("synthetic-avc-oversize.mp4"), "avc1", 28, 320, 2);
    await expect(validateMedia(bytes, supplied("clip.mp4"))).rejects.toBeInstanceOf(MediaValidationError);
  });
  it("rejects dimensions that disagree with the actual AVC sequence header", async () => {
    const bytes = changed(fixture("synthetic-avc-silent.mp4"), "avc1", 28, 300, 2);
    await expect(validateMedia(bytes, supplied("clip.mp4"))).rejects.toMatchObject({ code: "invalidVideo" });
  });
  it("rejects forged movie duration when the sample timeline exceeds 15 seconds", async () => {
    const bytes = fixture("synthetic-avc-silent.mp4");
    const at = Buffer.from(bytes).indexOf("mdhd");
    const old = new DataView(bytes.buffer).getUint32(at + 16);
    const slower = changed(bytes, "mdhd", 16, Math.max(1, Math.floor(old / 16)));
    await expect(validateMedia(slower, supplied("clip.mp4"))).rejects.toMatchObject({ code: "videoTooLong" });
  });
  it("rejects sustained 61 fps from sample timing even when the header claims 60", async () => {
    const bytes = fixture("synthetic-avc-silent.mp4");
    const at = Buffer.from(bytes).indexOf("mdhd");
    const old = new DataView(bytes.buffer).getUint32(at + 16);
    const faster = changed(bytes, "mdhd", 16, Math.ceil(old * 61 / 60));
    await expect(validateMedia(faster, supplied("clip.mp4"))).rejects.toMatchObject({ code: "videoFrameRate" });
  });
  it("fails before demuxing a sample count expansion bomb", async () => {
    const bytes = changed(fixture("synthetic-avc-silent.mp4"), "stsz", 12, 0xffffffff);
    await expect(validateMedia(bytes, supplied("clip.mp4"))).rejects.toMatchObject({ code: "invalidVideo" });
  });
  it("rejects external media references", async () => {
    const bytes = changed(fixture("synthetic-avc-silent.mp4"), "url ", 4, 0);
    await expect(validateMedia(bytes, supplied("clip.mp4"))).rejects.toMatchObject({ code: "unsupportedVideo" });
  });
  it("rejects declared media offsets outside mdat", async () => {
    const bytes = changed(fixture("synthetic-avc-silent.mp4"), "stco", 12, 4);
    await expect(validateMedia(bytes, supplied("clip.mp4"))).rejects.toMatchObject({ code: "invalidVideo" });
  });
  it.each(["text/html", "video/webm", "video/mp4; codecs=avc1"])("rejects misleading content type %s", async contentType => {
    await expect(validateMedia(fixture("synthetic-avc-silent.mp4"), { fileName: "clip.mp4", contentType }))
      .rejects.toMatchObject({ code: "unsupportedVideo" });
  });
  it("rejects renamed containers and nonmedia payloads", async () => {
    await expect(validateMedia(fixture("synthetic-vp8-opus.webm"), supplied("clip.mp4")))
      .rejects.toMatchObject({ code: "unsupportedVideo" });
    await expect(validateMedia(new TextEncoder().encode("<html>not a video file</html>"), supplied("clip.mp4")))
      .rejects.toMatchObject({ code: "unsupportedVideo" });
  });
  it("rejects oversized uploads without parsing", async () => {
    await expect(validateMedia(new Uint8Array(MAX_VIDEO_BYTES + 1), supplied("clip.mp4")))
      .rejects.toMatchObject({ code: "videoTooLarge" });
  });
  it("accepts the exact byte limit without trusting the supplied length", async () => {
    const bytes = fixture("synthetic-avc-silent.mp4");
    const padded = new Uint8Array(MAX_VIDEO_BYTES);
    padded.set(bytes);
    new DataView(padded.buffer).setUint32(bytes.length, MAX_VIDEO_BYTES - bytes.length);
    padded.set(new TextEncoder().encode("free"), bytes.length + 4);
    expect((await validateMedia(padded, supplied("clip.mp4"))).byteLength).toBe(MAX_VIDEO_BYTES);
  });
  it.each(["synthetic-avc-silent.mp4", "synthetic-vp8-opus.webm", "synthetic-vp9-opus.webm"])("rejects truncated %s", async name => {
    const bytes = fixture(name);
    await expect(validateMedia(bytes.subarray(0, bytes.length - 37), supplied(name))).rejects.toBeInstanceOf(MediaValidationError);
  });
});
describe("actual JPEG poster verification", () => {
  it("fully decodes a JPEG and returns actual dimensions and digest", async () => {
    const bytes = await sharp({ create: { width: 320, height: 180, channels: 3, background: "#eb6b17" } }).jpeg().toBuffer();
    expect(await validatePoster(bytes)).toEqual({ width: 320, height: 180, sha256: createHash("sha256").update(bytes).digest("hex") });
  });
  it("rejects PNG renamed as JPEG", async () => {
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "black" } }).png().toBuffer();
    await expect(validatePoster(bytes)).rejects.toMatchObject({ code: "invalidPoster" });
  });
  it("rejects JPEG signature spoofing and truncation", async () => {
    await expect(validatePoster(new Uint8Array([255, 216, 0, 255, 217]))).rejects.toMatchObject({ code: "invalidPoster" });
    const bytes = await sharp({ create: { width: 32, height: 32, channels: 3, background: "black" } }).jpeg().toBuffer();
    await expect(validatePoster(bytes.subarray(0, bytes.length - 8))).rejects.toMatchObject({ code: "invalidPoster" });
  });
  it("rejects excessive poster bytes before decoding", async () => {
    await expect(validatePoster(new Uint8Array(MAX_POSTER_BYTES + 1))).rejects.toMatchObject({ code: "posterTooLarge" });
  });
  it("rejects decoded poster dimensions above the cap", async () => {
    const bytes = await sharp({ create: { width: 1921, height: 1080, channels: 3, background: "black" } }).jpeg().toBuffer();
    await expect(validatePoster(bytes)).rejects.toMatchObject({ code: "invalidPoster" });
  });
});
