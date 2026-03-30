# _local-edr-002: Supported platforms

## Context and Problem Statement

filedist is used as a CLI, library, and self-installable package, but the project does not yet state its operating-system support policy explicitly. Contributors need a clear rule so implementation, tests, and docs do not drift into Unix-only assumptions.

Which operating systems must this project support?

## Decision Outcome

**Windows, macOS, and Linux are first-class supported platforms**

filedist must support Windows machines as well as macOS and Linux for its public workflows and core behavior.

### Implementation Details

- Public CLI and library behavior must work on Windows, macOS, and Linux.
- Contributors must prefer cross-platform Node.js and TypeScript APIs for paths, files, and process execution.
- New code must not assume POSIX-only path separators, shell syntax, or filesystem behavior when the same feature can be implemented in a cross-platform way.
- Tests that validate filesystem paths or command behavior must account for Windows differences when relevant.
- Public documentation and examples should prefer `pnpm`, `npm`, `npx`, and Node.js commands that work on Windows instead of Unix-specific shell constructs.
- If a maintainer-only workflow remains Unix-specific, that limitation must be documented explicitly and must not break the supported end-user workflows above.

## Considered Options

* (REJECTED) **Unix-only support** - Keep the project optimized for macOS and Linux only.
  * Reason: Conflicts with the need to support Windows users and would allow avoidable portability regressions.
* (CHOSEN) **Cross-platform support including Windows** - Treat Windows, macOS, and Linux as supported platforms.
  * Reason: Matches the project distribution model, keeps the CLI usable in common developer environments, and makes portability an explicit engineering requirement.