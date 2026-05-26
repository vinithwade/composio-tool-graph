/**
 * LLM-assisted dependency analyzer.
 *
 * For each tool, ask an LLM (via OpenRouter) which OTHER tools in the same toolkit
 * could supply each required input parameter. Outputs data/graph.json.
 */

import { writeFile, mkdir, readFile } from "fs/promises";
import { join } from "path";

const MODEL = process.env.OPENROUTER_MODEL ?? "google/gemini-2.5-flash";
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE ?? 25);
const PARALLELISM = Number(process.env.PARALLELISM ?? 6);
const OUT_DIR = "data";

type Tool = {
  slug: string;
  name: string;
  description: string;
  inputParameters: any;
  outputParameters: any;
  toolkit: { slug: string; name: string };
  isDeprecated?: boolean;
};

type ParamInfo = {
  name: string;
  type: string;
  description?: string;
  required: boolean;
};

type Edge = {
  source: string;
  target: string;
  parameter: string;
  rationale: string;
};

type LLMDependency = {
  param: string;
  kind: "user_supplied" | "produced_by_tool";
  rationale: string;
  producers: string[];
};

type LLMResult = {
  tool_slug: string;
  dependencies: LLMDependency[];
};

async function loadEnv() {
  const text = await readFile(".env", "utf-8");
  for (const line of text.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m && m[1] && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function summarizeInput(input: any): ParamInfo[] {
  if (!input || input.type !== "object" || !input.properties) return [];
  const required: string[] = input.required ?? [];
  return Object.entries(input.properties as Record<string, any>).map(([name, prop]) => ({
    name,
    type: (prop?.type as string) ?? (prop?.$ref ? "object" : "any"),
    description: typeof prop?.description === "string" ? prop.description : undefined,
    required: required.includes(name),
  }));
}

function compactToolLine(t: Tool): string {
  const params = summarizeInput(t.inputParameters);
  const required = params
    .filter((p) => p.required)
    .map((p) => p.name)
    .join(",");
  const desc = (t.description || "").replace(/\s+/g, " ").trim().slice(0, 180);
  return `- ${t.slug} | ${desc} | required:[${required}]`;
}

function fullToolBlock(t: Tool): string {
  const params = summarizeInput(t.inputParameters);
  const required = params.filter((p) => p.required);
  if (required.length === 0) return ""; // nothing to depend on
  const lines = required.map(
    (p) =>
      `    - ${p.name} (${p.type}): ${(p.description || "").replace(/\s+/g, " ").trim().slice(0, 220)}`,
  );
  return `### ${t.slug}\n  description: ${(t.description || "").replace(/\s+/g, " ").trim().slice(0, 280)}\n  required inputs:\n${lines.join("\n")}`;
}

function buildPrompt(catalog: string, toolkit: string, blocks: string[]): string {
  return `You are analyzing the Composio "${toolkit}" toolkit to build a dependency graph between tools.

For each TARGET tool below, examine its required input parameters and decide, for EACH required input:
  (a) whether the user almost always supplies it directly (e.g., a free-text body, a search query, the user's own org/repo/owner that they choose), OR
  (b) whether it is an opaque identifier or value that an agent would need to FETCH from another tool first (e.g., an internal id like thread_id, message_id, comment_id, file_id, that the user does not memorize).
If (b), list the most likely PRODUCER tools from the catalog whose output would contain a value usable for this parameter. Producers are typically LIST/SEARCH/GET/CREATE-style tools that return objects whose ids/values match the required parameter. Only include producers whose slug appears in the catalog.

Important rules:
- Do NOT return tools that are unrelated. Be precise.
- "owner", "repo", "org", "username" on GitHub are typically user-supplied (the user knows their own/target repo). Mark them as user_supplied unless context strongly suggests fetching (e.g., "list orgs the user belongs to" might supply org).
- Free-text fields (body, message, content, title, description, query, q) are user_supplied.
- Opaque ids (thread_id, message_id, comment_id, run_id, hook_id, gist_id, file_id, document_id, spreadsheet_id, calendar_id, event_id, draft_id, conference_record_id, presentation_id, package_version_id, etc.) are produced_by_tool.
- Return AT MOST 6 producer slugs per parameter, ordered by best fit first.
- Use the EXACT slug strings from the catalog.

CATALOG (toolkit "${toolkit}", compact form):
${catalog}

TARGET TOOLS TO ANALYZE:
${blocks.join("\n\n")}

Output strictly a single JSON object of this shape (no markdown, no commentary):
{
  "results": [
    {
      "tool_slug": "<one of the targets>",
      "dependencies": [
        {
          "param": "<required param name>",
          "kind": "user_supplied" | "produced_by_tool",
          "rationale": "<short reason, <=160 chars>",
          "producers": ["<producer slug>", ...]
        }
      ]
    }
  ]
}`;
}

async function callLLM(prompt: string, attempt = 1): Promise<{ results: LLMResult[] }> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not set");

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/composio/dep-graph",
      "X-Title": "composio-dep-graph",
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: "Output only valid JSON. No prose, no markdown fences." },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    if (attempt < 3) {
      console.warn(`LLM call failed (${res.status}); retrying. body=${text.slice(0, 400)}`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return callLLM(prompt, attempt + 1);
    }
    throw new Error(`OpenRouter error ${res.status}: ${text}`);
  }

  const data: any = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error(`no content in response: ${JSON.stringify(data).slice(0, 400)}`);

  try {
    return JSON.parse(content);
  } catch {
    // Try to extract JSON
    const match = content.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    if (attempt < 3) {
      console.warn(`JSON parse failed; retrying. content=${content.slice(0, 300)}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
      return callLLM(prompt, attempt + 1);
    }
    throw new Error(`failed to parse LLM JSON: ${content.slice(0, 400)}`);
  }
}

async function processToolkit(toolkit: string, tools: Tool[]) {
  console.log(`\n=== Analyzing toolkit "${toolkit}" (${tools.length} tools) ===`);
  const slugSet = new Set(tools.map((t) => t.slug));
  const catalog = tools.map(compactToolLine).join("\n");

  const targets = tools.filter((t) => {
    const params = summarizeInput(t.inputParameters);
    return params.some((p) => p.required);
  });
  console.log(`  ${targets.length} tools have required inputs to analyze`);

  const chunks: Tool[][] = [];
  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    chunks.push(targets.slice(i, i + CHUNK_SIZE));
  }
  console.log(`  split into ${chunks.length} chunks of up to ${CHUNK_SIZE} tools`);

  const allResults: LLMResult[] = [];
  let done = 0;

  // Process chunks with parallelism
  for (let i = 0; i < chunks.length; i += PARALLELISM) {
    const batch = chunks.slice(i, i + PARALLELISM);
    const settled = await Promise.allSettled(
      batch.map(async (chunk, idx) => {
        const blocks = chunk.map(fullToolBlock).filter(Boolean);
        const prompt = buildPrompt(catalog, toolkit, blocks);
        try {
          const out = await callLLM(prompt);
          return out.results ?? [];
        } catch (err) {
          console.error(`  chunk ${i + idx} failed:`, (err as Error).message);
          return [];
        }
      }),
    );
    for (const s of settled) {
      if (s.status === "fulfilled") allResults.push(...s.value);
    }
    done += batch.length;
    console.log(`  chunks done: ${done}/${chunks.length}`);
  }

  // Convert results to edges
  const edges: Edge[] = [];
  for (const r of allResults) {
    if (!r?.tool_slug || !slugSet.has(r.tool_slug)) continue;
    for (const dep of r.dependencies ?? []) {
      if (dep.kind !== "produced_by_tool") continue;
      const producers = dep.producers ?? [];
      for (const p of producers) {
        if (!slugSet.has(p)) continue;
        if (p === r.tool_slug) continue;
        edges.push({
          source: p,
          target: r.tool_slug,
          parameter: dep.param,
          rationale: (dep.rationale || "").slice(0, 200),
        });
      }
    }
  }

  // De-dupe edges (source,target,parameter)
  const seen = new Set<string>();
  const dedup: Edge[] = [];
  for (const e of edges) {
    const key = `${e.source}|${e.target}|${e.parameter}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(e);
  }

  console.log(`  edges: ${edges.length} raw, ${dedup.length} deduped`);

  // Save raw LLM results for debugging
  await writeFile(
    join(OUT_DIR, `analysis_${toolkit}.json`),
    JSON.stringify({ results: allResults, edges: dedup }, null, 2),
    "utf-8",
  );

  return { tools, edges: dedup };
}

async function main() {
  await loadEnv();
  await mkdir(OUT_DIR, { recursive: true });

  const all = JSON.parse(await readFile(join(OUT_DIR, "all_tools.json"), "utf-8")) as Record<string, Tool[]>;

  const allNodes: any[] = [];
  const allEdges: Edge[] = [];

  for (const [toolkit, tools] of Object.entries(all)) {
    const { edges } = await processToolkit(toolkit, tools);
    for (const t of tools) {
      const params = summarizeInput(t.inputParameters);
      allNodes.push({
        id: t.slug,
        label: t.slug,
        name: t.name,
        toolkit,
        description: (t.description || "").trim(),
        requiredInputs: params.filter((p) => p.required).map((p) => p.name),
        allInputs: params.map((p) => p.name),
        deprecated: !!t.isDeprecated,
      });
    }
    allEdges.push(...edges);
  }

  const graph = { nodes: allNodes, edges: allEdges };
  await writeFile(join(OUT_DIR, "graph.json"), JSON.stringify(graph, null, 2), "utf-8");
  console.log(`\nFinal: ${allNodes.length} nodes, ${allEdges.length} edges. Wrote ${OUT_DIR}/graph.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
