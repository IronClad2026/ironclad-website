# Tournament Bracket Data Model And Recovery

## Table Responsibilities

- `generated_brackets` identifies the generated competition structure for one
  tournament bracket. It stores format and slot count, but not player
  placement.
- `bracket_rounds` stores each round belonging to a generated bracket.
- `tournament_matches` is the public bracket source of truth. Match rows store
  slot numbers, assigned registration IDs, scores, winners, and match status.
- `registrations` stores a player's tournament entry, approval status, and
  selected tournament bracket.
- `players` stores the current player profile and display identity. A
  registration links to a player through `clerk_user_id`.

The public tournament page reads registration IDs from
`tournament_matches.player_one_registration_id` and
`player_two_registration_id`, then resolves names from approved registrations
and player profiles.

## Deleted Match Recovery

Deleting `tournament_matches` removes player-to-slot assignments because those
links are not duplicated in `generated_brackets` or `bracket_rounds`.
Registrations and player profiles remain recoverable, but the exact previous
slot order cannot be inferred unless a separate backup or audit record exists.

Apply
`supabase/migrations/20260612094000_repair_bracket_match_synchronization.sql` to add
the non-destructive `repair_generated_bracket_matches` function. It:

1. Preserves tournaments, tournament brackets, generated brackets, rounds,
   registrations, results, and existing matches.
2. Inserts only missing rounds and match records.
3. Makes assignment saves repair missing structure first.
4. Rejects assignment saves if any submitted slot has no backing match row.

After repair, assign approved participants again if their former match rows were
deleted. Saving Populate Tournament Bracket writes those registration IDs into
the recreated match slots and republishes them to the public bracket.
