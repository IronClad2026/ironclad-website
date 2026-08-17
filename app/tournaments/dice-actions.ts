"use server";

import { auth } from "@clerk/nextjs/server";
import {
  isRollMatchDiceInput,
  parseMatchDiceRollRpcResult,
  type MatchDiceRollActionResult,
  type RollMatchDiceInput,
} from "@/lib/match-dice";
import { createAuthenticatedSupabaseClient } from "@/lib/supabase-server";

const GENERIC_ROLL_ERROR =
  "Dice Roll-Off could not be completed. Refresh the Match and try again.";

export async function rollMatchDice(
  input: RollMatchDiceInput
): Promise<MatchDiceRollActionResult> {
  let userId: string | null;

  try {
    ({ userId } = await auth());
  } catch {
    console.error("Match dice authentication failed.");
    return { ok: false, error: "Your session could not be verified. Sign in again." };
  }

  if (!userId) {
    return { ok: false, error: "Sign in before using the Dice Roll-Off." };
  }

  if (!isRollMatchDiceInput(input)) {
    return { ok: false, error: "The Dice Roll-Off request is invalid." };
  }

  let supabase: Awaited<ReturnType<typeof createAuthenticatedSupabaseClient>>;

  try {
    supabase = await createAuthenticatedSupabaseClient();
  } catch {
    console.error("Match dice authenticated client creation failed.");
    return { ok: false, error: GENERIC_ROLL_ERROR };
  }

  let result: { data: unknown; error: unknown };

  try {
    result = await supabase.rpc("roll_match_dice", {
      p_match_id: input.matchId,
      p_expected_activation_version: input.expectedActivationVersion,
      p_game_number: input.gameNumber,
      p_expected_tie_round: input.expectedTieRound,
    });
  } catch {
    console.error("Match dice roll RPC failed unexpectedly.");
    return { ok: false, error: GENERIC_ROLL_ERROR };
  }

  if (result.error) {
    console.error("Match dice roll RPC rejected the request.");
    return { ok: false, error: GENERIC_ROLL_ERROR };
  }

  const parsed = parseMatchDiceRollRpcResult(result.data, input.matchId);
  if (!parsed) {
    console.error("Match dice roll RPC returned an invalid projection.");
    return { ok: false, error: GENERIC_ROLL_ERROR };
  }

  return { ok: true, data: parsed };
}
