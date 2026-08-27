import { describe, expect, it } from "vitest";
import { personMatchesFromNerOutput } from "../src/pii/local-ner";

describe("local NER post-processing", () => {
  it("reconstructs WordPiece person entities before tokenization", () => {
    const text = "Aarav Sharma completed the request.";
    const matches = personMatchesFromNerOutput(text, [
      { entity: "B-PER", score: 0.91, word: "aa" },
      { entity: "B-PER", score: 0.92, word: "##ra" },
      { entity: "B-PER", score: 0.94, word: "##v" },
      { entity: "I-PER", score: 0.95, word: "sharma" },
      { entity: "O", score: 0.99, word: "completed" },
    ]);
    expect(matches).toEqual([{ category: "PERSON_NAME", value: "aarav sharma", start: 0, end: 12, confidence: 0.91 }]);
  });

  it("does not redact low-confidence entities", () => {
    expect(personMatchesFromNerOutput("Priya", [{ entity: "B-PER", score: 0.7, word: "priya" }])).toEqual([]);
  });
});
