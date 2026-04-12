#!/usr/bin/env node

/**
 * Updates release notes for the new version.
 * Run automatically by the `version` npm lifecycle hook after `npm version` bumps package.json.
 *
 * Strategy: The first entry in RELEASE_NOTES accumulates notes as features ship.
 * On release, this script renames that entry to the new version + updates the date,
 * then prepends a fresh empty entry for the next development cycle.
 */

const fs = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const notesPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'data', 'releaseNotes.ts')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const newVersion = pkg.version
const date = new Date().toISOString().slice(0, 10)

let content = fs.readFileSync(notesPath, 'utf-8')

// Check if this version already exists
if (content.includes(`version: '${newVersion}'`)) {
  console.log(`Release notes already has entry for ${newVersion}, skipping.`)
  process.exit(0)
}

// Find the first entry's version and rename it to the new version + update date
const firstVersionMatch = content.match(/version: '([^']+)'/)
if (firstVersionMatch) {
  const oldVersion = firstVersionMatch[1]
  // Replace only the first occurrence of the old version and its date
  content = content.replace(
    `version: '${oldVersion}'`,
    `version: '${newVersion}'`
  )
  // Update the date on the same entry
  const dateMatch = content.match(new RegExp(`version: '${newVersion}'[\\s\\S]*?date: '([^']+)'`))
  if (dateMatch) {
    content = content.replace(
      `version: '${newVersion}',\n    date: '${dateMatch[1]}'`,
      `version: '${newVersion}',\n    date: '${date}'`
    )
  }
}

fs.writeFileSync(notesPath, content, 'utf-8')
console.log(`Renamed first entry to v${newVersion} (date: ${date})`)

// Stage the file so it's included in npm version's auto-commit
const { execSync } = require('child_process')
execSync(`git add ${notesPath}`, { stdio: 'inherit' })
