// @vitest-environment jsdom

import { useRef, useState } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import LanguageSelector, {
  LanguageSelectorTrigger,
  type LanguageSelectorCopy,
  type SetLocalePreferenceAction,
} from "@/components/i18n/LanguageSelector";
import type { Locale } from "@/lib/i18n/config";

const COPY: LanguageSelectorCopy = {
  triggerAriaLabel: "Choose language. Current language: English.",
  languageRowLabel: "Language",
  title: "Choose your language",
  description: "Select the language used for the IronClad player experience.",
  closeLabel: "Close language selector",
  selectedLabel: "Selected",
  savingLabel: "Saving…",
  saveError: "The language preference could not be saved. Try again.",
  privacyHeading: "About your language preference",
  privacyCookie:
    "IronClad stores your explicit language choice in a first-party functional cookie for up to approximately one year.",
  privacyClerk:
    "If you are signed in, the selected locale may also be stored privately with Clerk so app-owned transactional emails can use it.",
  privacyNoTracking:
    "The preference is not used for advertising or cross-site tracking.",
  privacyNotEvidence:
    "It is not evidence of your location, legal jurisdiction, consent, or comprehension.",
  privacyChange:
    "You can change the preference at any time through this selector.",
  privacyPolicyLink: "Read the Effective Privacy Policy",
};

type HarnessProps = {
  locale?: Locale;
  languageBoundary?: string;
  setLocalePreference?: SetLocalePreferenceAction;
};

function Harness({
  locale = "en",
  languageBoundary,
  setLocalePreference = vi.fn(async (value: string) => ({
    ok: true as const,
    locale: value as Locale,
    metadataMirror: "not-signed-in" as const,
  })),
}: HarnessProps) {
  const [open, setOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  return (
    <>
      <LanguageSelectorTrigger
        currentLocale={locale}
        copy={COPY}
        open={open}
        variant="desktop"
        onOpen={(trigger) => {
          returnFocusRef.current = trigger;
          setOpen(true);
        }}
      />
      <LanguageSelector
        currentLocale={locale}
        copy={COPY}
        languageBoundary={languageBoundary}
        open={open}
        onOpenChange={setOpen}
        returnFocusRef={returnFocusRef}
        setLocalePreference={setLocalePreference}
      />
    </>
  );
}

afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
  window.history.replaceState({}, "", "/");
});

describe("LanguageSelector", () => {
  it("exposes a labelled dialog with seven native-language radio options", async () => {
    render(<Harness locale="zh-CN" />);

    const trigger = screen.getByRole("button", {
      name: COPY.triggerAriaLabel,
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");

    fireEvent.click(trigger);

    expect(
      screen.getByRole("dialog", { name: COPY.title })
    ).toBeInTheDocument();
    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(7);
    expect(screen.getByRole("radio", { name: /简体中文/ })).toHaveAttribute(
      "aria-checked",
      "true"
    );
    expect(screen.getByText("Português (Brasil)")).toHaveAttribute(
      "lang",
      "pt-BR"
    );

    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /简体中文/ })).toHaveFocus();
    });
  });

  it("shows the complete language-preference privacy disclosure", () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: COPY.triggerAriaLabel })
    );

    expect(screen.getByText(COPY.privacyCookie)).toBeVisible();
    expect(screen.getByText(COPY.privacyClerk)).toBeVisible();
    expect(screen.getByText(COPY.privacyNoTracking)).toBeVisible();
    expect(screen.getByText(COPY.privacyNotEvidence)).toBeVisible();
    expect(screen.getByText(COPY.privacyChange)).toBeVisible();
    expect(
      screen.getByRole("link", { name: COPY.privacyPolicyLink })
    ).toHaveAttribute("href", "/privacy");
  });

  it("marks portaled Admin selector copy as English", () => {
    render(<Harness locale="ru" languageBoundary="en" />);
    fireEvent.click(
      screen.getByRole("button", { name: COPY.triggerAriaLabel })
    );

    expect(screen.getByRole("dialog", { name: COPY.title })).toHaveAttribute(
      "lang",
      "en"
    );
  });

  it("saves a new allowlisted locale through the injected action", async () => {
    const setLocalePreference = vi.fn<SetLocalePreferenceAction>(
      async (locale) => ({
        ok: true,
        locale: locale as Locale,
        metadataMirror: "updated",
      })
    );
    render(<Harness setLocalePreference={setLocalePreference} />);
    fireEvent.click(
      screen.getByRole("button", { name: COPY.triggerAriaLabel })
    );

    fireEvent.click(screen.getByRole("radio", { name: /Français/ }));

    await waitFor(() => {
      expect(setLocalePreference).toHaveBeenCalledWith("fr");
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    });
  });

  it("does not replace the current path, query, or hash while the Server Action refreshes copy", async () => {
    window.history.replaceState(
      {},
      "",
      "/tournaments?tournament=cup&tab=brackets&match=match-7#evidence"
    );
    const before = window.location.href;

    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: COPY.triggerAriaLabel })
    );
    fireEvent.click(screen.getByRole("radio", { name: /Français/ }));

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.location.href).toBe(before);
  });

  it("keeps the panel open and reports a localized failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const setLocalePreference = vi.fn<SetLocalePreferenceAction>(async () => {
      throw new Error("Clerk unavailable");
    });
    render(<Harness setLocalePreference={setLocalePreference} />);
    fireEvent.click(
      screen.getByRole("button", { name: COPY.triggerAriaLabel })
    );

    fireEvent.click(screen.getByRole("radio", { name: /Русский/ }));

    expect(await screen.findByRole("alert")).toHaveTextContent(COPY.saveError);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("dismisses with Escape and restores focus to the opening control", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", {
      name: COPY.triggerAriaLabel,
    });
    fireEvent.click(trigger);

    await waitFor(() => expect(screen.getByRole("radio", { name: /English/ })).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("dismisses from the backdrop and traps reverse Tab at the dialog edge", async () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: COPY.triggerAriaLabel })
    );

    const closeButton = screen.getByRole("button", {
      name: COPY.closeLabel,
    });
    closeButton.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(
      screen.getByRole("link", { name: COPY.privacyPolicyLink })
    ).toHaveFocus();

    fireEvent.pointerDown(screen.getByTestId("language-selector-backdrop"), {
      pointerType: "touch",
    });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("renders the locked two-column smartphone and wider desktop grid contract", () => {
    render(<Harness />);
    fireEvent.click(
      screen.getByRole("button", { name: COPY.triggerAriaLabel })
    );

    const radiogroup = screen.getByRole("radiogroup", { name: COPY.title });
    expect(radiogroup).toHaveClass("grid-cols-1");
    expect(radiogroup).toHaveClass("min-[350px]:grid-cols-2");
    expect(radiogroup).toHaveClass("sm:grid-cols-3");
    expect(radiogroup).toHaveClass("lg:grid-cols-4");
  });
});
