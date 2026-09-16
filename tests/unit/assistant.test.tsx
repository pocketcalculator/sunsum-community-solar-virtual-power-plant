/**
 * Focused interaction coverage for the browser-only assistant skeleton.
 * Tests pin the accessible drawer, deterministic fallback conversation, local
 * file-selection disclosure, and unsupported speech-to-text behavior.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Assistant } from "@/features/assistant";

const OPTIONS = [
  { href: "/join?start=i-have-roof", label: "I have a rooftop" },
  { href: "/join?start=i-have-land", label: "I have land" },
  { href: "/join?start=i-would-fund", label: "I want to fund projects" },
] as const;

function renderAndOpenAssistant() {
  render(<Assistant options={OPTIONS} />);
  fireEvent.click(screen.getByRole("button", { name: "AI assistant" }));
}

afterEach(() => {
  Reflect.deleteProperty(window, "webkitSpeechRecognition");
});

describe("assistant", () => {
  it("opens with a greeting and the three participation paths", () => {
    renderAndOpenAssistant();

    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByText("Hi, what can I help you with?")).toBeVisible();
    for (const option of OPTIONS) {
      expect(screen.getByRole("link", { name: option.label })).toHaveAttribute(
        "href",
        option.href,
      );
    }
  });

  it("handles a basic local conversation without a model", () => {
    renderAndOpenAssistant();
    const composer = screen.getByRole("textbox", { name: "Message" });
    expect(composer.tagName).toBe("TEXTAREA");
    expect(composer).toHaveAttribute("rows", "3");

    fireEvent.change(composer, {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));

    expect(screen.getByText("Hello. What can I help you with?")).toBeVisible();
  });

  it("submits with Enter and keeps Shift+Enter for a new line", () => {
    renderAndOpenAssistant();
    const composer = screen.getByRole("textbox", { name: "Message" });

    fireEvent.change(composer, { target: { value: "Hello" } });
    fireEvent.keyDown(composer, { key: "Enter", shiftKey: true });
    expect(screen.queryByText("Hello. What can I help you with?")).toBeNull();

    fireEvent.keyDown(composer, { key: "Enter" });
    expect(screen.getByText("Hello. What can I help you with?")).toBeVisible();
  });

  it("stays open when the file picker returns without a file", () => {
    renderAndOpenAssistant();
    const fileInput = document.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (!fileInput) throw new Error("The local file input is missing.");

    fireEvent.change(fileInput, { target: { files: [] } });
    fireEvent.click(screen.getByRole("dialog"));

    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("shows and removes a selected local filename", () => {
    renderAndOpenAssistant();
    const fileInput = document.querySelector<HTMLInputElement>(
      'input[type="file"]',
    );
    if (!fileInput) throw new Error("The local file input is missing.");

    fireEvent.change(fileInput, {
      target: { files: [new File(["preview"], "roof-notes.txt")] },
    });
    expect(screen.getByText("roof-notes.txt")).toBeVisible();

    fireEvent.click(
      screen.getByRole("button", { name: "Remove roof-notes.txt" }),
    );
    expect(screen.queryByText("roof-notes.txt")).not.toBeInTheDocument();
  });

  it("explains when speech-to-text is unavailable", () => {
    renderAndOpenAssistant();
    fireEvent.click(
      screen.getByRole("button", { name: "Start speech-to-text" }),
    );

    expect(
      screen.getByText("Speech-to-text is not supported by this browser."),
    ).toBeVisible();
  });

  it("writes interim speech and restarts when the browser ends early", () => {
    const start = vi.fn();
    const stop = vi.fn();
    const recognitionCallbacks: {
      onend: (() => void) | null;
      onerror: ((event: Event & { error: string }) => void) | null;
      onresult: ((event: Event) => void) | null;
    } = {
      onend: null,
      onerror: null,
      onresult: null,
    };

    class SpeechRecognitionStub {
      continuous = false;
      interimResults = false;
      lang = "";
      maxAlternatives = 0;
      start = start;
      stop = stop;

      set onend(callback: (() => void) | null) {
        recognitionCallbacks.onend = callback;
      }

      set onerror(
        callback: ((event: Event & { error: string }) => void) | null,
      ) {
        recognitionCallbacks.onerror = callback;
      }

      set onresult(callback: ((event: Event) => void) | null) {
        recognitionCallbacks.onresult = callback;
      }
    }

    Object.defineProperty(window, "webkitSpeechRecognition", {
      configurable: true,
      value: SpeechRecognitionStub,
    });
    renderAndOpenAssistant();
    fireEvent.click(
      screen.getByRole("button", { name: "Start speech-to-text" }),
    );

    act(() => {
      recognitionCallbacks.onresult?.({
        results: Object.assign(
          [{ 0: { transcript: "I have a rooftop" }, isFinal: false }],
          { length: 1 },
        ),
      } as unknown as Event);
    });
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveValue(
      "I have a rooftop",
    );

    act(() => recognitionCallbacks.onend?.());
    expect(start).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Listening…")).toBeVisible();
  });
});