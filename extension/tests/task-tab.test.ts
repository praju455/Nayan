import { describe, expect, it } from "vitest";
import { selectMatchingTaskTab, selectTaskTab } from "../src/policy/task-tab";

describe("task tab selection", () => {
  it("selects an already-open website named in the task over a Chrome internal tab", () => {
    const selected = selectTaskTab([
      { id: 1, url: "chrome://newtab/", title: "New Tab", active: true },
      { id: 2, url: "https://www.instagram.com/direct/inbox/", title: "Instagram • Messages", active: false },
    ], 'Open Instagram, then open the chat named dii_yeahhh and type "hi".');
    expect(selected?.id).toBe(2);
  });

  it("does not mistake an unrelated open site for a requested destination", () => {
    const selected = selectMatchingTaskTab([
      { id: 1, url: "https://www.youtube.com/", title: "YouTube", active: false },
      { id: 2, url: "https://www.linkedin.com/feed/", title: "LinkedIn", active: false },
    ], "Open Instagram and find my messages.");
    expect(selected).toBeUndefined();
  });
});
