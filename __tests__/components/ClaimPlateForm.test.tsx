import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useActionState } from "react";
import ClaimPlateForm from "@/components/features/ClaimPlateForm";

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
    expect(screen.getByPlaceholderText("XX-AB-123")).toBeInTheDocument();
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

    expect(screen.getByText(/Ungültiges deutsches Kennzeichen/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kennzeichen registrieren/i })).toBeDisabled();
  });

  it("bietet bei mehrdeutiger Eingabe die Ortskürzel zur Wahl an", () => {
    render(
      <ClaimPlateForm
        action={jest.fn() as unknown as Parameters<typeof ClaimPlateForm>[0]["action"]}
      />,
    );

    const input = screen.getByLabelText(/Kennzeichen/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "KAB1234" } });

    expect(screen.getByText(/Mehrdeutig/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kennzeichen registrieren/i })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "KA-B-1234 · Karlsruhe" }));
    expect(input.value).toBe("KA-B-1234");
    expect(screen.getByText("Karlsruhe")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kennzeichen registrieren/i })).toBeEnabled();
  });

  it("setzt die Bindestriche beim Tippen selbst", () => {
    render(
      <ClaimPlateForm
        action={jest.fn() as unknown as Parameters<typeof ClaimPlateForm>[0]["action"]}
      />,
    );

    const input = screen.getByLabelText(/Kennzeichen/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "kaab1234" } });

    expect(input.value).toBe("KA-AB-1234");
    expect(screen.getByText("Karlsruhe")).toBeInTheDocument();
  });

  it("weist ein unbekanntes Ortskürzel ab", () => {
    render(
      <ClaimPlateForm
        action={jest.fn() as unknown as Parameters<typeof ClaimPlateForm>[0]["action"]}
      />,
    );

    fireEvent.change(screen.getByLabelText(/Kennzeichen/i), { target: { value: "XX-AB-123" } });

    expect(screen.getByText(/Unbekanntes Ortskürzel/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kennzeichen registrieren/i })).toBeDisabled();
  });

  it("enables submission for valid plates", () => {
    render(
      <ClaimPlateForm
        action={jest.fn() as unknown as Parameters<typeof ClaimPlateForm>[0]["action"]}
      />,
    );

    const input = screen.getByLabelText(/Kennzeichen/i);
    fireEvent.change(input, { target: { value: "KA-AB-1234" } });

    expect(screen.queryByText(/Ungültiges deutsches Kennzeichen/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Kennzeichen registrieren/i })).toBeEnabled();
  });

  it("renders the success message when the action reports success", () => {
    mockUseActionState.mockImplementation((action: unknown) => [{ success: true }, action, false]);

    render(
      <ClaimPlateForm
        action={jest.fn() as unknown as Parameters<typeof ClaimPlateForm>[0]["action"]}
      />,
    );

    return waitFor(() => {
      expect(screen.getByText(/Kennzeichen erfolgreich registriert/i)).toBeInTheDocument();
    });
  });

  it("meldet auch den zweiten Erfolg in Folge", () => {
    jest.useFakeTimers();
    const action = jest.fn() as unknown as Parameters<typeof ClaimPlateForm>[0]["action"];
    // Jede Antwort der Action ist ein neues Objekt, auch wenn `success` gleich bleibt.
    let state: { success: boolean } = { success: true };
    mockUseActionState.mockImplementation((a: unknown) => [state, a, false]);

    const { rerender } = render(<ClaimPlateForm action={action} />);
    act(() => jest.advanceTimersByTime(0));
    expect(screen.getByText(/Kennzeichen erfolgreich registriert/i)).toBeInTheDocument();

    act(() => jest.advanceTimersByTime(3000));
    expect(screen.queryByText(/Kennzeichen erfolgreich registriert/i)).not.toBeInTheDocument();

    state = { success: true };
    rerender(<ClaimPlateForm action={action} />);
    act(() => jest.advanceTimersByTime(0));
    expect(screen.getByText(/Kennzeichen erfolgreich registriert/i)).toBeInTheDocument();

    jest.useRealTimers();
  });
});
