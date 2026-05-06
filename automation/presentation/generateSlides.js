/**
 * MCP – Google Slides Automation (STABLE MODE)
 * Uses Playwright bundled Chromium (NO Chrome conflicts)
 */

import { generateSlides } from "./slidesFromAI.js";
import { chromium } from "playwright";
import path from "path";
import os from "os";

(async () => {
  console.log("🤖 Generating slides from AI...");
  const topic = "Ethical Hacking Basics"; // later dynamic
  const slideData = await generateSlides(topic);

  console.log("🚀 Launching browser...");
  const context = await chromium.launchPersistentContext(
    path.join(os.homedir(), "mcp-playwright-profile"),
    { headless: false, viewport: null }
  );

  const page = await context.newPage();
  await page.goto("https://slides.google.com", { waitUntil: "networkidle" });

  // Create new presentation
  await page.click('text=Blank presentation');
  await page.waitForTimeout(3000);

  // Rename presentation
  await page.keyboard.press("Meta+A");
  await page.keyboard.type(slideData.title);

  console.log("📝 Presentation created:", slideData.title);

  // (Next step will insert slides automatically)
})();

