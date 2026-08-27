// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createAnnouncementMediaUploadMock = vi.hoisted(() => vi.fn());
const discardAnnouncementMediaUploadMock = vi.hoisted(() => vi.fn());
const publishAnnouncementMock = vi.hoisted(() => vi.fn());
const withdrawAnnouncementMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());
const uploadToSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));
vi.mock("@/app/admin/announcements/actions", () => ({
  createAnnouncementMediaUpload: createAnnouncementMediaUploadMock,
  discardAnnouncementMediaUpload: discardAnnouncementMediaUploadMock,
  publishAnnouncement: publishAnnouncementMock,
  withdrawAnnouncement: withdrawAnnouncementMock,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: () => ({ uploadToSignedUrl: uploadToSignedUrlMock }),
    },
  },
}));
vi.mock("@/components/HydrationSafeLocalDateTime", () => ({
  default: ({ value }: { value: string }) => <time>{value}</time>,
}));

import AdminAnnouncements from "@/components/AdminAnnouncements";
import type { AdminAnnouncement } from "@/lib/announcements";

const announcement: AdminAnnouncement = {
  id: "223e4567-e89b-42d3-a456-426614174000",
  title: "Launch update",
  body: "Official announcement body",
  publishedAt: "2026-08-26T02:30:00.000Z",
  withdrawnAt: null,
};
const tournamentId = "323e4567-e89b-42d3-a456-426614174000";
const tournamentProps = {
  tournamentOptions: [
    {
      id: tournamentId,
      title: "Academy Owner Check",
      status: "registration_open" as const,
    },
  ],
  tournamentOptionsLoadFailed: false,
};

describe("AdminAnnouncements", () => {
  const createObjectURLMock = vi.fn(() => "blob:announcement-preview");
  const revokeObjectURLMock = vi.fn();

  beforeEach(() => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectURLMock,
    });
    publishAnnouncementMock.mockResolvedValue({ ok: true });
    discardAnnouncementMediaUploadMock.mockResolvedValue({ ok: true });
    uploadToSignedUrlMock.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    cleanup();
    document.body.style.overflow = "";
  });

  it("previews the current title, body, and image locally before upload", () => {
    render(
      <AdminAnnouncements
        announcements={[]}
        loadFailed={false}
        {...tournamentProps}
      />
    );
    const preview = screen.getByRole("region", {
      name: "Announcement preview",
    });

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Current launch title" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Current launch body" },
    });
    fireEvent.change(screen.getByLabelText("Choose image or video"), {
      target: {
        files: [new File(["image"], "launch.png", { type: "image/png" })],
      },
    });
    fireEvent.change(screen.getByLabelText("Media description"), {
      target: { value: "Orange IronClad shield" },
    });

    expect(
      within(preview).getByRole("heading", { name: "Current launch title" })
    ).toBeInTheDocument();
    expect(within(preview).getByText("Current launch body"))
      .toBeInTheDocument();
    expect(
      within(preview).getByRole("img", { name: "Orange IronClad shield" })
    ).toHaveAttribute("src", "blob:announcement-preview");
    expect(createAnnouncementMediaUploadMock).not.toHaveBeenCalled();
    expect(publishAnnouncementMock).not.toHaveBeenCalled();
  });

  it("uses one non-multiple input and replaces image preview with video preview", () => {
    createObjectURLMock
      .mockReturnValueOnce("blob:image-preview")
      .mockReturnValueOnce("blob:video-preview");
    render(
      <AdminAnnouncements
        announcements={[]}
        loadFailed={false}
        {...tournamentProps}
      />
    );
    const input = screen.getByLabelText("Choose image or video");
    const preview = screen.getByRole("region", {
      name: "Announcement preview",
    });

    expect(document.querySelectorAll('input[type="file"]')).toHaveLength(1);
    expect(input).not.toHaveAttribute("multiple");
    fireEvent.change(input, {
      target: {
        files: [new File(["image"], "launch.webp", { type: "image/webp" })],
      },
    });
    expect(within(preview).getByRole("img")).toHaveAttribute(
      "src",
      "blob:image-preview"
    );

    fireEvent.change(input, {
      target: {
        files: [new File(["video"], "launch.webm", { type: "video/webm" })],
      },
    });

    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:image-preview");
    expect(within(preview).queryByRole("img")).not.toBeInTheDocument();
    const video = within(preview).getByLabelText(
      "Selected announcement video preview"
    );
    expect(video.tagName).toBe("VIDEO");
    expect(video).toHaveAttribute("src", "blob:video-preview");
    expect(video).toHaveAttribute("controls");
    expect(within(preview).getAllByLabelText(/preview/i)).toHaveLength(1);
    expect(createAnnouncementMediaUploadMock).not.toHaveBeenCalled();
    expect(publishAnnouncementMock).not.toHaveBeenCalled();
  });

  it("disables the form and prevents duplicate publication while pending", async () => {
    let resolvePublication!: (value: { ok: true }) => void;
    publishAnnouncementMock.mockReturnValue(
      new Promise((resolve) => {
        resolvePublication = resolve;
      })
    );
    render(
      <AdminAnnouncements
        announcements={[]}
        loadFailed={false}
        {...tournamentProps}
      />
    );

    const title = screen.getByLabelText("Title");
    const message = screen.getByLabelText("Message");
    fireEvent.change(title, { target: { value: "Single publication" } });
    fireEvent.change(message, { target: { value: "Publish only once." } });
    const publishButton = screen.getByRole("button", { name: "Publish now" });
    const form = publishButton.closest("form");
    expect(form).not.toBeNull();

    fireEvent.submit(form as HTMLFormElement);
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Publishing…" }))
        .toBeDisabled();
    });
    expect(title).toBeDisabled();
    expect(message).toBeDisabled();
    fireEvent.submit(form as HTMLFormElement);
    expect(publishAnnouncementMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePublication({ ok: true });
    });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Publish now" }))
        .toBeEnabled();
    });
    expect(publishAnnouncementMock).toHaveBeenCalledTimes(1);
  });

  it("clears a previous valid media selection when its replacement is invalid", async () => {
    render(
      <AdminAnnouncements
        announcements={[]}
        loadFailed={false}
        {...tournamentProps}
      />
    );
    const input = screen.getByLabelText("Choose image or video");

    fireEvent.change(input, {
      target: {
        files: [new File(["image"], "launch.png", { type: "image/png" })],
      },
    });
    expect(
      screen.getByRole("img", {
        name: "Selected announcement image preview",
      })
    ).toHaveAttribute("src", "blob:announcement-preview");
    fireEvent.change(screen.getByLabelText("Media description"), {
      target: { value: "Orange shield" },
    });

    fireEvent.change(input, {
      target: {
        files: [new File(["gif"], "replacement.gif", { type: "image/gif" })],
      },
    });

    expect(revokeObjectURLMock).toHaveBeenCalledWith(
      "blob:announcement-preview"
    );
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Media description")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Remove media" }))
      .not.toBeInTheDocument();
    expect(input).toHaveValue("");

    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Text-only update" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "No stale media should publish." },
    });
    fireEvent.submit(screen.getByRole("button", { name: "Publish now" }));

    await waitFor(() => {
      expect(publishAnnouncementMock).toHaveBeenCalledWith({
        title: "Text-only update",
        body: "No stale media should publish.",
        mediaPath: null,
        mediaDescription: null,
        linkToTournament: false,
        linkedTournamentId: null,
      });
    });
    expect(createAnnouncementMediaUploadMock).not.toHaveBeenCalled();
  });

  it("keeps Tournament linking off by default and requires one existing selection when enabled", async () => {
    render(
      <AdminAnnouncements
        announcements={[]}
        loadFailed={false}
        {...tournamentProps}
      />
    );

    const toggle = screen.getByRole("checkbox", {
      name: "Link this announcement to a Tournament",
    });
    expect(toggle).not.toBeChecked();
    expect(screen.queryByLabelText("Select Tournament")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByLabelText("Select Tournament")).toBeRequired();
    fireEvent.change(screen.getByLabelText("Title"), {
      target: { value: "Academy registration opens" },
    });
    fireEvent.change(screen.getByLabelText("Message"), {
      target: { value: "Registration is now open." },
    });

    fireEvent.submit(screen.getByRole("button", { name: "Publish now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Select an existing Tournament."
    );
    expect(publishAnnouncementMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Select Tournament"), {
      target: { value: tournamentId },
    });
    expect(
      within(screen.getByRole("region", { name: "Announcement preview" }))
        .getByText("View Tournament")
    ).toBeInTheDocument();
    fireEvent.submit(screen.getByRole("button", { name: "Publish now" }));

    await waitFor(() => {
      expect(publishAnnouncementMock).toHaveBeenCalledWith({
        title: "Academy registration opens",
        body: "Registration is now open.",
        mediaPath: null,
        mediaDescription: null,
        linkToTournament: true,
        linkedTournamentId: tournamentId,
      });
    });
  });

  it("announces withdrawal failures inside the open confirmation dialog", async () => {
    withdrawAnnouncementMock.mockResolvedValue({
      ok: false,
      message: "Withdrawal is temporarily unavailable.",
    });
    render(
      <AdminAnnouncements
        announcements={[announcement]}
        loadFailed={false}
        {...tournamentProps}
      />
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Withdraw announcement" })
    );
    const dialog = screen.getByRole("dialog", {
      name: "Withdraw announcement?",
    });
    fireEvent.click(
      within(dialog).getByRole("button", { name: "Withdraw announcement" })
    );

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Withdrawal is temporarily unavailable.");
    expect(dialog).toBeInTheDocument();
  });

  it("keeps focus and body lock inside the dialog while withdrawal is pending", async () => {
    let resolveWithdrawal!: (value: {
      ok: true;
      mediaCleanupWarning: boolean;
    }) => void;
    withdrawAnnouncementMock.mockReturnValue(
      new Promise((resolve) => {
        resolveWithdrawal = resolve;
      })
    );
    document.body.style.overflow = "clip";
    render(
      <AdminAnnouncements
        announcements={[announcement]}
        loadFailed={false}
        {...tournamentProps}
      />
    );

    const trigger = screen.getByRole("button", {
      name: "Withdraw announcement",
    });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", {
      name: "Withdraw announcement?",
    });
    expect(within(dialog).getByRole("button", { name: "Keep announcement" }))
      .toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");

    fireEvent.click(
      within(dialog).getByRole("button", { name: "Withdraw announcement" })
    );
    await waitFor(() => expect(dialog).toHaveAttribute("aria-busy", "true"));
    expect(dialog).toContainElement(document.activeElement as HTMLElement);

    fireEvent.keyDown(document, { key: "Tab" });
    expect(dialog).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(dialog).toBeInTheDocument();
    expect(document.body.style.overflow).toBe("hidden");

    await act(async () => {
      resolveWithdrawal({ ok: true, mediaCleanupWarning: false });
    });
    await waitFor(() => {
      expect(
        screen.queryByRole("dialog", { name: "Withdraw announcement?" })
      ).not.toBeInTheDocument();
    });
    expect(document.body.style.overflow).toBe("clip");
    expect(trigger).toHaveFocus();
  });
});
