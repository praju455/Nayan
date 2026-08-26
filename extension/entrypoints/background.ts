import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { NayanAgent } from "../src/background/agent";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => console.info("Nayan installed: local privacy boundary enabled."));
  const agent = new NayanAgent();
  browser.runtime.onMessage.addListener(async (message: { type?: string; task?: string; serverUrl?: string; autoSubmitDemo?: boolean }) => {
    if (message.type === "NAYAN_START") {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !message.task) throw new Error("Open a webpage and provide a task first.");
      const isLocalDemo = tab.url?.startsWith("http://localhost:5173/") === true;
      if (message.autoSubmitDemo && !isLocalDemo) throw new Error("Auto-submit is available only for the local synthetic demo.");
      return agent.start(tab.id, message.task, message.serverUrl || "http://localhost:8000", message.autoSubmitDemo === true && isLocalDemo);
    }
    if (message.type === "NAYAN_CONFIRM") return agent.confirm();
    return undefined;
  });
});
