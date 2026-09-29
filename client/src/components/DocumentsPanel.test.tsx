import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { summary } from "../test/fixtures";
import DocumentsPanel from "./DocumentsPanel";

function setup(error: string | null = null) {
  const props = {
    documents: [summary(1, "a.docx"), summary(2, "b.docx")],
    selectedId: 2,
    loading: false,
    uploading: false,
    error,
    onSelect: vi.fn(),
    onUpload: vi.fn(),
    onDelete: vi.fn(),
  };
  render(<DocumentsPanel {...props} />);
  return props;
}

describe("DocumentsPanel", () => {
  it("uploads the chosen file", () => {
    const props = setup();
    const file = new File(["x"], "new.docx");
    fireEvent.change(screen.getByTestId("upload-input"), { target: { files: [file] } });
    expect(props.onUpload).toHaveBeenCalledWith(file);
  });

  it("selects and deletes documents; marks the selected one", async () => {
    const props = setup();
    expect(screen.getByRole("button", { name: /^b\.docx/ })).toHaveAttribute("aria-current", "true");
    await userEvent.click(screen.getByRole("button", { name: /^a\.docx/ }));
    expect(props.onSelect).toHaveBeenCalledWith(1);
  });

  it("asks for confirmation before deleting a document", async () => {
    const props = setup();
    await userEvent.click(screen.getByRole("button", { name: "Delete a.docx" }));
    expect(props.onDelete).not.toHaveBeenCalled();

    // "Keep" backs out without deleting
    await userEvent.click(screen.getByRole("button", { name: "Keep" }));
    expect(screen.queryByRole("button", { name: "Confirm delete a.docx" })).toBeNull();
    expect(props.onDelete).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole("button", { name: "Delete a.docx" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm delete a.docx" }));
    expect(props.onDelete).toHaveBeenCalledWith(props.documents[0]);
  });

  it("shows errors", () => {
    setup("Only .docx files are supported");
    expect(screen.getByRole("alert")).toHaveTextContent("Only .docx files are supported");
  });
});
