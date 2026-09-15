import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { getUserType } from "@/domain/userTypes";
import { CreateProfileFlow } from "@/features/onboarding";

/**
 * The flow's navigation rules live in the step model and are tested there. This
 * covers what only the assembled component can show: that the rules still hold
 * when someone leaves the flow and comes back into it.
 */

const PASSWORD = "Correct-Horse-9!";
const PARTICIPANT_TYPE = getUserType("property-owner");

function continueFlow() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function fillAccountStep() {
  fireEvent.click(
    screen.getByRole("radio", { name: /email address and password/i }),
  );
  fireEvent.change(screen.getByRole("textbox", { name: /full name/i }), {
    target: { value: "Ada Lovelace" },
  });
  fireEvent.change(screen.getByRole("textbox", { name: /email address/i }), {
    target: { value: "ada@example.org" },
  });
  fireEvent.change(screen.getByLabelText("Password"), {
    target: { value: PASSWORD },
  });
}

/** Walks the whole flow and presses finish. */
function finishProfile() {
  continueFlow();
  fillAccountStep();
  continueFlow();

  fireEvent.click(screen.getByRole("radio", { name: /as myself/i }));
  continueFlow();

  fireEvent.click(screen.getByRole("radio", { name: PARTICIPANT_TYPE.label }));
  continueFlow();

  fireEvent.click(screen.getByRole("checkbox", { name: /I understand/i }));
  fireEvent.click(
    screen.getByRole("button", { name: /finish and review your answers/i }),
  );
}

describe("create profile flow", () => {
  it("assembles a profile and shows it back without the password", () => {
    const { container } = render(<CreateProfileFlow />);
    finishProfile();

    expect(
      screen.getByRole("heading", { name: /your profile is assembled/i }),
    ).toBeVisible();
    expect(screen.getByText("ada@example.org")).toBeVisible();
    expect(container.outerHTML).not.toContain(PASSWORD);
  });

  it("will not let a finished profile be finished again once the password is gone", () => {
    render(<CreateProfileFlow />);
    finishProfile();

    fireEvent.click(screen.getByRole("button", { name: /go back and edit/i }));

    // Editing must land on the step that is actually blocking, not the review
    // step, or the next press of finish would sail past a missing credential.
    expect(
      screen.getByRole("heading", { name: /create your sign-in/i }),
    ).toBeVisible();

    const summary = screen.getByRole("alert");
    expect(within(summary).getByText(/password/i)).toBeVisible();

    continueFlow();

    expect(
      screen.getByRole("heading", { name: /create your sign-in/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: /your profile is assembled/i }),
    ).toBeNull();
  });

  it("does not offer steps that an earlier answer has blocked", () => {
    render(<CreateProfileFlow />);

    const stepper = screen.getByRole("navigation", {
      name: /create profile steps/i,
    });

    expect(
      within(stepper).queryByRole("button", { name: /review/i }),
    ).toBeNull();
    expect(
      within(stepper).getAllByText(/finish an earlier step first/i).length,
    ).toBeGreaterThan(0);
  });

  it("does not leave an error summary pointing at a field that has gone", () => {
    render(<CreateProfileFlow />);
    continueFlow();
    fillAccountStep();
    continueFlow();

    // Ask for an organisation, leave its name blank, and try to continue.
    fireEvent.click(screen.getByRole("radio", { name: /on behalf of an/i }));
    continueFlow();

    const summary = screen.getByRole("alert");
    const link = within(summary).getByRole("link", { name: /organisation/i });
    const href = link.getAttribute("href") ?? "";
    expect(document.querySelector(href)).not.toBeNull();

    // Switching back removes the field, so its message must go with it rather
    // than leaving a correction link with nowhere to land.
    fireEvent.click(screen.getByRole("radio", { name: /as myself/i }));

    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.querySelector(href)).toBeNull();
  });

  it("keeps answers when moving backwards", () => {
    render(<CreateProfileFlow />);
    continueFlow();
    fillAccountStep();
    continueFlow();

    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    expect(screen.getByRole("textbox", { name: /full name/i })).toHaveValue(
      "Ada Lovelace",
    );
    expect(screen.getByLabelText("Password")).toHaveValue(PASSWORD);
  });
});
