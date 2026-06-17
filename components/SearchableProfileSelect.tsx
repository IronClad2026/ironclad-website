"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";

export type SearchableProfileSelectOption = {
  label: string;
  value: string;
  aliases?: string[];
};

type SearchableProfileSelectProps = {
  label: string;
  name?: string;
  value: string;
  submittedValue?: string;
  options: SearchableProfileSelectOption[];
  onSelect: (option: SearchableProfileSelectOption) => void;
  onCustomValueChange?: (value: string) => void;
  error?: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
  className?: string;
  showSavedValueHint?: boolean;
};

export default function SearchableProfileSelect({
  label,
  name,
  value,
  submittedValue,
  options,
  onSelect,
  onCustomValueChange,
  error,
  description,
  placeholder,
  required = false,
  className = "",
  showSavedValueHint = true,
}: SearchableProfileSelectProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const inputId = useId();
  const listboxId = useId();
  const selectedValue = submittedValue ?? value;
  const search = searchQuery.trim().toLowerCase();
  const filteredOptions = options.filter((option) =>
    [option.label, ...(option.aliases ?? [])].some((searchableValue) =>
      searchableValue.toLowerCase().includes(search)
    )
  );
  const visibleValue = open ? searchQuery : value;

  return (
    <div className={`min-w-0 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-bold text-white">
        {label}
      </label>
      {description && (
        <p className="mt-1 text-xs leading-5 text-zinc-500">{description}</p>
      )}
      {name && (
        <input
          name={name}
          type="hidden"
          value={submittedValue ?? value}
        />
      )}
      <div className="relative mt-3">
        <input
          id={inputId}
          value={visibleValue}
          onChange={(event) => {
            const nextSearch = event.target.value;

            setSearchQuery(nextSearch);
            onCustomValueChange?.(nextSearch);
            setOpen(true);
          }}
          onFocus={() => {
            setSearchQuery("");
            setOpen(true);
          }}
          onBlur={() =>
            window.setTimeout(() => {
              setOpen(false);
              setSearchQuery("");
            }, 120)
          }
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-required={required}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-invalid={Boolean(error)}
          className={`h-12 w-full rounded-xl border bg-black/40 py-3 pr-11 pl-4 text-white outline-none transition placeholder:text-zinc-600 focus:border-orange-400 ${
            error ? "border-red-500/70" : "border-white/10"
          }`}
        />
        <ChevronDown
          size={18}
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-zinc-500 transition-transform ${
            open ? "rotate-180 text-orange-300" : ""
          }`}
        />

        {open && (
          <div
            id={listboxId}
            role="listbox"
            className="absolute top-[calc(100%+0.5rem)] left-0 z-[1000] max-h-60 w-full overflow-y-auto rounded-xl border border-white/10 bg-[#111318] p-2 shadow-2xl shadow-black/60"
          >
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={`${option.label}-${option.value}`}
                  type="button"
                  role="option"
                  aria-selected={selectedValue === option.value}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onSelect(option);
                    setSearchQuery("");
                    setOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-2 text-left text-sm font-semibold text-zinc-300 transition hover:bg-orange-500/10 hover:text-white"
                >
                  <span>{option.label}</span>
                  {showSavedValueHint && option.value !== option.label && (
                    <span className="ml-2 text-xs text-orange-300">
                      Saves {option.value}
                    </span>
                  )}
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-center text-sm text-zinc-500">
                No results found
              </p>
            )}
          </div>
        )}
      </div>

      {error && <span className="mt-2 block text-xs text-red-300">{error}</span>}
    </div>
  );
}
