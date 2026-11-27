import { isReadyProductionEnabled, isReadyStagingEnabled } from "@/lib/ready/review-access";

export function isReadyWardrobePilotEnabled(environment: Readonly<Record<string, string | undefined>> = process.env) {
  if (environment.READY_WARDROBE_PILOT_DISABLED === "true") return false;
  return isReadyStagingEnabled(environment) ||
    (isReadyProductionEnabled(environment) && environment.READY_WARDROBE_PILOT_ENABLED === "true");
}
