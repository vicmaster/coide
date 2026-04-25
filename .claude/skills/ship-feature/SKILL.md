---
name: ship-feature
description: Test, commit all changes, move the feature from VISION.md roadmap to SHIPPED.md, update release notes, and push to origin
disable-model-invocation: false
argument-hint: [feature-description]
---

# Ship Feature

Wrap up a completed feature: ensure tests exist and pass, commit all changes, move it from VISION.md's roadmap into SHIPPED.md, add to release notes, and push.

## Instructions

1. Run `git status` and `git diff` to see all staged and unstaged changes
2. **Verify tests exist** for the feature:
   - Look at the changed/added files and identify any new store actions, utility functions, or event parsing logic
   - Check if corresponding test files already exist under `src/__tests__/`
   - If tests are missing for new logic, **write Vitest tests** before proceeding:
     - Store actions → `src/__tests__/store/`
     - Utility functions → `src/__tests__/utils/`
     - Follow the existing test patterns (see `sessions.test.ts`, `diff.test.ts`, `mcpParsing.test.ts` for examples)
   - Pure UI components without logic don't require tests, but any extracted logic they use does
3. **Run the full test suite** with `npx vitest run`
   - If any test fails, fix the issue and re-run until all tests pass
   - Do NOT proceed to commit if tests are failing
4. Read `VISION.md` and find the unchecked item (`- [ ]`) under `## Roadmap` that best matches: "$ARGUMENTS"
   - If no match is found, list the unchecked items and ask which one (or skip — polish/bug fixes don't always map to a roadmap item)
5. **Move the matched item to `SHIPPED.md`:**
   - Remove the `- [ ]` line from VISION.md's `## Roadmap` section
   - Append the item (without the `[ ]` checkbox, just `- Feature name — description`) to the appropriate section in `SHIPPED.md` (e.g. `## Core Roadmap (shipped)` or `## Copycat — Features parity with Claude Code CLI (shipped)`); if no section fits, add to a `## Misc (shipped)` section, creating it if absent
   - If step 4 was skipped (no roadmap match), do NOT touch VISION.md or SHIPPED.md in this step
6. **Update release notes** in `src/renderer/src/data/releaseNotes.ts`:
   - **Always append** a one-line description to the **first entry's** `notes` array (regardless of what version it shows — the release script renames it on release)
   - Keep note descriptions concise (under 80 chars), user-facing language (not implementation details)
7. Stage all relevant changed files (including the VISION.md/SHIPPED.md updates, release notes update, and any new test files)
8. Write a commit message that describes the feature work done (based on the actual code changes), NOT just "mark as done"
9. Commit and push to origin
