/**
 * SplashScreen — first-paint placeholder smoke tests (US-G1-2).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import SplashScreen from "../components/SplashScreen";

describe("SplashScreen", () => {
  it("renders splash content immediately", () => {
    render(<SplashScreen durationMs={500} />);
    expect(screen.getByTestId("agentrix-splash")).toBeInTheDocument();
    expect(screen.getByText("Agentrix")).toBeInTheDocument();
  });

  it("auto-dismisses after duration and calls onDone", () => {
    vi.useFakeTimers();
    const onDone = vi.fn();
    render(<SplashScreen durationMs={150} onDone={onDone} />);
    expect(screen.queryByTestId("agentrix-splash")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.queryByTestId("agentrix-splash")).not.toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("default duration is 200ms", () => {
    vi.useFakeTimers();
    render(<SplashScreen />);
    expect(screen.queryByTestId("agentrix-splash")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(199);
    });
    expect(screen.queryByTestId("agentrix-splash")).toBeInTheDocument();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.queryByTestId("agentrix-splash")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
