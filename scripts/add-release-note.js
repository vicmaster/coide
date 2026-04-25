#!/usr/bin/env node

/**
 * Promotes the 'next' release-notes entry to a real version on `npm version`.
 * Run automatically by the `version` npm lifecycle hook after `npm version`
 * bumps package.json.
 *
 * Workflow:
 *   - The first entry in RELEASE_NOTES is always a sentinel { version: 'next', notes: [] }.
 *     ship-feature appends new notes to it during the dev cycle.
 *   - On release, this script:
 *       1. Renames the 'next' entry to the new version + sets today's date.
 *       2. Prepends a fresh empty 'next' entry for the next dev cycle.
 *
 * The renderer's ReleaseNotesModal hides any entry whose version === 'next',
 * so an empty sentinel never reaches users.
 */

const fs = require('fs')
const path = require('path')

const NEXT_ENTRY_REGEX = /(\{\s*\n\s*(?:\/\/[^\n]*\n\s*)*)version: 'next',\s*\n\s*date: '[^']*'/
const ARRAY_START_MARKER = 'export const RELEASE_NOTES: ReleaseNote[] = [\n'
const FRESH_NEXT_ENTRY = `  {\n    version: 'next',\n    date: '',\n    notes: []\n  },\n`

/**
 * Pure transform: given the current releaseNotes.ts content, returns the
 * new content with 'next' renamed to `newVersion` and a fresh 'next'
 * entry prepended. Throws on malformed input.
 *
 * Returns { content, skipped: true } if newVersion already exists in the file.
 */
function transformReleaseNotes(content, newVersion, date) {
  if (new RegExp(`version: '${newVersion.replace(/\./g, '\\.')}'`).test(content)) {
    return { content, skipped: true }
  }
  if (!NEXT_ENTRY_REGEX.test(content)) {
    throw new Error(
      "Couldn't find the 'next' entry in releaseNotes.ts. " +
        "The first entry must be { version: 'next', date: '', notes: [...] }."
    )
  }
  if (!content.includes(ARRAY_START_MARKER)) {
    throw new Error("Couldn't find the RELEASE_NOTES array start marker.")
  }

  let next = content.replace(
    NEXT_ENTRY_REGEX,
    (_m, prefix) => `${prefix}version: '${newVersion}',\n    date: '${date}'`
  )
  next = next.replace(ARRAY_START_MARKER, ARRAY_START_MARKER + FRESH_NEXT_ENTRY)
  return { content: next, skipped: false }
}

module.exports = { transformReleaseNotes }

// CLI entrypoint — only runs when invoked directly via `node`, not when imported.
if (require.main === module) {
  const { execSync } = require('child_process')
  const pkgPath = path.join(__dirname, '..', 'package.json')
  const notesPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'data', 'releaseNotes.ts')

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
  const newVersion = pkg.version
  const date = new Date().toISOString().slice(0, 10)
  const original = fs.readFileSync(notesPath, 'utf-8')

  try {
    const { content, skipped } = transformReleaseNotes(original, newVersion, date)
    if (skipped) {
      console.log(`Release notes already has entry for ${newVersion}, skipping.`)
      process.exit(0)
    }
    fs.writeFileSync(notesPath, content, 'utf-8')
    console.log(`Promoted 'next' → v${newVersion} (${date}); prepended fresh 'next' entry.`)
    execSync(`git add ${notesPath}`, { stdio: 'inherit' })
  } catch (err) {
    console.error(err.message)
    process.exit(1)
  }
}
