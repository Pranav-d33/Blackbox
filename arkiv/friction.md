# Arkiv friction log

Notes from integrating `@arkiv-network/sdk` 1.0.1 into Blackbox at ETHGlobal Mumbai, in the order we hit them.

1. **Two testnet names in circulation.** Search results and older docs point at Kaolin and Mendoza (`mendoza.hoodi.arkiv.network`); the prize page and SDK use Rabdi (`rpc.rabdi.db-chain.testnet.arkiv.network`, chain `7794095`). One canonical "current testnet" line at the top of the docs would save a detour.
2. **Max lifetime is easy to miss.** `MAX_LIFETIME` is 7,884,000 s (~91 days) and is only discoverable from the SDK export. It decides whether Arkiv can be an archive (it can't, by design), so it belongs on the introduction page.
3. **Typed values in writes, plain values in some places.** `str` columns take plain strings, but `u64` needs `u64(…)` even for a bigint (`Column "seq": a u64 column, but the value is a u256`). The error is clear; a sentence in "Create entities" would prevent it.
4. **Pagination.** The docs mention `for await` and `next`; on 1.0.1 `fetch()` returns one page, and we paged with `.limit(100).offset(n)` plus `skipped`. An example of "read everything matching" would help.
5. **Optional filters.** `where(undefined)` does not typecheck, so "all missions" needed `exists("mission")` as a stand-in. A no-op predicate or an optional `where` would be cleaner.
6. **No joins**, so we denormalize the asset register's maker/model/batch into each finding. That's fine, but a note in the schema docs on "copy what you filter by" would set expectations.
7. **Faucet needs a browser.** We could not script funding a fresh key; for CI and demos a rate-limited faucet API would help.
8. **Bundle size.** Adding the SDK (with viem) took our browser verifier from 266 KB to 634 KB. A read-only entry point without wallet code would be welcome.
9. **Faucet wallet connect failed.** On the hub faucet, clicking MetaMask or WalletConnect errored before the connect screen; we funded a MetaMask wallet another way and forwarded tGLM to the app's key. A paste-an-address faucet would avoid this.
10. **Batch gas is high relative to the faucet.** A batch of 40 small register entities used ~12M gas (~300k per entity). Fine on testnet, but a first funding of a fresh owner key at 0.02 tGLM ran out after one batch; documenting typical gas per entity would help budget.
11. **Patch shape.** `executeBatch` patches take `set: {…}`, not `values`; the error ("has nothing to apply. Pass set…") was clear and fast to fix.
