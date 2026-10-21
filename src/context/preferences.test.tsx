import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ persist: vi.fn() }));
vi.mock("@/actions/profile", () => ({ updatePreferences: mocks.persist }));
import { PreferencesProvider, usePreferences } from "./preferences";

function Controls() {
  const { setTheme, setLang } = usePreferences();
  return <><button onClick={() => setTheme("dark")}>Dark</button><button onClick={() => setTheme("light")}>Light</button><button onClick={() => setLang("en")}>English</button></>;
}
describe("persisted preferences keep the order of user selections", () => {
  beforeEach(() => { mocks.persist.mockReset().mockResolvedValue({ success: true }); });
  it("serializes rapid choices after each durable save", async () => {
    let complete!: () => void;
    mocks.persist.mockImplementationOnce(() => new Promise<void>(resolve => { complete = resolve; }));
    render(<PreferencesProvider><Controls /></PreferencesProvider>);
    await userEvent.click(screen.getByText("Dark")); await userEvent.click(screen.getByText("Light")); await userEvent.click(screen.getByText("English"));
    expect(mocks.persist).toHaveBeenCalledTimes(1);
    await act(async () => complete());
    await waitFor(() => expect(mocks.persist).toHaveBeenCalledTimes(3));
    expect(mocks.persist.mock.calls.map(call => call[0])).toEqual([{ theme: "dark" }, { theme: "light" }, { language: "en" }]);
  });
  it("accepts the next selection after a failed save", async () => {
    mocks.persist.mockRejectedValueOnce(new Error("offline"));
    render(<PreferencesProvider><Controls /></PreferencesProvider>);
    await userEvent.click(screen.getByText("Dark")); await userEvent.click(screen.getByText("English"));
    await waitFor(() => expect(mocks.persist).toHaveBeenCalledTimes(2));
    expect(mocks.persist).toHaveBeenLastCalledWith({ language: "en" });
  });
});
