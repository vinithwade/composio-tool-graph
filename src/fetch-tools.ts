import { Composio } from "@composio/core";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

const TOOLKITS = ["googlesuper", "github"] as const;
const OUT_DIR = "data";

async function main() {
  const composio = new Composio();
  await mkdir(OUT_DIR, { recursive: true });

  const all: Record<string, unknown[]> = {};

  for (const toolkit of TOOLKITS) {
    console.log(`Fetching tools for toolkit: ${toolkit}`);
    const tools = await composio.tools.getRawComposioTools({
      toolkits: [toolkit],
      limit: 1000,
    });
    console.log(`  -> ${tools.length} tools`);
    all[toolkit] = tools;
    await writeFile(
      join(OUT_DIR, `${toolkit}_tools.json`),
      JSON.stringify(tools, null, 2),
      "utf-8",
    );
  }

  await writeFile(
    join(OUT_DIR, "all_tools.json"),
    JSON.stringify(all, null, 2),
    "utf-8",
  );

  const totals = Object.entries(all)
    .map(([k, v]) => `${k}=${v.length}`)
    .join(", ");
  console.log(`Done. Wrote ${OUT_DIR}/{toolkit}_tools.json and all_tools.json (${totals}).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
