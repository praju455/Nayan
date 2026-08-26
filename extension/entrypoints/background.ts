import { defineBackground } from "wxt/utils/define-background";
import { browser } from "wxt/browser";

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => console.info("Nayan installed: local privacy boundary enabled."));
});
