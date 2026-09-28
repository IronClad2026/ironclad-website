// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchRoomSettingResult } from "@/lib/match-room-settings";

const updateSetting = vi.hoisted(() => vi.fn());
vi.mock("@/app/admin/system/match-room-actions", () => ({
  updateMatchRoomEnabled: updateSetting,
}));

import AdminMatchRoomControl from "@/components/AdminMatchRoomControl";
import { getMatchRoomControlCopy } from "@/lib/i18n/match-room-control";

const copy = getMatchRoomControlCopy("en");
const success = (enabled: boolean): MatchRoomSettingResult => ({ ok: true, enabled });

beforeEach(() => updateSetting.mockReset());
afterEach(() => cleanup());

describe("Admin Match Room activity control", () => {
  it.each([true, false])("changes an initially %s setting only after the action confirms it", async (enabled) => {
    updateSetting.mockResolvedValue(success(!enabled));
    render(<AdminMatchRoomControl setting={success(enabled)} locale="en" />);

    expect(screen.getByRole("region", { name: copy.title })).toBeInTheDocument();
    expect(screen.getByText(enabled ? copy.enabled : copy.disabled)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: enabled ? copy.disable : copy.enable }));

    expect(await screen.findByRole("status")).toHaveTextContent(copy.saved);
    expect(screen.getByText(enabled ? copy.disabled : copy.enabled)).toBeVisible();
    expect(screen.getByRole("button", { name: enabled ? copy.enable : copy.disable })).toBeEnabled();
    expect(updateSetting).toHaveBeenCalledOnce();
    const data = updateSetting.mock.calls[0][1] as FormData;
    expect(data).toBeInstanceOf(FormData);
    expect(data.getAll("enabled")).toEqual([String(!enabled)]);
    expect(Array.from(data.keys())).toEqual(["enabled"]);
  });

  it("offers only an explicit disable command when the current setting is unknown", async () => {
    updateSetting.mockResolvedValue(success(false));
    render(<AdminMatchRoomControl setting={{ ok: false, code: "unavailable" }} locale="en" />);

    expect(screen.getByText(copy.unavailable)).toBeVisible();
    expect(screen.queryByRole("button", { name: copy.enable })).not.toBeInTheDocument();
    expect(screen.queryByText(copy.disabled, { exact: true })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: copy.disable }));

    expect(await screen.findByRole("status")).toHaveTextContent(copy.saved);
    expect((updateSetting.mock.calls[0][1] as FormData).get("enabled")).toBe("false");
    expect(screen.getByText(copy.disabled, { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: copy.enable })).toBeEnabled();
  });

  it("blocks repeat submission and does not claim success while the action is pending", async () => {
    let finish!: (result: MatchRoomSettingResult) => void;
    updateSetting.mockReturnValue(new Promise<MatchRoomSettingResult>((resolve) => { finish = resolve; }));
    render(<AdminMatchRoomControl setting={success(true)} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: copy.disable }));

    const saving = await screen.findByRole("button", { name: copy.saving });
    expect(saving).toBeDisabled();
    fireEvent.click(saving);
    fireEvent.click(saving);
    expect(updateSetting).toHaveBeenCalledOnce();
    expect(screen.getByText(copy.enabled, { exact: true })).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(copy.saved)).not.toBeInTheDocument();

    await act(async () => finish(success(false)));
    expect(screen.getByRole("button", { name: copy.enable })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent(copy.saved);
  });

  it.each(["forbidden", "invalid_request", "unavailable"] as const)("reports %s without claiming a successful shutdown", async (code) => {
    updateSetting.mockResolvedValue({ ok: false, code });
    render(<AdminMatchRoomControl setting={success(true)} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: copy.disable }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.failed);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(copy.saved)).not.toBeInTheDocument();
    expect(screen.getByText(copy.enabled, { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: copy.disable })).toBeEnabled();
  });

  it.each([true, false])("retains the latest confirmed setting after a subsequent failure (initially %s)", async (enabled) => {
    updateSetting.mockResolvedValueOnce(success(!enabled))
      .mockResolvedValueOnce({ ok: false, code: "unavailable" });
    render(<AdminMatchRoomControl setting={success(enabled)} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: enabled ? copy.disable : copy.enable }));
    await screen.findByRole("status");
    fireEvent.click(screen.getByRole("button", { name: enabled ? copy.enable : copy.disable }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.failed);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.getByText(enabled ? copy.disabled : copy.enabled, { exact: true })).toBeVisible();
    expect(screen.getByRole("button", { name: enabled ? copy.enable : copy.disable })).toBeEnabled();
    await waitFor(() => expect(updateSetting).toHaveBeenCalledTimes(2));
  });

  it("keeps an unknown state safe and retryable after an action transport rejection", async () => {
    updateSetting.mockRejectedValueOnce(new Error("private provider failure"))
      .mockResolvedValueOnce(success(false));
    render(<AdminMatchRoomControl setting={{ ok: false, code: "unavailable" }} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: copy.disable }));

    expect(await screen.findByRole("alert")).toHaveTextContent(copy.failed);
    expect(screen.getByText(copy.unavailable)).toBeVisible();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: copy.enable })).not.toBeInTheDocument();
    expect(screen.queryByText("private provider failure")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: copy.disable }));
    expect(await screen.findByRole("status")).toHaveTextContent(copy.saved);
    expect(screen.getByText(copy.disabled, { exact: true })).toBeVisible();
    expect(updateSetting).toHaveBeenCalledTimes(2);
  });

  it("uses the supplied locale for the control and unavailable-state guidance", () => {
    const italian = getMatchRoomControlCopy("it");
    render(<AdminMatchRoomControl setting={{ ok: false, code: "unavailable" }} locale="it" />);
    expect(screen.getByRole("region", { name: italian.title })).toBeVisible();
    expect(screen.getByText(italian.unavailable)).toBeVisible();
    expect(screen.getByRole("button", { name: italian.disable })).toBeEnabled();
    expect(screen.queryByRole("button", { name: italian.enable })).not.toBeInTheDocument();
  });
});
