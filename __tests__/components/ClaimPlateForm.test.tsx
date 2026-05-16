import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ClaimPlateForm from "@/components/features/ClaimPlateForm";
import { useActionState } from "react";

jest.mock("react", () => {
  const actual = jest.requireActual("react");
  return {
    ...actual,
    useActionState: jest.fn(),
  };
});

const mockUseActionState = useActionState as jest.Mock;

describe("ClaimPlateForm", () => {
  beforeEach(() => {
    mockUseActionState.mockImplementation((action: unknown, initialState: unknown) => [
      initialState,
      action,
      false,
    ]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders the form elements", () => {
    render(
      <ClaimPlateForm
        action={jest.fn() as unknown as Parameters<typeof ClaimPlateForm>[0]["action"]}
      />,
    );

    expect(screen.getByLabelText(/Kennzeichen/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/KA-AB-1234/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kennzeichen registrieren/i })).toBeInTheDocument();
  });

  it("shows client-side validation for invalid plates", () => {
    render(
      <ClaimPlateForm
        action={jest.fn() as unknown as Parameters<typeof ClaimPlateForm>[0]["action"]}
      />,
    );

    const input = screen.getByLabelText(/Kennzeichen/i);
    fireEvent.change(input, { target: { value: "invalid-plate" } });

    expect(
      screen.getByText(/Ungültiges Kennzeichen/i),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Kennzeichen registrieren/i }),
    ).toBeDisabled();
  });

  it("enables submission for valid plates", () => {
    render(
      <ClaimPlateForm
        action={jest.fn() as unknown as Parameters<typeof ClaimPlateForm>[0]["action"]}
      />,
    );

    const input = screen.getByLabelText(/Kennzeichen/i);
    fireEvent.change(input, { target: { value: "KA-AB-1234" } });

    expect(
      screen.queryByText(/Ungültiges Kennzeichen/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Kennzeichen registrieren/i }),
    ).toBeEnabled();
  });

  it("renders the success message when the action reports success", () => {
    mockUseActionState.mockImplementation((action: unknown) => [
      { success: true },
      action,
      false,
    ]);

    render(
      <ClaimPlateForm
        action={jest.fn() as unknown as Parameters<typeof ClaimPlateForm>[0]["action"]}
      />,
    );

    return waitFor(() => {
      expect(
        screen.getByText(/Kennzeichen erfolgreich registriert/i),
      ).toBeInTheDocument();
    });
  });
});
