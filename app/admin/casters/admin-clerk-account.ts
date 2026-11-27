import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import { isCasterAccountId, type CasterAdminAccount } from "./admin-application-contracts";

type ClerkUsers = Awaited<ReturnType<typeof clerkClient>>["users"];
type ClerkUser = Awaited<ReturnType<ClerkUsers["getUser"]>>;

const searchLimit = 10;
const lookupTimeout = 4_000;

async function clerkLookup<T>(lookup: Promise<T>): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      lookup,
      new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), lookupTimeout); }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function projectClerkAccount(user: ClerkUser): CasterAdminAccount {
  const primary = user.emailAddresses.find((address) => address.id === user.primaryEmailAddressId);
  const name = [user.firstName, user.lastName].filter(Boolean).join(" ").trim();
  return {
    id: user.id,
    name: name || user.username || "IronClad account",
    email: primary?.emailAddress ?? null,
    verified: primary?.verification?.status === "verified",
    available: user.banned === false && user.locked === false,
  };
}

export async function loadCasterAdminAccount(accountId: string): Promise<CasterAdminAccount | null> {
  if (!isCasterAccountId(accountId)) return null;
  const user = await clerkLookup(clerkClient().then(({ users }) => users.getUser(accountId)));
  return user?.id === accountId ? projectClerkAccount(user) : null;
}

export async function searchCasterAdminAccounts(query: string, actor: string): Promise<CasterAdminAccount[] | null> {
  const result = await clerkLookup(clerkClient().then(({ users }) =>
    users.getUserList({ query, limit: searchLimit, offset: 0 }),
  ));
  if (!result) return null;

  const prefix = query.toLowerCase();
  return result.data.flatMap((user) => {
    if (!isCasterAccountId(user.id) || user.id === actor || user.banned || user.locked) return [];
    const account = projectClerkAccount(user);
    const matches = [account.id, account.email, account.name, user.firstName, user.lastName, user.username]
      .some((value) => value?.toLowerCase().startsWith(prefix));
    return account.available && matches ? [account] : [];
  });
}
