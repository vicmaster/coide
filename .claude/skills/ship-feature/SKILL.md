---
name: ship-feature
description: Commit all changes, mark the feature done in VISION.md, and push to origin
disable-model-invocation: true
argument-hint: [feature-description]
---

# Ship Feature

Wrap up a completed feature: commit all changes, mark it done in VISION.md, and push.

## Instructions

1. Run `git status` and `git diff` to see all staged and unstaged changes
2. Read `VISION.md` and find the unchecked item (`- [ ]`) that best matches: "$ARGUMENTS"
   - If no match is found, list the unchecked items and ask which one to mark
3. Change `- [ ]` to `- [x]` for the matched item in VISION.md
4. Stage all relevant changed files (including the VISION.md update)
5. Write a commit message that describes the feature work done (based on the actual code changes), NOT just "mark as done"
6. Commit and push to origin
