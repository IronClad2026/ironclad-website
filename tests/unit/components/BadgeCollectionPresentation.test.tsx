// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type {
  HTMLAttributes,
  ImgHTMLAttributes,
  ReactNode,
} from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import DashboardBadgeCollection from "@/components/badges/DashboardBadgeCollection";
import { buildDashboardBadgeData } from "@/lib/badges/dashboard";
import italianBadges from "@/lib/i18n/dictionaries/it/badges";

type MockImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  src: string;
};

vi.mock("next/image", async () => {
  const react = await vi.importActual<typeof import("react")>("react");

  return {
    default: (props: MockImageProps) => {
      const imageProps = { ...props };
      delete imageProps.children;
      return react.createElement("img", imageProps);
    },
  };
});

vi.mock("framer-motion", async () => {
  const react = await vi.importActual<typeof import("react")>("react");

  type MotionMockProps = HTMLAttributes<HTMLElement> & {
    animate?: unknown;
    exit?: unknown;
    initial?: unknown;
    transition?: unknown;
    children?: ReactNode;
  };

  const makeMotionElement = (tag: "article" | "button" | "div" | "span") =>
    react.forwardRef<HTMLElement, MotionMockProps>(function MotionElement(
      props,
      ref
    ) {
      const children = props.children;
      const domProps = { ...props };
      delete domProps.animate;
      delete domProps.exit;
      delete domProps.initial;
      delete domProps.transition;
      delete domProps.children;
      return react.createElement(tag, { ...domProps, ref }, children);
    });

  return {
    AnimatePresence: ({ children }: { children: ReactNode }) => children,
    motion: {
      article: makeMotionElement("article"),
      button: makeMotionElement("button"),
      div: makeMotionElement("div"),
      span: makeMotionElement("span"),
    },
    useReducedMotion: () => false,
  };
});

describe("Badge collection presentation", () => {
  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
    vi.restoreAllMocks();
  });

  it("maps all 30 optimized transparent artwork sources with responsive sizes", () => {
    render(
      <DashboardBadgeCollection badgeData={buildDashboardBadgeData()} />
    );

    const images = screen.getAllByRole("img");
    expect(images).toHaveLength(30);
    expect(images.map((image) => image.getAttribute("src"))).toEqual(
      Array.from({ length: 30 }, (_, index) => `/assets/badges/${index + 1}.png`)
    );

    for (const image of images) {
      expect(image).toHaveAttribute(
        "sizes",
        "(max-width: 639px) 42vw, (max-width: 1023px) 28vw, (max-width: 1535px) 20vw, 180px"
      );
      expect(image).not.toHaveAttribute("unoptimized");
      expect(image).toHaveClass("object-contain");
    }
  });

  it("uses the current Badge dictionary for names, states, copy, and aria labels", () => {
    render(
      <DashboardBadgeCollection
        badgeData={buildDashboardBadgeData()}
        dictionary={italianBadges}
        locale="it"
      />
    );

    expect(
      screen.getByRole("heading", { name: "Collezione Badge" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Recluta IronClad, Comune, Bloccato",
      })
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Ottenuti" })).toBeInTheDocument();
    expect(screen.getByLabelText("0 Badge ottenuti su 30")).toBeInTheDocument();
  });

  it("traps detail focus, makes the background inert, closes on Escape, and restores focus", async () => {
    const view = render(
      <DashboardBadgeCollection badgeData={buildDashboardBadgeData()} />
    );
    const opener = screen.getByRole("button", {
      name: "IronClad Recruit, Common, Locked",
    });

    opener.focus();
    fireEvent.click(opener);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: "Close Badge details" })
      ).toHaveFocus();
    });
    expect(view.container).toHaveAttribute("aria-hidden", "true");
    expect(view.container.inert).toBe(true);

    fireEvent.keyDown(window, { key: "Tab" });
    expect(
      screen.getByRole("button", { name: "Close Badge details" })
    ).toHaveFocus();

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(opener).toHaveFocus();
      expect(view.container).not.toHaveAttribute("aria-hidden");
      expect(view.container.inert).not.toBe(true);
    });
  });

  it("does not expose a fake empty collection when the load boundary fails", () => {
    render(
      <DashboardBadgeCollection
        badgeData={null}
        loadError="Badge ownership could not be loaded."
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Badge ownership could not be loaded."
    );
    expect(screen.queryByText(/0.*30/)).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
