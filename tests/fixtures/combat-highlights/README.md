# Synthetic local media fixtures

These files contain generated colored rectangles and a sine wave only. They do not contain Production or Staging application data, people, identities or event history. `provenance.json` records generation and content hashes; `generate.mjs` is the offline/local generation source.

The candidate intentionally excludes external Chromium sample videos. Media tests check bounded container timelines, codec headers, sample tables and decoded posters. They do not certify complete entropy decoding of every compressed video coefficient or provider delivery.
