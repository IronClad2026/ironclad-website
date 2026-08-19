// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import SearchableProfileSelect from "@/components/SearchableProfileSelect";

describe("SearchableProfileSelect localized copy", () => {
  afterEach(cleanup);

  it("uses caller-provided copy for dynamic saved values and empty results", () => {
    render(
      <SearchableProfileSelect
        label="Pays"
        value=""
        options={[{ label: "Australie", value: "Australia" }]}
        onSelect={vi.fn()}
        noResultsLabel="Aucune option trouvée."
        savedValueTemplate="Enregistre {value}"
      />
    );

    const input = screen.getByRole("combobox", { name: "Pays" });
    fireEvent.focus(input);
    expect(screen.getByText("Enregistre Australia")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("Aucune option trouvée.")).toBeInTheDocument();
  });
});
