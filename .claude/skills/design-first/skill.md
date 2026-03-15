---
name: design-first
description: Create a Pencil mockup before implementing any UI feature or enhancement. Design first, code second.
argument-hint: <feature-description>
---

# Design First

Create a visual mockup in Pencil before writing any implementation code. This ensures alignment on layout, spacing, and UX before committing to code.

## When to Use

- New UI features or components
- Redesigns or layout changes
- Feature enhancements that affect visual layout
- Any time you're unsure how something should look

## Instructions

1. **Understand the current state**
   - Read the relevant component files to understand what exists today
   - If this is an enhancement, take note of existing structure, spacing, and patterns

2. **Set up Pencil**
   - Call `get_editor_state()` to check the current canvas
   - Open a new `.pen` file with `open_document("new")` — keep mockups separate from other designs
   - Call `get_guidelines("web-app")` for structural design rules
   - Call `get_style_guide_tags()` then `get_style_guide(tags)` with tags matching coide's aesthetic: `dark-mode`, `devtools`, `minimal`, `monospace`, `webapp`, `developer`, `functional`

3. **Build the mockup**
   - Create frames representing the UI states (e.g., empty state, populated state, active state)
   - Use coide's visual language: dark backgrounds (#111111, #0A0A0A), subtle borders (#1a1a1a, #ffffff0f), JetBrains Mono for UI text, muted white text colors
   - Show realistic sample data — not lorem ipsum
   - Keep to max 25 operations per `batch_design` call
   - Take a `get_screenshot()` after each major section to verify visually

4. **Review with user**
   - Present the screenshot(s) and explain the design decisions
   - Wait for user feedback or approval before proceeding
   - Iterate on the mockup if changes are requested

5. **Implement only after approval**
   - Once the user approves, proceed to code implementation
   - Reference the mockup for exact spacing, colors, and layout decisions
   - The mockup is the source of truth for the visual design

## Design Tokens (coide defaults)

Use these unless the style guide suggests otherwise:

- **Backgrounds**: `#0A0A0A` (page), `#111111` (panels), `#ffffff06` (cards)
- **Borders**: `#1a1a1a`, `#ffffff0f`, `#1f1f1f`
- **Text**: `#ffffffcc` (primary), `#ffffff80` (secondary), `#ffffff4d` (muted), `#ffffff33` (labels)
- **Accents**: `#10B981` (success/active), `#3b82f6` (info/running), `#ef4444` (error), `#f59e0b` (warning)
- **Fonts**: JetBrains Mono (UI), IBM Plex Mono (descriptions)
- **Font sizes**: 10px (labels), 11px (tabs/items), 12px (body), 14-16px (headings)
- **Corner radius**: 4px (buttons/tabs), 6px (cards)
