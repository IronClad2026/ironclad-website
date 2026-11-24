# Ready Wardrobe pilot

Protected `staging` only. Select **Open wardrobe** on the dashboard or open `/profile/ready`. Both views share the saved outfit and access checks. After the first stock frame, the header and Ask Ready display the eligible player’s saved outfit. A successful save updates both without a page reload. The pilot grants wardrobe access only.

## Access and files

- The private `ready-wardrobe-pilot` bucket holds the original three items under `v1/` and the 17 additions under `v2/`. The asset route streams only listed files. The separately rendered blurred WebPs are the only unauthenticated variants.
- A currently verified administrator with satisfied account requirements can equip any pilot item. The sandbox coverage table is time-bounded, read-only for the app and valid only for registered Staging synthetic fixtures with complete player accounts. The admin path has no coverage requirement.
- The application authorizes every selection read and save. Selection writes are tied to the current Clerk session and account. Expiry or revoked access restores stock Ready while retaining the recorded choice. A new signed-in session starts from its own selection.
- The two replacement mouth props share the approved repaired bite. Tanker Beret and Australian Slouch Hat share the R5 head and crown liner. Open Cranium uses the matching R2 base. Helmet mounts and replacement mouth props are inactive with a replacement head. The full-face helmet also conceals the face, accessories, smoke and tears. Inactive choices stay in the outfit and return when compatible.
- Dynamite Set groups the existing band and stick. A single save records both pieces and the affected slots to restore when the set is removed. Other outfit choices remain available.
- The header and wardrobe viewer share a bounded in-memory cache of decoded assets within the current account session. They keep their own pose and effects. A permission check can reset both views to stock. The dashboard poster requires no wardrobe assets.

`scripts/ready/wardrobe-catalogue-upload.mjs` verifies the approved HDD manifest, Staging environment and private bucket. It uploads the 87 immutable catalogue files and checks their hashes after readback. Browser captures and part exports belong on HDD 1T. The web page needs only the hosted files.

## Release checks and rollback

Replay the migrations and `tests/database/ready-wardrobe-pilot.sql` in disposable PostgreSQL before applying the additive pilot changes. The existing hosted Relic identity RPC is reconciled by receipt and function definition. It does not need reapplying. Preserve disabled transactional email and blocked Staging push claims.

To pause the pilot, set `READY_WARDROBE_PILOT_DISABLED=true` only for Vercel Preview branch `staging` and redeploy that branch. The dashboard launcher, profile page and asset routes close under the same guard. Stock Ready remains available. Keep the private objects and saved choices. A code rollback to the three-item pilot reads its own subset of the saved outfit. The full selections remain recorded for a later reinstatement.

## Commercial scope

Planned Supporter pricing remains US$1.99 monthly and US$13.88 annually. Sales and paid entry are outside this pilot. Marco decides first- and second-place awards separately for each named Pro season. Standings show competitive results without a fixed prize. Existing published terms and historical records are preserved. The planned 3 January 2027 tournament remains free with ordinary public registration.
