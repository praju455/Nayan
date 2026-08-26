import { defineConfig } from "wxt";

export default defineConfig({
  manifest: {
    name: "Nayan — Privacy Browser Agent",
    description: "On-device perception and local PII sanitization for browser agents.",
    permissions: ["activeTab", "tabs", "storage", "scripting"],
    host_permissions: ["http://localhost:8000/*"],
    action: { default_title: "Nayan" }
  }
});
