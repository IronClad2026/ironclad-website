// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createTournamentBannerUploadMock = vi.hoisted(() => vi.fn());
const discardTournamentBannerUploadMock = vi.hoisted(() => vi.fn());
const uploadToSignedUrlMock = vi.hoisted(() => vi.fn());

vi.mock("@/app/admin/tournaments/actions", () => ({
  createTournamentBannerUpload: createTournamentBannerUploadMock,
  discardTournamentBannerUpload: discardTournamentBannerUploadMock,
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: vi.fn(() => ({
        uploadToSignedUrl: uploadToSignedUrlMock,
      })),
    },
  },
}));

import TournamentBannerPicker from "@/components/TournamentBannerPicker";
import TournamentFormDraft from "@/components/TournamentFormDraft";

const draftKey = "ironclad:new-tournament-draft";
const uploadPath = "banners/123e4567-e89b-42d3-a456-426614174000.png";
const uploadToken = "private-signed-upload-token";
const publicUrl =
  `http://127.0.0.1:54321/storage/v1/object/public/` +
  `tournament-banners/${uploadPath}`;

function renderEditableForm() {
  return render(
    <form id="tournament-form">
      <input name="title" defaultValue="" />
      <TournamentBannerPicker
        defaultValue=""
        readOnly={false}
      />
      <TournamentFormDraft
        formId="tournament-form"
        enabled
        clear={false}
      />
    </form>
  );
}

describe("TournamentBannerPicker browser privacy", () => {
  beforeEach(() => {
    sessionStorage.clear();
    createTournamentBannerUploadMock.mockReset();
    discardTournamentBannerUploadMock.mockReset();
    uploadToSignedUrlMock.mockReset();
    discardTournamentBannerUploadMock.mockResolvedValue({ deleted: true });
    uploadToSignedUrlMock.mockResolvedValue({ error: null });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:test-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("keeps the active signed capability out of DOM and session persistence", async () => {
    createTournamentBannerUploadMock.mockResolvedValue({
      bucket: "tournament-banners",
      path: uploadPath,
      token: uploadToken,
      publicUrl,
    });
    const { container } = renderEditableForm();
    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInstanceOf(HTMLInputElement);

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["image"], "banner.png", { type: "image/png" })],
      },
    });

    const bannerInput = container.querySelector(
      'input[name="bannerImageUrl"]'
    ) as HTMLInputElement;
    await waitFor(() => expect(bannerInput.value).toBe(publicUrl));
    expect(uploadToSignedUrlMock).toHaveBeenCalledWith(
      uploadPath,
      uploadToken,
      expect.any(File),
      { contentType: "image/png" }
    );
    expect(createTournamentBannerUploadMock).toHaveBeenCalledWith({
      fileName: "banner.png",
      contentType: "image/png",
      size: 5,
    });

    const titleInput = container.querySelector(
      'input[name="title"]'
    ) as HTMLInputElement;
    fireEvent.input(titleInput, {
      target: { value: "Privacy Cup" },
    });
    const persistedDraft = sessionStorage.getItem(draftKey) ?? "";
    expect(persistedDraft).not.toContain("bannerImageUrl");
    expect(persistedDraft).not.toContain(uploadPath);
    expect(persistedDraft).not.toContain(uploadToken);
    expect(persistedDraft).not.toContain(publicUrl);
    expect(container.querySelector('[name="path"]')).toBeNull();
    expect(container.querySelector('[name="token"]')).toBeNull();
    expect(container.innerHTML).not.toContain(uploadToken);
  });

  it("scrubs a historical banner URL from an existing session draft", async () => {
    sessionStorage.setItem(
      draftKey,
      JSON.stringify({
        bannerImageUrl:
          "https://project.supabase.co/storage/v1/object/public/" +
          "tournament-banners/drafts/user_private/banner.png",
        title: "Restored title",
      })
    );
    renderEditableForm();

    await waitFor(() => {
      const persisted = sessionStorage.getItem(draftKey) ?? "";
      expect(persisted).not.toContain("bannerImageUrl");
      expect(persisted).not.toContain("user_private");
    });
  });

  it("restores and cleans up a prior pending upload after a later failure", async () => {
    createTournamentBannerUploadMock
      .mockResolvedValueOnce({
        bucket: "tournament-banners",
        path: uploadPath,
        token: uploadToken,
        publicUrl,
      })
      .mockRejectedValueOnce(new Error("private provider failure"));
    const { container } = renderEditableForm();
    const fileInput = container.querySelector(
      'input[type="file"]'
    ) as HTMLInputElement;
    const bannerInput = container.querySelector(
      'input[name="bannerImageUrl"]'
    ) as HTMLInputElement;

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["first"], "first.png", { type: "image/png" })],
      },
    });
    await waitFor(() => expect(bannerInput.value).toBe(publicUrl));

    fireEvent.change(fileInput, {
      target: {
        files: [new File(["second"], "second.png", { type: "image/png" })],
      },
    });
    await screen.findByText("Banner upload failed. Try again.");
    expect(bannerInput.value).toBe(publicUrl);
    expect(discardTournamentBannerUploadMock).not.toHaveBeenCalledWith(
      publicUrl
    );
  });

  it("shows only a fixed client-safe error for provider failures", async () => {
    const privateProviderMessage =
      "drafts/user_private/banner.png Bearer credential signed-token";
    createTournamentBannerUploadMock.mockRejectedValue(
      new Error(privateProviderMessage)
    );
    const logSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { container } = renderEditableForm();
    const fileInput = container.querySelector('input[type="file"]');

    fireEvent.change(fileInput as HTMLInputElement, {
      target: {
        files: [new File(["image"], "banner.png", { type: "image/png" })],
      },
    });

    expect(await screen.findByText("Banner upload failed. Try again."))
      .toBeInTheDocument();
    expect(container.textContent).not.toContain(privateProviderMessage);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
