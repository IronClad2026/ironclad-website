# Badge migration history

This file records the immutable Badge migration artifacts recovered from the
IronClad Staging migration ledger on 2026-08-31. The target was identity-gated
to Supabase project `zzbnneprhjicmajpjkdg`; the Production project
`nsyjtqpvyxlzyujlbzos` was explicitly rejected.

The ledger stores each applied migration as an ordered `text[]` of statements.
Each file below was reconstructed without changing a statement by joining that
array with `;\n\n` and appending the final semicolon. The ledger statement
count and MD5 identify the database record; the SHA-256 identifies the
canonical LF-normalized repository blob. Formatting differences from a
partner branch copy do not change the ledger statements.

| Version | Statements | Ledger MD5 | Reconstructed file SHA-256 |
| --- | ---: | --- | --- |
| `20260821000000` | 30 | `55e0fe3ba2733a04c874cdc9b92a2475` | `d18593d711a81b493187b3fdafa567d7b1efb3ead42ea206b75075ba9a569a9b` |
| `20260821001000` | 22 | `1e329dbc4ae57f74e82de29859753bf3` | `12a869272bec2849de24c590a745992ac31563fb1ef9108c46053ca036fc8df7` |
| `20260821002000` | 12 | `3b700101b45ef48e89d1ab1f2e55f54c` | `782a9832ee41eeb779841dfddf69d38fc8fbe79658d2b83f754a6917c8ad44f2` |
| `20260821003000` | 7 | `2bfdf2fd4d2c433b70712d97821a3a0b` | `392d26e423eb1535fe9101a45306d0d3a605bdc852d29004418c9e22848469d9` |
| `20260821004000` | 14 | `4f364ef93e664f95feaef7b047977dba` | `ed92fe0c07db541d429859e00a51eab64723181c8efd105e8538f5a570498c69` |
| `20260821005000` | 7 | `c7ced21ec689900bc01f9e9a97bfda36` | `6e44a55c5dcd7119069a81eb147a54667d4bbddff16465dd07465e80669da6b6` |
| `20260821006000` | 45 | `21be55dbd8d9f7a185b0463d74d5232d` | `8b0250755748add28e43bbb109e3ea5b6028683dd743a57ab563da0a5a7fc384` |
| `20260821007000` | 7 | `e66ce6cc4cc712aeb80e43e55f0a2f75` | `8973cb94f321e901b0c33618adb79a57962a5c52eb0a62fffed4c353572666d4` |
| `20260821008000` | 7 | `9fd7d36806c03deb026f6d93d42dc501` | `1cee8c3cccf75a99a94a9293beadfd566a258587dbebbdc0bfe3c340f0b59f16` |
| `20260821009000` | 60 | `d7e0dfe4ef61463e6f0f4c3d52603c67` | `3153306f2f46df2fb8627e7d14a96c2500048e623d575d3977cc7d224af13ff7` |
| `20260821010000` | 7 | `b8ab3d8d35a6f95289266db0ac36dcde` | `3acb4e21d1ccfe47da547142d03fce9689c6698437d59d1fbe896ee431979f5c` |
| `20260830090000` | 16 | `eb06fd30e572425e6c2b90d92925e1d1` | `8199bd3e9689200cde0b7a17da949ed2b55e53a53bb589649fc770949083bee5` |
| `20260831090000` | 3 | `e7fdc921cacbacedcb44aea7b736103b` | `481b73e50e44780761090e182d7cde0b188478f86526de42c55051c199cfc71a` |

The approved platform migration ceiling before this integration was
`20260831123000_tournament_media_links.sql`. Historical files listed above are
immutable. Corrections begin with new forward migration `20260831130000`.

The partner WIP migration `20260831100000_staging_badge_e2e_runs.sql` was not
present in the applied Staging ledger, is intentionally excluded, and must not
be applied by this integration.
