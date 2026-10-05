"use server";

import type {
  CommandResult,
  CreateWarfrontCompanyInput,
  CreateWarfrontCompanyOutput,
} from "@/lib/warfront/contracts";
import { createWarfrontCompany } from "@/lib/warfront/commands/company";

export async function createWarfrontCompanyAction(
  input: CreateWarfrontCompanyInput
): Promise<CommandResult<CreateWarfrontCompanyOutput>> {
  return createWarfrontCompany(input);
}
