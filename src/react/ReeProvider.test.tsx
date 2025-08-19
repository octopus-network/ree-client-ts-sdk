import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReeProvider, useRee } from "./ReeProvider";
import type { Config } from "../types/config";
import { Network } from "../types/network";

const mockConfig: Config = {
  network: Network.Testnet,
  maestroApiKey: "test-key",
  exchangeIdlFactory: vi.fn(),
  exchangeId: "test-id",
  exchangeCanisterId: "test-canister-id",
};

function TestComponent() {
  const { client } = useRee();
  return <div data-testid="client">{client ? "ready" : "not-ready"}</div>;
}

describe("ReeProvider", () => {
  it("should render children", () => {
    render(
      <ReeProvider config={mockConfig}>
        <div data-testid="child">Test Child</div>
      </ReeProvider>
    );

    expect(screen.getByTestId("child")).toHaveTextContent("Test Child");
  });

  it("should provide client instance", () => {
    render(
      <ReeProvider config={mockConfig}>
        <TestComponent />
      </ReeProvider>
    );

    expect(screen.getByTestId("client")).toHaveTextContent("ready");
  });

  it("should throw error when used outside provider", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(() => {
      render(<TestComponent />);
    }).toThrow("useRee must be used within ReeProvider");

    consoleSpy.mockRestore();
  });
});
