---
name: copycat
description: Research new Claude Code features, compare against coide's VISION.md, and suggest what to add to the roadmap
argument-hint: [optional: specific area to focus on, e.g. "MCP" or "permissions"]
---

# Copycat — Claude Code Feature Scout

Find what's new in Claude Code that coide doesn't have yet, assess feasibility, and update the roadmap.

## Instructions

1. **Research what's new in Claude Code**
   - Web search for recent Claude Code updates, changelogs, release notes, blog posts
   - Search queries like: "Claude Code new features", "Claude Code changelog", "Claude Code update", "Anthropic Claude Code release"
   - If "$ARGUMENTS" is provided, focus the search on that specific area
   - Look at the official docs: https://docs.anthropic.com/en/docs/claude-code

2. **Read coide's current state**
   - Read `VISION.md` to understand what's already built (checked items) and what's planned (unchecked items)
   - Skim key implementation files if needed to understand current capabilities

3. **Compare and identify gaps**
   - List every Claude Code feature found in research
   - For each, mark whether coide: ✅ already has it, 🟡 has it partially, or ❌ doesn't have it
   - Focus on the ❌ and 🟡 items

4. **Assess feasibility for each gap**
   - **Easy**: Can be built with existing architecture, no new dependencies
   - **Medium**: Requires new dependencies or moderate refactoring
   - **Hard**: Requires significant architecture changes or new Electron capabilities
   - Briefly explain why (1-2 sentences)

5. **Present findings to the user**
   - Show a summary table: Feature | Status | Feasibility | Notes
   - Highlight the most impactful features to add
   - Ask the user which ones they'd like to add to VISION.md

6. **Update VISION.md**
   - Add user-approved features as `- [ ]` items under the appropriate section (Next Up / Later / Future)
   - Use the same format as existing items: `- [ ] Feature name — brief description`
   - Do NOT remove or modify any existing items
