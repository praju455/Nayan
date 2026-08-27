import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";
import { NayanAgent } from "../src/background/agent";
import { allowSite, isSiteAllowed } from "../src/policy/site-policy";
import { selectTaskTab } from "../src/policy/task-tab";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => console.info("Nayan installed: local privacy boundary enabled."));
  const agent = new NayanAgent();
  browser.runtime.onMessage.addListener(async (message: { type?: string; task?: string; serverUrl?: string; autoSubmitDemo?: boolean; draftText?: string; recipient?: string }) => {
    if (message.type === "NAYAN_ALLOW_CURRENT_SITE") {
      const tabs = await browser.tabs.query({ currentWindow: true });
      const tab = selectTaskTab(tabs, message.task || "");
      if (!tab?.id || !tab.url) throw new Error("Open a regular website or name an already-open site in the task first.");
      await browser.tabs.update(tab.id, { active: true });
      return { origin: await allowSite(tab.url) };
    }
    if (message.type === "NAYAN_START") {
      if (!message.task) throw new Error("Provide a task first.");
      const tabs = await browser.tabs.query({ currentWindow: true });
      const tab = selectTaskTab(tabs, message.task);
      if (!tab?.id) throw new Error("Open a regular website or name an already-open site in the task first.");
      if (!tab.url || !(await isSiteAllowed(tab.url))) throw new Error("This site is not approved. Select ‘Allow current site’ before starting Nayan.");
      await browser.tabs.update(tab.id, { active: true });
      const isLocalDemo = tab.url?.startsWith("http://localhost:5173/") === true;
      if (message.autoSubmitDemo && !isLocalDemo) throw new Error("Auto-submit is available only for the local synthetic demo.");
      return agent.start(tab.id, message.task, message.serverUrl || "http://localhost:8000", message.autoSubmitDemo === true && isLocalDemo, message.draftText, message.recipient);
    }
    if (message.type === "NAYAN_CONFIRM") return agent.confirm();
    return undefined;
  });
});
