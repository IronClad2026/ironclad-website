# Combat Highlights media fixtures

The `synthetic-*` files contain original colored rectangles and, where present,
a generated 440 Hz sine wave. They are dedicated to the public domain under
[CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). `provenance.json`
records the browser, encoder, muxer, dimensions, frame rate, byte length and SHA-256
of each file. `generate.mjs` reproduces these fixtures using the installed Chrome
WebCodecs encoder, the pinned Mediabunny muxer and an ephemeral loopback-only page.
It does not use FFmpeg, NodeAV, a server-side encoder or downloaded source footage.
Run it manually from the repository with `node tests/fixtures/combat-highlights/generate.mjs`;
regeneration is not part of the test suite and byte output may vary by browser.
Native AAC encoding was unavailable in the generation browser; no generated AAC
fixture is claimed.

The three `bear-*` files are independent Chromium media-test fixtures copied
without modification from the commit pinned in `chromium-provenance.json`.
That manifest records each public source URL, exact byte length and SHA-256.
The Chromium repository's BSD-style notice is preserved in `LICENSE.chromium`.
Its upstream test-data README documents the AVC/AAC, VP8/Vorbis and VP9/Opus
variants. We did not execute the upstream encoding commands.

The unit test also re-muxes an already encoded synthetic AVC keyframe to exercise
15-second boundaries and a late variable-frame-rate burst. No decoding, encoding
or transcoding is performed by that helper. Mutated in-memory copies test forged
metadata, conflicting codec headers, truncated files, invalid offsets, duplicate
chunk ranges, excessive table counts, unsupported tracks and encryption/fragment
markers. The checked-in source fixtures remain unmodified.

## Verification contract and limits

The server reads at most 15,000,000 video bytes once, then performs bounded container
preflight, complete encoded-packet iteration, codec configuration/frame-header
checks, actual frame dimensions and the whole presentation timeline. A maximum
1 ms container-clock tolerance accommodates rounded WebM timestamps; sustained
61 fps and extra whole frames are rejected. Width must be at most 1920 and height
at most 1080. Normal AVC coded padding of 1088 rows cropped to 1080 is supported;
a larger decode surface concealed by cropping is rejected. Optional audio must
be AAC in MP4 or Opus/Vorbis in WebM. Packet byte totals cannot exceed the input.

The supported subset intentionally excludes fragmented/QuickTime MP4, compressed
MP4 metadata, external references, encryption, additional/nonmedia tracks, multiple
sample descriptions, complex edit lists, interlaced AVC, multiple pictures per AVC
sample, video lacing, codec/dimension changes and unsupported VP9 render scaling.
These receive a safe retry/export error rather than a partial validation result.
At least two displayed video frames are required. The parser runs in the Next.js
Node server, not under the Worker's streaming upload CPU budget.

This is **not an entropy decoder**. Checking container structure and supported codec
headers does not prove that every compressed video coefficient or raw audio payload
will decode successfully in every browser. The verifier does not claim full decode
validation or perceptual/content moderation. JPEG posters, unlike video, are fully
decoded with Sharp under the 200,000-byte and 1920-by-1080 pixel limits. No runtime
fixture requires network access, a database, private media or external credentials.
