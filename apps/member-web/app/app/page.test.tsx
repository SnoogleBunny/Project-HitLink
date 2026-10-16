import { describe, expect, it, vi } from "vitest";
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
import AppHomePage from "./page";
describe("member landing route", () => {
  it("opens the unified Classes page", () => {
    expect(() => AppHomePage()).toThrow("REDIRECT:/app/schedule");
  });
});
