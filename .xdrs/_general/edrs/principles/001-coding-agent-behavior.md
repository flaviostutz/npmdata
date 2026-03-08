# _general-edr-001: AI coding agent behavior

## Context and Problem Statement

AI coding agents (such as GitHub Copilot) require clear guidelines about expected behavior to ensure consistency, proper verification of work, and respect for developer workflows.

What behavioral standards should AI coding agents follow when working on code?

## Decision Outcome

**AI agents must follow a defined instruction hierarchy, verify work with automated checks, and defer git operations to developers**

Clear behavior standards ensure consistency through EDR compliance, maintain code quality through automated verification, and respect the developer's role in version control decisions.

### Implementation Details

**Mandatory behaviors for AI coding agents:**

1. **Always consult XDRs before making implementation decisions**
   - Follow coding agent behavior and decision hierarchy rules in [.xdrs/_general/edrs/principles/001-coding-agent-behavior.md](.xdrs/_general/edrs/principles/001-coding-agent-behavior.md)
   - Search for XDRs in [.xdrs/index.md](.xdrs/index.md) during design, plan and implementation steps
   - Follow XDRs as the source of truth for all decisions and procedures

2. **Verify all work with build, tests and linting before completion**
   - Always run `make build`, `make lint-fix` and `make test` at the end of the implementation
   - Fix any issues

3. **Verify if implementation complies with XDRs**
   - Re-analyse your work against the XDRs and ensure implementation decisions follow guidelines and patterns


## Considered Options

* (REJECTED) **Minimal guidance** - Let agents operate with default behavior
  * Reason: Results in inconsistent code quality, missed verification steps, and developers losing control of git workflow
* (CHOSEN) **EDR-compliant agents** - Clear behavior standards
  * Reason: Ensures consistency through EDR compliance, maintains code quality through verification, and respects developer control of version control
