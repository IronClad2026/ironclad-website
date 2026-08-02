"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import {
  CheckCircle2,
  Download,
  Ellipsis,
  MoreVertical,
  PlusSquare,
  Share,
  SquarePlus,
  X,
} from "lucide-react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
};

type NavigatorWithStandalone = Navigator & {
  standalone?: boolean;
};

type InstallAppPromptProps = {
  onOpenChange?: (open: boolean) => void;
};

function subscribeToDisplayMode(callback: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const mediaQuery = window.matchMedia("(display-mode: standalone)");
  mediaQuery.addEventListener("change", callback);

  return () => {
    mediaQuery.removeEventListener("change", callback);
  };
}

function getDisplayModeSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  const navigatorWithStandalone = navigator as NavigatorWithStandalone;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    navigatorWithStandalone.standalone === true
  );
}

function getDisplayModeServerSnapshot() {
  return false;
}

function detectIosDevice() {
  if (typeof navigator === "undefined") {
    return false;
  }

  return (
    /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export default function InstallAppPrompt({
  onOpenChange,
}: InstallAppPromptProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);

  const isInstalled = useSyncExternalStore(
    subscribeToDisplayMode,
    getDisplayModeSnapshot,
    getDisplayModeServerSnapshot
  );

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  const openDialog = useCallback(() => {
    setIsIos(detectIosDevice());
    setIsOpen(true);
    onOpenChange?.(true);
  }, [onOpenChange]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const handleAppInstalled = () => {
      setInstallPrompt(null);
      closeDialog();
    };

    window.addEventListener(
      "beforeinstallprompt",
      handleBeforeInstallPrompt
    );
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, [closeDialog]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeDialog();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeDialog, isOpen]);

  const installApp = async () => {
    if (!installPrompt) {
      return;
    }

    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;

      setInstallPrompt(null);
      closeDialog();
    } catch (error) {
      console.error("IronClad app installation prompt failed.", error);
    }
  };

  if (isInstalled) {
    return null;
  }

  const dialog = isOpen
    ? createPortal(
        <div
          className="fixed inset-0 z-[200] flex min-h-[100dvh] items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm"
          role="presentation"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              closeDialog();
            }
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-app-title"
            className="relative flex max-h-[calc(100dvh-3rem)] w-full max-w-md flex-col overflow-hidden border border-orange-400/35 bg-zinc-950 text-white shadow-[0_0_60px_rgba(0,0,0,0.75)]"
          >
            <div
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1 bg-orange-500"
            />

            <div className="flex shrink-0 items-start justify-between gap-5 border-b border-white/10 p-6">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.28em] text-orange-400">
                  IronClad Mobile
                </p>

                <h2
                  id="install-app-title"
                  className="mt-2 text-2xl font-black text-white"
                >
                  Install IronClad
                </h2>
              </div>

              <button
                type="button"
                onClick={closeDialog}
                className="grid h-10 w-10 shrink-0 place-items-center border border-white/10 bg-white/[0.04] text-zinc-300 transition hover:border-orange-400/50 hover:text-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                aria-label="Close installation instructions"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-6">
              <p className="leading-7 text-zinc-300">
                Add IronClad to your Home Screen for faster access and an
                app-like full-screen experience.
              </p>

              {installPrompt ? (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={installApp}
                    className="flex w-full items-center justify-center gap-3 border border-orange-400 bg-orange-500 px-5 py-4 font-black text-black transition hover:border-orange-300 hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-orange-300"
                  >
                    <Download size={19} aria-hidden="true" />
                    Install now
                  </button>

                  <p className="mt-4 text-center text-xs leading-5 text-zinc-500">
                    Your browser will open the secure installation prompt.
                  </p>
                </div>
              ) : isIos ? (
                <ol className="mt-6 space-y-4">
                  <Instruction
                    icon={Ellipsis}
                    number="1"
                    title="Open the menu"
                    description="Tap the ⋯ (More) button in Safari."
                  />

                  <Instruction
                    icon={Share}
                    number="2"
                    title="Share"
                    description="Tap Share."
                  />

                  <Instruction
                    icon={SquarePlus}
                    number="3"
                    title="Add to Home Screen"
                    description={'Select "Add to Home Screen". If you don\'t see it, tap "More" and look for it in the list.'}
                  />

                  <Instruction
                    icon={CheckCircle2}
                    number="4"
                    title="Install"
                    description={'Tap "Add".'}
                  />
                </ol>
              ) : (
                <ol className="mt-6 space-y-4">
                  <Instruction
                    icon={MoreVertical}
                    number="1"
                    title="Open the browser menu"
                    description="Tap the menu button in Chrome, Edge, or your browser."
                  />

                  <Instruction
                    icon={Download}
                    number="2"
                    title="Install the app"
                    description='Choose “Install app” or “Add to Home screen”.'
                  />

                  <Instruction
                    icon={PlusSquare}
                    number="3"
                    title="Confirm"
                    description="Confirm the installation when prompted."
                  />
                </ol>
              )}
            </div>
          </section>
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="flex w-full items-center justify-between border border-orange-400/35 bg-orange-500/10 px-4 py-3 text-left text-sm font-black uppercase tracking-[0.14em] text-orange-200 transition hover:border-orange-300/70 hover:bg-orange-500/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
      >
        <span className="flex items-center gap-3">
          <Download size={18} aria-hidden="true" />
          Download our app
        </span>

        <span className="text-lg leading-none" aria-hidden="true">
          +
        </span>
      </button>

      {dialog}
    </>
  );
}

function Instruction({
  icon: Icon,
  number,
  title,
  description,
}: {
  icon: typeof Share;
  number: string;
  title: string;
  description: string;
}) {
  return (
    <li className="grid grid-cols-[44px_1fr] gap-4 border border-white/10 bg-white/[0.03] p-4">
      <span className="grid h-11 w-11 place-items-center border border-orange-400/30 bg-orange-500/10 text-orange-300">
        <Icon size={19} aria-hidden="true" />
      </span>

      <div>
        <p className="text-xs font-black uppercase tracking-[0.18em] text-orange-400">
          Step {number}
        </p>

        <p className="mt-1 font-black text-white">{title}</p>

        <p className="mt-1 text-sm leading-6 text-zinc-400">
          {description}
        </p>
      </div>
    </li>
  );
}
