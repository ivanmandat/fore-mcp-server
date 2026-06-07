#!/usr/bin/env node

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { startHttpServer } from "./http-server.js";
import { createForeMcpServer } from "./server.js";

function useHttpTransport(): boolean {
  return process.argv.includes("--http") || process.env.FORE_MCP_TRANSPORT === "http";
}

async function main(): Promise<void> {
  if (useHttpTransport()) {
    await startHttpServer();
    return;
  }

  const server = createForeMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("FORe MCP Server running on stdio");
}

main().catch(console.error);
