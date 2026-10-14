// Exact approved public competition bindings; no player data or credentials.
export const LEGACY_PRO_CONTINUATION = Object.freeze({
  policy: "legacy-main-pro-event-one-v1",
  seasonId: "003db606-b891-4f4e-8893-a54dd4cd503c",
  tournamentId: "1cb06045-0ffc-4745-a8cd-1a16b71baffc",
  tournamentBracketId: "f34400e9-f7c8-43ac-90dc-6c70b438a04d",
});

const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const season = literal(LEGACY_PRO_CONTINUATION.seasonId);
const tournament = literal(LEGACY_PRO_CONTINUATION.tournamentId);
const main = literal(LEGACY_PRO_CONTINUATION.tournamentBracketId);
const hash = (query) => `encode(sha256(convert_to(coalesce((${query}),'[]'::jsonb)::text,'UTF8')),'hex')`;

/** Direct-table read-only proof. No application/lifecycle/settlement RPC. */
export function legacyProSourceCtes(phase) {
  const model = phase === "before-schema" ? "" : "and t.division_model_version='legacy_three_v1' and s.official_bracket_type='main'";
  return `legacy_pro_source_digests as (select
    ${hash(`select jsonb_agg(to_jsonb(p) order by p.id) from public.leaderboard_point_events p where p.tournament_id=${tournament}`)} as point_sha256,
    ${hash(`select jsonb_agg(to_jsonb(d) order by d.tournament_bracket_id) from public.leaderboard_division_settlements d join public.tournament_brackets b on b.id=d.tournament_bracket_id where b.tournament_id=${tournament}`)} as settlement_sha256,
    ${hash(`select jsonb_agg(to_jsonb(m) order by m.tournament_id) from public.leaderboard_tournament_season_memberships m where m.tournament_id=${tournament}`)} as membership_sha256
  ), recognized_legacy_pro_transition as (
    select s.id as season_id from public.leaderboard_seasons s
    join public.tournaments t on t.id=${tournament}::uuid
    join public.tournament_brackets main on main.id=${main}::uuid and main.tournament_id=t.id and main.name='Main'
    where s.id=${season}::uuid and s.year=2026 and s.season_number=1 and s.is_active and s.finalized_at is null and s.under_review_at is null
      and t.status='completed' and t.first_completed_at is not null ${model}
      and (select count(*) from public.leaderboard_seasons where is_active and finalized_at is null)=1
      and (select count(*) from public.leaderboard_tournament_season_memberships where season_id=s.id)=1
      and (select count(*) from public.leaderboard_tournament_season_memberships where tournament_id=t.id)=1
      and exists(select 1 from public.leaderboard_tournament_season_memberships m where m.tournament_id=t.id and m.season_id=s.id and m.qualifying_event_number=1 and m.scored_at is not null and m.voided_at is null)
      and not exists(select 1 from public.leaderboard_season_champions where season_id=s.id)
      and (select count(*) from public.tournament_brackets where tournament_id=t.id)=3
      and (select count(*) from public.tournament_brackets where tournament_id=t.id and name in ('Academy','Challenge','Main') and launched_at is not null)=3
      and (select count(*) from public.generated_brackets g join public.tournament_brackets b on b.id=g.tournament_bracket_id where b.tournament_id=t.id)=3
      and (select count(*) from public.generated_brackets where tournament_bracket_id=main.id)=1
      and (select count(*) from public.tournament_matches m join public.generated_brackets g on g.id=m.generated_bracket_id join public.tournament_brackets b on b.id=g.tournament_bracket_id where b.tournament_id=t.id)=21
      and not exists(select 1 from public.tournament_matches m join public.generated_brackets g on g.id=m.generated_bracket_id join public.tournament_brackets b on b.id=g.tournament_bracket_id where b.tournament_id=t.id and m.status is distinct from 'completed')
      and (select count(*) from public.tournament_matches m join public.generated_brackets g on g.id=m.generated_bracket_id where g.tournament_bracket_id=main.id)=7
      and (select count(*) from public.leaderboard_division_settlements d join public.tournament_brackets b on b.id=d.tournament_bracket_id where b.tournament_id=t.id)=3
      and not exists(select 1 from public.leaderboard_division_settlements d join public.tournament_brackets b on b.id=d.tournament_bracket_id where b.tournament_id=t.id and (d.season_id is distinct from s.id or d.settled_at is null or d.calculation_checksum is null))
      and (select count(*) from public.leaderboard_point_events where tournament_id=t.id)=45
      and not exists(select 1 from public.leaderboard_point_events where tournament_id=t.id and (season_id is distinct from s.id or source not in ('system','recalculation') or event_type not in ('participation','participation_withheld','round_passed','tournament_win') or (event_type='participation_withheld' and points<>0) or bracket_type not in ('academy','challenge','main')))
      and not exists(select 1 from public.leaderboard_point_events p left join public.registrations r on r.id=p.registration_id and r.profile_id=p.player_id and r.tournament_id=t.id left join public.tournament_brackets b on b.id=coalesce(p.tournament_bracket_id,r.tournament_bracket_id) and b.tournament_id=t.id where p.tournament_id=t.id and (r.id is null or b.id is null or p.bracket_type is distinct from case b.name when 'Academy' then 'academy' when 'Challenge' then 'challenge' when 'Main' then 'main' end))
      and (select count(*) from public.leaderboard_point_events where tournament_id=t.id and bracket_type='main')=15
      and (select count(*) from public.leaderboard_point_events p left join public.registrations r on r.id=p.registration_id and r.profile_id=p.player_id where p.tournament_id=t.id and p.bracket_type='main' and coalesce(p.tournament_bracket_id,r.tournament_bracket_id)=main.id)=15
      and (select sum(points) from public.leaderboard_point_events where tournament_id=t.id and bracket_type='main')=105
      and (select count(distinct player_id) from public.leaderboard_point_events where tournament_id=t.id and bracket_type='main')=8
  )`;
}

export function legacyProMarkerMismatchSql(phase) {
  if (phase === "before-schema") return "select case when to_regclass('ironclad_private.legacy_main_pro_season_transition') is null then 0 else 1 end";
  const activation = phase === "after-activation" ? "m.activated_at is not null and m.activated_at>=m.recorded_at and m.activated_at<=clock_timestamp()" : "m.activated_at is null";
  return `select case when (select count(*) from ironclad_private.legacy_main_pro_season_transition)=1 and exists(
    select 1 from ironclad_private.legacy_main_pro_season_transition m cross join legacy_pro_source_digests d
    where m.singleton is true and m.policy=${literal(LEGACY_PRO_CONTINUATION.policy)} and m.season_id=${season}::uuid and m.tournament_id=${tournament}::uuid and m.tournament_bracket_id=${main}::uuid
      and m.recorded_at is not null and m.recorded_at<=clock_timestamp() and ${activation}
      and m.source_point_sha256=d.point_sha256 and m.source_settlement_sha256=d.settlement_sha256 and m.source_membership_sha256=d.membership_sha256
  ) then 0 else 1 end`;
}

export function legacyProSnapshotSql(phase) {
  const marker = phase === "before-schema" ? "null::text" : hash("select jsonb_agg(to_jsonb(m)-'activated_at' order by m.singleton) from ironclad_private.legacy_main_pro_season_transition m");
  const activated = phase === "before-schema" ? "false" : "coalesce((select bool_or(activated_at is not null) from ironclad_private.legacy_main_pro_season_transition),false)";
  return `(select jsonb_build_object('sourcePointSha256',point_sha256,'sourceSettlementSha256',settlement_sha256,'sourceMembershipSha256',membership_sha256,'markerSha256',${marker},'activated',${activated}) from legacy_pro_source_digests)`;
}
