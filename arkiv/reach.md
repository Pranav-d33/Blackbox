# Reach and plans (judging: "user reach and sustained building")

**Who uses it.** Every party in an inspection that does not run the drone: the asset owner, the insurer, the module maker facing a warranty claim, and (for bridges and roads) the public. Today they get a PDF from the contractor. With Blackbox they open the analytics view, or query Arkiv directly with the queries in [schema.md](schema.md), and every row points at a proof on 0G.

**How it scales.** One finding per decision, a few hundred bytes each; a 136-module farm inspected weekly is ~7,000 findings a year. The register is one entity per asset. Arkiv's batches carry many entities per transaction (`executeBatch`), and expiration keeps the hot set bounded.

**Next.**
1. Mainnet Arkiv once it is live, with the same schema.
2. Repair crews writing a `blackbox.repair` entity from their own wallet (claimed fix), and the next inspection confirming or refuting it, so "is it fixed?" becomes a query.
3. An insurer view: defect rate per maker and batch across sites, from the same entities.
4. Extending (`extendEntity`) findings that are still open, so an unresolved defect never ages out of the working set.
