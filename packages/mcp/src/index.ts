#!/usr/bin/env node
// Updraft MCP server. Read tools query the chain; build tools return unsigned transactions only.
//   updraft-mcp                 stdio (for desktop agents)
//   updraft-mcp --http 8787     Streamable HTTP at /mcp
import { createServer } from "node:http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { type Address, createPublicClient, http } from "viem";
import { type Deployment, createUpdraftClient, elysiumTestnet, elysiumTestnetDeployment } from "@updraft/sdk";
import { buildTools } from "./tools.js";

const RPC = process.env.ELYSIUM_RPC ?? "https://testnet-rpc.elysium.kinetiq.xyz";
const API = process.env.UPDRAFT_API ?? "https://api.updraft.example";
const deployment = (elysiumTestnetDeployment ?? JSON.parse(process.env.UPDRAFT_DEPLOYMENT ?? "null")) as Deployment | null;
if (!deployment) throw new Error("no deployment: build the SDK after deploying, or set UPDRAFT_DEPLOYMENT");

const chain = { ...elysiumTestnet, rpcUrls: { default: { http: [RPC] } } };
const publicClient = createPublicClient({ chain, transport: http(RPC) });
const updraft = createUpdraftClient({ publicClient, deployment });

function server() {
  const s = new McpServer({ name: "updraft", version: "0.1.0" });
  for (const tool of buildTools({ updraft, factory: deployment!.factory as Address, analysisUrl: `${API}/analysis` })) {
    s.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, async (args: Record<string, unknown>) => {
      const result = await tool.handler(args);
      return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
    });
  }
  return s;
}

const httpFlag = process.argv.indexOf("--http");
if (httpFlag === -1) {
  await server().connect(new StdioServerTransport());
} else {
  const port = Number(process.argv[httpFlag + 1] ?? 8787);
  createServer(async (req, res) => {
    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404).end();
      return;
    }
    // Stateless: a fresh server and transport per request.
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => transport.close());
    await server().connect(transport);
    await transport.handleRequest(req, res);
  }).listen(port, () => console.error(`updraft mcp on :${port}/mcp`));
}
