import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { getUserType, type UserTypeId } from "@/domain/userTypes";
import { CreateProfileFlow } from "@/features/onboarding";

function continueFlow() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function fillDetails() {
  fireEvent.change(screen.getByRole("textbox", { name: "Example name" }), {
    target: { value: "Alex Example" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: "Example email address" }), {
    target: { value: "alex@example.org" },
  });
}

function finishProfile(userTypeId: UserTypeId = "property-owner") {
  continueFlow();
  fillDetails();
  continueFlow();
  fireEvent.click(screen.getByRole("radio", { name: /as myself/i }));
  continueFlow();
  fireEvent.click(screen.getByRole("radio", { name: getUserType(userTypeId).label }));
  continueFlow();
  fireEvent.click(screen.getByRole("checkbox", { name: /I understand/i }));
  fireEvent.click(screen.getByRole("button", { name: /finish and review your answers/i }));
}

describe("public profile preview", () => {
  it("assembles fictional answers without credentials, service requests or persistence", () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Public preview must not fetch"));
    const readStorage = vi.spyOn(Storage.prototype, "getItem");
    const writeStorage = vi.spyOn(Storage.prototype, "setItem");
    const { container } = render(<CreateProfileFlow />);
    expect(container.querySelector('input[type="password"], input[autocomplete="one-time-code"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Continue with Microsoft|Continue with Google|Continue with Apple/);

    finishProfile();

    expect(screen.getByRole("heading", { name: "Your fictional profile is assembled" })).toBeVisible();
    expect(screen.getByText("alex@example.org")).toBeVisible();
    expect(screen.getByText(/no workspace access has been granted/i)).toBeVisible();
    expect(container.querySelector('input[type="password"], input[autocomplete="one-time-code"]')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(readStorage).not.toHaveBeenCalled();
    expect(writeStorage).not.toHaveBeenCalled();
  });

  it("can edit and finish again without inventing a discarded credential", () => {
    render(<CreateProfileFlow />);
    finishProfile();
    fireEvent.click(screen.getByRole("button", { name: /go back and edit/i }));
    expect(screen.getByRole("heading", { name: "Review your fictional profile" })).toBeVisible();
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /finish and review your answers/i }));
    expect(screen.getByRole("heading", { name: "Your fictional profile is assembled" })).toBeVisible();
  });

  it("does not offer steps blocked by earlier non-password answers", () => {
    render(<CreateProfileFlow />);
    const stepper = screen.getByRole("navigation", { name: "Profile preview steps" });
    expect(within(stepper).queryByRole("button", { name: /\breview\b/i })).toBeNull();
    expect(within(stepper).getAllByText(/finish an earlier step first/i).length).toBeGreaterThan(0);
    continueFlow();
    continueFlow();
    expect(screen.getByRole("alert")).toHaveFocus();
    expect(screen.getByRole("alert")).toHaveTextContent(/enter an email address/i);
    expect(screen.getByRole("heading", { name: "Try fictional profile details" })).toBeVisible();
  });

  it("removes an organisation error when the conditional field goes away", () => {
    render(<CreateProfileFlow />);
    continueFlow();
    fillDetails();
    continueFlow();
    fireEvent.click(screen.getByRole("radio", { name: /on behalf of an/i }));
    continueFlow();
    const link = within(screen.getByRole("alert")).getByRole("link", { name: /organisation/i });
    const href = link.getAttribute("href") ?? "";
    expect(document.querySelector(href)).not.toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /as myself/i }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(href)).toBeNull();
  });

  it("clears a profile validation error as soon as the field is corrected", () => {
    render(<CreateProfileFlow />);
    continueFlow();
    fillDetails();
    const email = screen.getByRole("textbox", { name: "Example email address" });
    fireEvent.change(email, { target: { value: "invalid" } });
    continueFlow();
    expect(email).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(email, { target: { value: "alex@example.org" } });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(email).not.toHaveAttribute("aria-invalid");
  });

  it("keeps answers when moving backwards", () => {
    render(<CreateProfileFlow />);
    continueFlow();
    fillDetails();
    continueFlow();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("textbox", { name: "Example name" })).toHaveValue("Alex Example");
    expect(screen.getByRole("textbox", { name: "Example email address" })).toHaveValue("alex@example.org");
  });

  it("preserves an unfinished draft and its step through optional learning and return", () => {
    render(<CreateProfileFlow initialIntentOptionIds={["i-have-roof"]} />);
    const learning = screen.getByText("Learning and help (optional)");
    expect(learning.closest("details")).not.toHaveAttribute("open");
    continueFlow();
    fireEvent.change(screen.getByRole("textbox", { name: "Example name" }), {
      target: { value: "Unfinished example" },
    });
    fireEvent.click(learning);
    expect(learning.closest("details")).toHaveAttribute("open");
    expect(screen.getByRole("region", { name: "Virtual power plant learning" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Return to profile preview" }));
    expect(learning.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByRole("heading", { name: "Try fictional profile details" })).toHaveFocus();
    expect(screen.getByRole("textbox", { name: "Example name" })).toHaveValue("Unfinished example");
    expect(screen.getByRole("textbox", { name: "Example email address" })).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByRole("checkbox", { name: /a rooftop to offer/i })).toBeChecked();
    fireEvent.click(learning);
    expect(learning.closest("details")).toHaveAttribute("open");
  });

  it("keeps a preselected intent editable without skipping a step or assigning a type", () => {
    const { rerender } = render(<CreateProfileFlow initialIntentOptionIds={["i-have-roof"]} />);
    const rooftop = screen.getByRole("checkbox", { name: /a rooftop to offer/i });
    expect(rooftop).toBeChecked();
    expect(screen.getByRole("heading", { name: "Tell us about you" })).toBeVisible();
    fireEvent.click(rooftop);
    rerender(<CreateProfileFlow initialIntentOptionIds={["i-have-roof"]} />);
    expect(rooftop).not.toBeChecked();
    continueFlow();
    fillDetails();
    continueFlow();
    fireEvent.click(screen.getByRole("radio", { name: /as myself/i }));
    continueFlow();
    expect(screen.queryByRole("radio", { checked: true })).toBeNull();
  });

  it.each(["student-researcher", "workforce-participant", "learning-more", "legal-adviser"] as const)(
    "leads %s to learning, not another workspace", (userTypeId) => {
      render(<CreateProfileFlow />);
      finishProfile(userTypeId);
      const next = screen.getByRole("region", { name: "Where to explore next" });
      expect(within(next).getByRole("heading", { name: "Keep exploring through learning" })).toBeVisible();
      expect(within(next).queryByRole("link", { name: /workspace/i })).toBeNull();
      expect(screen.getByText("Learning and help; no workspace is assigned.")).toBeVisible();
      fireEvent.click(within(next).getByRole("button", { name: "Open learning and help" }));
      const summary = screen.getByText("Learning and help (optional)");
      expect(summary).toHaveFocus();
      expect(summary.closest("details")).toHaveAttribute("open");
      fireEvent.click(screen.getByRole("button", { name: "Return to profile preview" }));
      expect(screen.getByRole("heading", { name: "Your fictional profile is assembled" })).toHaveFocus();
      expect(screen.getByText("alex@example.org")).toBeVisible();
    },
  );

  it("offers a mode-labeled workspace destination without a core identity grant", () => {
    render(<CreateProfileFlow />);
    finishProfile();
    const next = screen.getByRole("region", { name: "Where to explore next" });
    expect(within(next).getByRole("link", { name: "Explore workspace" })).toHaveAttribute("href", "/app");
    expect(screen.getByText(/preview context only; no access is granted/i)).toBeVisible();
  });

  it("does not restore answers after the public flow is unmounted", () => {
    const { unmount } = render(<CreateProfileFlow />);
    continueFlow();
    fillDetails();
    unmount();
    render(<CreateProfileFlow />);
    continueFlow();
    expect(screen.getByRole("textbox", { name: "Example name" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: "Example email address" })).toHaveValue("");
  });
});
