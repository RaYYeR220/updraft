# MCP server

`@updraft/mcp` lets an agent read Updraft rounds and prepare transactions for a person to sign. It never holds keys and never sends anything.

## Tools

| Tool | What it returns |
|---|---|
| `updraft_list_rounds` | Every round the factory created |
| `updraft_get_round` | One round's config, status, totals, participants, fire preview, and the token, pool and vault once it fires |
| `updraft_preview_price` | What everyone would pay if `amount` more were committed now |
| `updraft_get_certificate` | A token's launch certificate |
| `updraft_bottom_of_curve` | The bottom-of-curve study ([ANALYSIS.md](ANALYSIS.md)) |
| `updraft_build_commit_tx` | Unsigned `approve` and `commit` transactions for an Open round |
| `updraft_build_create_round_tx` | An unsigned `createRound` transaction |

Before a round tool does anything, it checks that the address is a round the factory created. A look-alike contract gets `not_an_updraft_round`. The commit builder also checks that the round is live, inside its commit window, and in Open mode. A Verified round needs a voucher that only the wallet's owner can request. That way an agent never hands back a commit that is bound to revert, or one aimed at a contract that only looks like a round.

## Run

```sh
pnpm --filter @updraft/sdk build && pnpm --filter @updraft/mcp build

# stdio, for desktop agents
node packages/mcp/dist/index.js

# Streamable HTTP at /mcp
node packages/mcp/dist/index.js --http 8787
```

Example client config (stdio):

```json
{
  "mcpServers": {
    "updraft": { "command": "node", "args": ["/path/to/updraft/packages/mcp/dist/index.js"] }
  }
}
```

Environment, all optional:

| Variable | Default |
|---|---|
| `ELYSIUM_RPC` | `https://testnet-rpc.elysium.kinetiq.xyz` |
| `UPDRAFT_API` | The live API |
| `UPDRAFT_DEPLOYMENT` | The deployment bundled with the SDK |

`packages/mcp/Dockerfile` builds the HTTP server as a container.
