import { isReadyStagingEnabled } from "@/lib/ready/review-access";

export function isReadyWardrobePilotEnabled(environment = process.env) {
  return isReadyStagingEnabled(environment) && environment.READY_WARDROBE_PILOT_DISABLED !== "true";
}
