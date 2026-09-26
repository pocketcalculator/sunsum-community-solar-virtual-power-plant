// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PageAudioPlayer, PageAudioProvider, pageAudio } from "@/features/participation";
import { PublicStoryPage } from "@/features/community-context";

const example = { src: "/audio/example.mp3", title: "Example clip", credit: "Example artist" };

function mockMedia() {
  const states = new WeakMap<HTMLMediaElement, boolean>();
  const setPaused = (element: HTMLMediaElement, value: boolean) => states.set(element, value);
  vi.spyOn(HTMLMediaElement.prototype, "paused", "get")
    .mockImplementation(function (this: HTMLMediaElement) { return states.get(this) ?? true; });
  const play = vi.spyOn(HTMLMediaElement.prototype, "play")
    .mockImplementation(function (this: HTMLMediaElement) {
      setPaused(this, false);
      this.dispatchEvent(new Event("playing"));
      return Promise.resolve();
    });
  const pause = vi.spyOn(HTMLMediaElement.prototype, "pause")
    .mockImplementation(function (this: HTMLMediaElement) {
      const wasPaused = states.get(this) ?? true;
      setPaused(this, true);
      if (!wasPaused) this.dispatchEvent(new Event("pause"));
    });
  return { play, pause, setPaused };
}

let media: ReturnType<typeof mockMedia>;
beforeEach(() => { media = mockMedia(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function mount(audio = example) {
  return render(<PageAudioProvider><PageAudioPlayer audio={audio} /></PageAudioProvider>);
}

describe("approved story audio composition", () => {
  it.each(["need", "opportunity", "impact"] as const)("supplies actual %s audio without replacing the authored story", (topic) => {
    const { container } = render(<PageAudioProvider>
      <PublicStoryPage topic={topic} audio={<PageAudioPlayer audio={pageAudio(topic)} />} />
    </PageAudioProvider>);
    expect(container.querySelector("audio")).toHaveAttribute("src", `/audio/${topic}.mp3`);
    expect(screen.getByRole("article")).toHaveTextContent("not a claim of current projects or guaranteed outcomes");
    expect(screen.getByRole("link", { name: "Return to SunSum" })).toHaveAttribute("href", "/");
    expect(media.play).not.toHaveBeenCalled();
  });

  it("resolves media against a directory, never a hash route or external origin", () => {
    expect(pageAudio("need").src).toBe("/audio/need.mp3");
    expect(pageAudio("need", "./").src).toBe("./audio/need.mp3");
    expect(pageAudio("impact", "/app/sunsum-ui-demo/").src).toBe("/app/sunsum-ui-demo/audio/impact.mp3");
    for (const base of ["https://outside.invalid/", "//outside.invalid/", "#/need", "../", "/audio/../"]) {
      expect(() => pageAudio("need", base)).toThrow(/local directory/);
    }
  });
});

describe("the existing page audio control", () => {
  it("does not start, loop or restart on its own", () => {
    const { container } = mount();
    const element = container.querySelector("audio");
    expect(media.play).not.toHaveBeenCalled();
    expect(element).toHaveAttribute("preload", "none");
    expect(element).not.toHaveAttribute("autoplay");
    expect(element).not.toHaveAttribute("loop");
    expect(screen.getByRole("button", { name: "Play Example clip" })).toBeVisible();
  });

  it("plays and pauses with native state and accurate labels", async () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    await screen.findByRole("button", { name: /^Pause/ });
    expect(screen.getByRole("button", { name: /^Pause/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Pause/ }));
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(media.pause).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /^Play/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("mutes and unmutes without pausing playback", async () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    await screen.findByRole("button", { name: /^Pause/ });
    const element = container.querySelector("audio");
    fireEvent.click(screen.getByRole("button", { name: /^Mute/ }));
    expect(element?.muted).toBe(true);
    expect(media.pause).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /^Unmute/ })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: /^Unmute/ }));
    expect(element?.muted).toBe(false);
    expect(screen.getByRole("button", { name: /^Pause/ })).toBeVisible();
  });

  it("carries mute-before-play to the actual muted property", async () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: /^Mute/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    await screen.findByRole("button", { name: /^Pause/ });
    expect(container.querySelector("audio")?.muted).toBe(true);
    expect(media.play).toHaveBeenCalledTimes(1);
  });

  it.each(["rejection", "native error", "synchronous refusal"] as const)("reports %s and retains the story and retry control", async (failure) => {
    if (failure === "rejection") media.play.mockRejectedValueOnce(new DOMException("Blocked", "NotAllowedError"));
    if (failure === "synchronous refusal") media.play.mockImplementationOnce(() => { throw new DOMException("Unavailable", "NotSupportedError"); });
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    if (failure === "native error") fireEvent.error(container.querySelector("audio")!);
    expect(await screen.findByRole("alert")).toHaveTextContent("could not be played");
    expect(screen.getByRole("button", { name: /^Play/ })).toBeVisible();
  });

  it("ends without an automatic restart and permits a deliberate replay", async () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    await screen.findByRole("button", { name: /^Pause/ });
    fireEvent.ended(container.querySelector("audio")!);
    expect(screen.getByRole("status")).toHaveTextContent("Finished");
    expect(media.play).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    expect(media.play).toHaveBeenCalledTimes(2);
  });

  it("allows only one active clip under the public provider", async () => {
    const second = { ...example, src: "/audio/second.mp3", title: "Second clip" };
    const { container } = render(<PageAudioProvider>
      <PageAudioPlayer audio={example} /><PageAudioPlayer audio={second} />
    </PageAudioProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Play Example clip" }));
    await screen.findByRole("button", { name: "Pause Example clip" });
    fireEvent.click(screen.getByRole("button", { name: "Play Second clip" }));
    await screen.findByRole("button", { name: "Pause Second clip" });
    expect(screen.getByRole("button", { name: "Play Example clip" })).toBeVisible();
    const elements = container.querySelectorAll("audio");
    expect(elements[0]?.paused).toBe(true);
    expect(elements[1]?.paused).toBe(false);
  });

  it("cancels a pending play and cannot be restarted by its stale fulfillment", async () => {
    let complete!: () => void;
    media.play.mockImplementationOnce(() => new Promise<void>((resolve) => { complete = resolve; }));
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    expect(screen.getByRole("status")).toHaveTextContent("Loading");
    fireEvent.click(screen.getByRole("button", { name: /^Pause/ }));
    await act(async () => { complete(); });
    expect(container.querySelector("audio")?.paused).toBe(true);
    expect(screen.getByRole("button", { name: /^Play/ })).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("an older rejection cannot stop a newer successful attempt", async () => {
    let reject!: (error: Error) => void;
    media.play.mockImplementationOnce(() => new Promise<void>((_resolve, rejectPromise) => { reject = rejectPromise; }));
    mount();
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Pause/ }));
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    await screen.findByRole("button", { name: /^Pause/ });
    await act(async () => { reject(new Error("Old request")); });
    expect(screen.getByRole("button", { name: /^Pause/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("stops the previous source on route replacement and on unmount", async () => {
    const { container, rerender, unmount } = mount();
    const oldElement = container.querySelector("audio")!;
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    await screen.findByRole("button", { name: /^Pause/ });
    rerender(<PageAudioProvider><PageAudioPlayer audio={{ ...example, src: "/audio/other.mp3", title: "Other clip" }} /></PageAudioProvider>);
    expect(oldElement.paused).toBe(true);
    const nextElement = container.querySelector("audio")!;
    expect(nextElement).not.toBe(oldElement);
    expect(nextElement.paused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /^Play/ }));
    await screen.findByRole("button", { name: /^Pause/ });
    unmount();
    expect(nextElement.paused).toBe(true);
  });

  it("credits the recording separately from the software license", () => {
    const { container } = mount();
    expect(container.querySelector("p")?.textContent).toContain("Example artist");
    expect(screen.getByText(/Third-party music.*MIT license/)).toBeVisible();
  });
});
