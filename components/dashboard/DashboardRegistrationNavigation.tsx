"use client";

import { useEffect } from "react";
import { resolveDashboardRegistrationHref } from "@/components/dashboard/registration-navigation";

/** Keep previously sent registration links useful without rendering an archive. */
export default function DashboardRegistrationNavigation() {
  useEffect(() => {
    const navigate = () => {
      const href = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const destination = resolveDashboardRegistrationHref(href);
      if (destination.href !== href) {
        window.history.replaceState(window.history.state, "", destination.href);
      }
      destination.target?.scrollIntoView({ block: "start" });
    };
    const timer = window.setTimeout(navigate, 0);
    window.addEventListener("hashchange", navigate);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", navigate);
    };
  }, []);

  return null;
}
