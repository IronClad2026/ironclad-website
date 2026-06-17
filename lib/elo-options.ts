export type EloRangeOption = {
  label: string;
  value: string;
  min: number;
  max: number;
};

export const eloRanges: EloRangeOption[] = [
  { label: "700-900", value: "800", min: 700, max: 900 },
  { label: "900-1100", value: "1000", min: 900, max: 1100 },
  { label: "1100-1300", value: "1200", min: 1100, max: 1300 },
  { label: "1300-1500", value: "1400", min: 1300, max: 1500 },
  { label: "1500-1700", value: "1600", min: 1500, max: 1700 },
  { label: "1700-1900", value: "1800", min: 1700, max: 1900 },
  { label: "1900-2100", value: "2000", min: 1900, max: 2100 },
  { label: "2100-2300", value: "2200", min: 2100, max: 2300 },
  { label: "2300-2500", value: "2400", min: 2300, max: 2500 },
  { label: "2500-2700", value: "2600", min: 2500, max: 2700 },
  { label: "2700-2900", value: "2800", min: 2700, max: 2900 },
];

export const allEloFilterOption = {
  label: "All ELO",
  value: "all",
};

export const eloFilterOptions = [allEloFilterOption, ...eloRanges];

export function isEloInRange(elo: number | null, rangeValue: string) {
  if (rangeValue === allEloFilterOption.value) {
    return true;
  }

  if (typeof elo !== "number") {
    return false;
  }

  const range = eloRanges.find((option) => option.value === rangeValue);
  return range ? elo >= range.min && elo <= range.max : true;
}
