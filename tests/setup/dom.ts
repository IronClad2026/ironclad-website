import "@testing-library/jest-dom/vitest";
import * as domMatchers from "@testing-library/jest-dom/matchers";
import { expect } from "vitest";

expect.extend(domMatchers);
