import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";

const projectRoot = new URL("../", import.meta.url);
const hostingSource = new URL(".openai/hosting.json", projectRoot);
const hostingOutput = new URL("dist/.openai/hosting.json", projectRoot);
const sitesConfiguration = new URL("dist/server/wrangler.json", projectRoot);

await mkdir(new URL("dist/.openai/", projectRoot), { recursive: true });
await copyFile(hostingSource, hostingOutput);

const hosting = JSON.parse(await readFile(hostingSource, "utf8"));
if (typeof hosting.project_id !== "string" || !hosting.project_id.startsWith("appgprj_")) {
  throw new Error("The Sites project identity is missing or malformed.");
}

await writeFile(
  sitesConfiguration,
  `${JSON.stringify({
    name: "in-keeping",
    main: "index.js",
    no_bundle: true,
    compatibility_date: "2026-08-20",
    assets: {
      directory: "../client",
      html_handling: "auto-trailing-slash",
      not_found_handling: "404-page",
    },
    observability: { enabled: false },
  }, null, 2)}\n`,
);
