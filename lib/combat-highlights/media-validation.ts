import "server-only";
import { createHash } from "node:crypto";
import sharp from "sharp";
import { BufferSource, EncodedPacketSink, Input, MP4, WEBM } from "mediabunny";
import { createVideoInspector, validateAudioConfig } from "./codec-headers";
import { MediaValidationError, mediaAssert as check } from "./media-errors";
import { preflightMedia } from "./media-preflight";

export { MediaValidationError } from "./media-errors";
export const MAX_VIDEO_BYTES = 15_000_000;
export const MAX_POSTER_BYTES = 200_000;

export type VerifiedMedia = {
  codec: "avc" | "vp8" | "vp9";
  audioCodec: "aac" | "opus" | "vorbis" | null;
  durationMs: number;
  width: number;
  height: number;
  fps: number;
  byteLength: number;
  sha256: string;
};
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
function descriptionBytes(value: AllowSharedBufferSource | undefined): Uint8Array | undefined {
  if (!value) return undefined;
  if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  return new Uint8Array(value);
}

/**
 * Verifies the complete container timeline and supported codec headers. This is not an
 * entropy decoder: it cannot certify every compressed coefficient is decodable.
 * Metadata/table preflight runs before Mediabunny can expand attacker-controlled counts.
 */
export async function validateMedia(
  bytes: Uint8Array,
  supplied: { fileName: string; contentType: string },
): Promise<VerifiedMedia> {
  check(bytes instanceof Uint8Array && bytes.length > 0);
  check(bytes.length <= MAX_VIDEO_BYTES, "videoTooLarge");
  let input: Input | undefined;
  try {
    check(supplied && typeof supplied.fileName === "string" && supplied.fileName.length <= 255
      && typeof supplied.contentType === "string", "unsupportedVideo");
    const proof = preflightMedia(bytes);
    const extension = proof.container === "mp4" ? /\.mp4$/i : /\.webm$/i;
    const mime = proof.container === "mp4" ? "video/mp4" : "video/webm";
    check(extension.test(supplied.fileName) && supplied.contentType.toLowerCase() === mime, "unsupportedVideo");
    input = new Input({ source: new BufferSource(bytes), formats: [MP4, WEBM] });
    const actualFormat = await input.getFormat();
    check(actualFormat === (proof.container === "mp4" ? MP4 : WEBM), "unsupportedVideo");
    const tracks = await input.getTracks();
    check(tracks.length === proof.trackCount && tracks.length <= 2);
    const videos = tracks.filter(t => t.type === "video");
    const audios = tracks.filter(t => t.type === "audio");
    check(videos.length === 1 && videos.length + audios.length === tracks.length && audios.length <= 1, "unsupportedVideo");
    const video = await input.getPrimaryVideoTrack();
    check(video);
    const codec = await video.getCodec();
    check(codec === "avc" || codec === "vp8" || codec === "vp9", "unsupportedVideo");
    check(proof.container === "mp4" ? codec === "avc" : codec === "vp8" || codec === "vp9", "unsupportedVideo");
    const config = await video.getDecoderConfig();
    check(config);
    const inspector = createVideoInspector(codec, descriptionBytes(config.description));
    const width = await video.getDisplayWidth(), height = await video.getDisplayHeight();
    check(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0);
    check(width <= 1920 && height <= 1080, "videoResolution");
    const codedWidth = await video.getCodedWidth(), codedHeight = await video.getCodedHeight();
    let audioCodec: VerifiedMedia["audioCodec"] = null;
    const audio = await input.getPrimaryAudioTrack();
    if (audio) {
      const code = await audio.getCodec();
      check(proof.container === "mp4" ? code === "aac" : code === "opus" || code === "vorbis", "unsupportedVideo");
      check(code === "aac" || code === "opus" || code === "vorbis", "unsupportedVideo");
      audioCodec = code;
      const audioConfig = await audio.getDecoderConfig();
      check(audioConfig);
      validateAudioConfig(code, descriptionBytes(audioConfig.description));
    }
    const timestamps: number[] = [];
    let maximumEnd = 0, minimumStart = 0, videoEnd = 0, totalPackets = 0, packetBytes = 0;
    for (const track of tracks) {
      check(!(await track.isLive()), "unsupportedVideo");
      let count = 0;
      for await (const packet of new EncodedPacketSink(track).packets(undefined, undefined, { verifyKeyPackets: true })) {
        check(++totalPackets <= 20_000 && ++count <= (track.type === "video" ? 3600 : 20_000));
        check(Number.isFinite(packet.timestamp) && Number.isFinite(packet.duration) && packet.duration >= 0
          && packet.data.length > 0 && (packetBytes += packet.data.length) <= bytes.length);
        check(packet.timestamp >= -0.1 && packet.timestamp <= 15.001, "videoTooLong");
        minimumStart = Math.min(minimumStart, packet.timestamp);
        maximumEnd = Math.max(maximumEnd, packet.timestamp + packet.duration);
        if (track.type === "video") {
          if (count === 1) check(packet.type === "key");
          const frame = inspector.inspect(packet.data);
          check(frame.width === codedWidth && frame.height === codedHeight);
          if (frame.visible) {
            timestamps.push(packet.timestamp);
            check(timestamps.length <= 900, "videoFrameRate");
            videoEnd = Math.max(videoEnd, packet.timestamp + packet.duration);
          }
        }
      }
      check(count > 0);
    }
    const duration = Math.max(maximumEnd, await input.computeDuration()) - minimumStart;
    check(Number.isFinite(duration) && duration > 0);
    // One millisecond accommodates integer container clocks, not whole extra frames.
    check(duration <= 15.001, "videoTooLong");
    check(timestamps.length >= 2, "unsupportedVideo");
    timestamps.sort((a, b) => a - b);
    const resolution = await video.getTimeResolution();
    check(Number.isFinite(resolution) && resolution >= 1);
    const tick = Math.min(0.001, 1 / resolution) + 1e-9;
    for (let i = 1; i < timestamps.length; i++) {
      check(timestamps[i] > timestamps[i - 1]);
      // Bound both adjacent cadence and every trailing window up to one second.
      // This tolerates 16/17 ms WebM clocks without accepting sustained 61 fps.
      for (let n = 1; n <= Math.min(i, 60); n++) {
        check(timestamps[i] - timestamps[i - n] + tick >= n / 60, "videoFrameRate");
      }
    }
    const span = videoEnd - timestamps[0];
    check(Number.isFinite(span) && span > 0);
    const fps = Math.min(60, Math.round(timestamps.length / span * 1000) / 1000);
    check(fps > 0);
    return {
      codec, audioCodec, durationMs: Math.min(15_000, Math.ceil(duration * 1000)),
      width, height, fps, byteLength: bytes.length, sha256: hash(bytes),
    };
  } catch (error) {
    if (error instanceof MediaValidationError) throw error;
    throw new MediaValidationError("invalidVideo");
  } finally {
    input?.dispose();
  }
}

export async function validatePoster(bytes: Uint8Array): Promise<{ width: number; height: number; sha256: string }> {
  check(bytes instanceof Uint8Array && bytes.length > 0, "invalidPoster");
  check(bytes.length <= MAX_POSTER_BYTES, "posterTooLarge");
  check(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff
    && bytes[bytes.length - 1] === 0xd9, "invalidPoster");
  try {
    const decoder = sharp(bytes, { failOn: "warning", limitInputPixels: 1920 * 1080, sequentialRead: true });
    const meta = await decoder.metadata();
    check(meta.format === "jpeg" && (meta.pages ?? 1) === 1 && meta.width && meta.height, "invalidPoster");
    const { info } = await decoder.rotate().raw().toBuffer({ resolveWithObject: true });
    check(info.width > 0 && info.height > 0 && info.width <= 1920 && info.height <= 1080, "invalidPoster");
    return { width: info.width, height: info.height, sha256: hash(bytes) };
  } catch (error) {
    if (error instanceof MediaValidationError) throw error;
    throw new MediaValidationError("invalidPoster");
  }
}
