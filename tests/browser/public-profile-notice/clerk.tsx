import type { ReactNode } from "react";

export function SignOutButton({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export async function auth() {
  return { userId: "user_browser_fixture" };
}
