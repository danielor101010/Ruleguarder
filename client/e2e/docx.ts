import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow } from "docx";

/**
 * Builds a tiny .docx at test time (no binary fixture in git): a heading, two paragraphs and a 2x2 table.
 * `marker` makes the text unique per test run so assertions never match another run's document.
 */
export async function buildDocx(marker: string): Promise<Buffer> {
  const cell = (text: string) => new TableCell({ children: [new Paragraph(text)] });
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: "Performance", heading: HeadingLevel.HEADING_1 }),
          new Paragraph("Intro paragraph. Nothing to flag here."),
          // Filler pushes the target below the fold, so the E2E test proves the scroll
          ...Array.from({ length: 40 }, (_, i) => new Paragraph(`Filler paragraph ${i + 1}.`)),
          new Paragraph(`The detection range is ${marker} km in clear weather.`),
          new Table({
            rows: [
              new TableRow({ children: [cell("Parameter"), cell("Value")] }),
              new TableRow({ children: [cell("Latency"), cell("2 seconds")] }),
            ],
          }),
        ],
      },
    ],
  });
  return Packer.toBuffer(doc);
}
