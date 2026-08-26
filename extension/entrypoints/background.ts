import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { NayanAgent } from "../src/background/agent";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => console.info("Nayan installed: local privacy boundary enabled."));
  const agent = new NayanAgent();
  browser.runtime.onMessage.addListener(async (message: { type?: string; task?: string; serverUrl?: string }) => {
    if (message.type === "NAYAN_START") {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !message.task) throw new Error("Open a webpage and provide a task first.");
      return agent.start(tab.id, message.task, message.serverUrl || "http://localhost:8000");
    }
    if (message.type === "NAYAN_CONFIRM") return agent.confirm();
    return undefined;
  });
});
