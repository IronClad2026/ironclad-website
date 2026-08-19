// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LocalePreferenceSync, {
  type SyncLocalePreferenceAction,
} from "@/components/i18n/LocalePreferenceSync";

afterEach(() => {
  cleanup();
});

describe("LocalePreferenceSync", () => {
  it("waits for sign-in, synchronizes once, and never changes rendered UI", async () => {
    const syncPreference = vi.fn<SyncLocalePreferenceAction>(async () => ({
      ok: true,
      status: "updated",
    }));
    const { container, rerender } = render(
      <LocalePreferenceSync
        isSignedIn={false}
        locale="pt-BR"
        syncPreference={syncPreference}
      />
    );

    expect(container).toBeEmptyDOMElement();
    expect(syncPreference).not.toHaveBeenCalled();

    rerender(
      <LocalePreferenceSync
        isSignedIn
        locale="pt-BR"
        syncPreference={syncPreference}
      />
    );

    await waitFor(() => expect(syncPreference).toHaveBeenCalledTimes(1));
    expect(container).toBeEmptyDOMElement();

    rerender(
      <LocalePreferenceSync
        isSignedIn
        locale="pt-BR"
        syncPreference={syncPreference}
      />
    );
    expect(syncPreference).toHaveBeenCalledTimes(1);
  });

  it("synchronizes again only when the validated UI locale changes", async () => {
    const syncPreference = vi.fn<SyncLocalePreferenceAction>(async () => ({
      ok: true,
      status: "already-matched",
    }));
    const { rerender } = render(
      <LocalePreferenceSync
        isSignedIn
        locale="fr"
        syncPreference={syncPreference}
      />
    );

    await waitFor(() => expect(syncPreference).toHaveBeenCalledTimes(1));
    rerender(
      <LocalePreferenceSync
        isSignedIn
        locale="ko"
        syncPreference={syncPreference}
      />
    );
    await waitFor(() => expect(syncPreference).toHaveBeenCalledTimes(2));
  });

  it("retries a failed synchronization after a later authenticated session", async () => {
    const syncPreference = vi.fn<SyncLocalePreferenceAction>(async () => ({
      ok: false,
      code: "SYNC_FAILED",
    }));
    const { rerender } = render(
      <LocalePreferenceSync
        isSignedIn
        locale="ru"
        syncPreference={syncPreference}
      />
    );

    await waitFor(() => expect(syncPreference).toHaveBeenCalledTimes(1));

    rerender(
      <LocalePreferenceSync
        isSignedIn={false}
        locale="ru"
        syncPreference={syncPreference}
      />
    );
    rerender(
      <LocalePreferenceSync
        isSignedIn
        locale="ru"
        syncPreference={syncPreference}
      />
    );

    await waitFor(() => expect(syncPreference).toHaveBeenCalledTimes(2));
  });
});
