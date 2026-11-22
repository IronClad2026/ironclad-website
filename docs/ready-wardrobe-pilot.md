# Ready Wardrobe pilot

Protected `staging` only. Open `/profile/ready` directly or select **Ready Wardrobe** from **Your profile**. The header uses stock Ready. The pilot does not create a purchase, registration, early-entry allowance or tournament discount.

## Access and files

- The sharp previews, GLBs and colour maps are in the private `ready-wardrobe-pilot` Storage bucket under `v1/`. The asset route streams only listed files. The separately rendered blurred WebPs are the only unauthenticated variants.
- A currently verified administrator with satisfied account requirements can equip any pilot item. The sandbox coverage table is time-bounded, read-only for the app and valid only for registered Staging synthetic fixtures with complete player accounts. The admin path has no coverage requirement.
- The application authorizes every selection read and save. Selection writes are tied to the current Clerk session and account. Expiry or revoked access restores stock Ready while retaining the recorded choice. A new signed-in session starts from its own selection.
- The catalogue uses the exact approved aviators and cigarette exports. The cigarette swaps the stock skull geometry for a compatible repaired mesh, mounts the palate and lower shelf to their existing controls, and retargets the single smoke emitter. Clown Makeup replaces the colour map independently on the skull and jaw. Removing either item restores the relevant stock state.

`scripts/ready/wardrobe-pilot-upload.mjs` checks the HDD volume, asset manifest digests, Staging Supabase and Clerk targets, and private bucket. It uploads only approved manifest entries and reads their hashes back. Browser captures and part exports belong on HDD 1T. The web page needs only the hosted files.

## Release checks and rollback

Replay the migrations and `tests/database/ready-wardrobe-pilot.sql` in disposable PostgreSQL before applying the additive pilot changes. The existing hosted Relic identity RPC is reconciled by receipt and function definition. It does not need reapplying. Preserve disabled transactional email and blocked Staging push claims.

To pause the pilot, set `READY_WARDROBE_PILOT_DISABLED=true` only for Vercel Preview branch `staging` and redeploy that branch. The profile link, pilot page and pilot asset endpoints close under the same guard. Stock Ready remains in the header. Keep the private objects and selections in place for a retry. Reverting the Staging code to the recorded baseline is also possible. Do not replay historical migrations or alter another environment.

## Commercial scope

Planned Supporter pricing remains US$1.99 monthly and US$13.88 annually. Sales and paid entry are outside this pilot. Marco decides first- and second-place awards separately for each named Pro season. Standings show competitive results without a fixed prize. Existing published terms and historical records are preserved. The planned 3 January 2027 tournament remains free with ordinary public registration.
