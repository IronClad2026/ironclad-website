// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TrendChart, DistributionChart } from "@/components/admin/operations/OperationsPrimitives";
afterEach(cleanup);
const point = (date: string, value: number) => ({ date, label: date, value });
describe("Date-keyed presentation", () => {
  it("aligns each series and exact-value row by UTC date without manufacturing zeros", () => {
    const { container } = render(<TrendChart id="fixture" title="Date alignment" description="Existing observations" series={[
      { label: "Registrations", color: "orange", points: [point("2025-12-31", 12), point("2026-01-02", 6)] },
      { label: "Withdrawals", color: "skyblue", points: [point("2026-01-01", 2), point("2026-01-02", 0)] },
    ]} />);
    const table = screen.getByRole("table", { name: "Date alignment in UTC" });
    const rows = within(table).getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(rows).toEqual(["2025-12-3112Not reported", "2026-01-01Not reported2", "2026-01-0260"]);
    const end = container.querySelector('div[data-markers="Registrations"] span[data-date="2026-01-02"]')!;
    const matching = container.querySelector('div[data-markers="Withdrawals"] span[data-date="2026-01-02"]')!;
    expect((end as HTMLElement).style.left).toBe((matching as HTMLElement).style.left);
    expect(container.querySelector('g[data-series="Registrations"] path')!.getAttribute("d")).not.toContain("L");
  });
  it("respects sparse time spacing and shows one-observation markers", () => {
    const { container, rerender } = render(<TrendChart id="fixture" title="Sparse dates" description="" series={[{ label: "Views", color: "orange", points: [point("2026-09-01", 2), point("2026-09-02", 5), point("2026-09-07", 3)] }]} />);
    const x = Array.from(container.querySelectorAll("span[data-date]")).map((node) => parseFloat((node as HTMLElement).style.left));
    expect(x[1] - x[0]).toBeCloseTo((x[2] - x[1]) / 5);
    rerender(<TrendChart id="fixture" title="One observation" description="" series={[{ label: "Views", color: "orange", points: [point("2026-09-07", 0)] }]} />);
    expect(container.querySelector('span[data-date]')).toHaveStyle({ left: "50%" });
    expect(screen.getByRole("cell", { name: "0" })).toBeInTheDocument();
  });
  it("keeps tiny nonzero distribution bars proportional", () => {
    const { container } = render(<DistributionChart title="Share" description="" points={[{ label: "Small", value: 1 }, { label: "Large", value: 999 }]} />);
    expect(container.querySelector('[style]')).toHaveStyle({ width: "0.1%" });
  });
});
