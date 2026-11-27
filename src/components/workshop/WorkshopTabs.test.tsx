import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkshopTabs } from "./WorkshopTabs";

const ids = ["panel", "quotes", "orders", "vehicles", "contacts", "inventory", "purchases", "cash", "settings"];
const tabs = ids.map((id) => ({ id, es: id, en: id }));

describe("Workshop main navigation", () => {
  it("keeps four primary tabs and makes all remaining tabs reachable from More", () => {
    render(<WorkshopTabs tabs={tabs} selected="quotes" lang="es" pending={2} />);
    expect(screen.getByRole("link", { name: "quotes2" })).toHaveAttribute("aria-current", "page");
    fireEvent.click(screen.getByRole("button", { name: /Más/ }));
    for (const [index, id] of ids.entries()) expect(screen.getByRole(index < 4 ? "link" : "menuitem", { name: id === "quotes" ? "quotes2" : id })).toHaveAttribute("href", `/portal/workshop?tab=${id}`);
  });
});
