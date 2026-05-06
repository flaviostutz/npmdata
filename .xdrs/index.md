# XDR Standards Index

This index points to all type- and scope-specific XDR indexes. XDRs (Decision Records) cover Architectural (ADR), Business (BDR), and Engineering (EDR) decisions. Each scope has its own canonical index that lists all XDRs for that scope, organized by subject.

## Scope Indexes

XDRs in scopes listed last override the ones listed first

### _core

XDR framework standards — how decision records, skills, research, articles, and plans are structured, written, versioned, and discovered.

[View _core Scope Overview](_core/index.md)

---

### agentme

Curated library of XDRs and skills encoding best practices for AI coding agents.

[View agentme Scope Overview](agentme/index.md)

---

### _local (reserved)

Project-local XDRs that must not be shared with other contexts. Always keep this scope last so its decisions override or extend all scopes listed above. Keep `_local` canonical indexes in the workspace tree only; do not link them from this shared index. Readers and tools should still try to discover existing `_local` indexes in the current workspace by default. Documents in non-`_local` scopes must never link into `_local`; only `_local` documents may link to other `_local` documents.
