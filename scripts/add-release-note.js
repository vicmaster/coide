#!/usr/bin/env node

/**
 * Prepends a new empty release note entry for the current version.
 * Run automatically by the `version` npm lifecycle hook after `npm version` bumps package.json.
 */

const fs = require('fs')
const path = require('path')

const pkgPath = path.join(__dirname, '..', 'package.json')
const notesPath = path.join(__dirname, '..', 'src', 'renderer', 'src', 'data', 'releaseNotes.ts')

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
const version = pkg.version
const date = new Date().toISOString().slice(0, 10)

const content = fs.readFileSync(notesPath, 'utf-8')

// Check if this version already exists
if (content.includes(`version: '${version}'`)) {
  console.log(`Release notes already has entry for ${version}, skipping.`)
  process.exit(0)
}

// Insert new entry after the opening bracket of RELEASE_NOTES array
const newEntry = `  {
    version: '${version}',
    date: '${date}',
    notes: []
  },`

const updated = content.replace(
  /export const RELEASE_NOTES: ReleaseNote\[\] = \[\n/,
  `export const RELEASE_NOTES: ReleaseNote[] = [\n${newEntry}\n`
)

fs.writeFileSync(notesPath, updated, 'utf-8')
console.log(`Added release notes entry for v${version}`)

// Stage the file so it's included in npm version's auto-commit
const { execSync } = require('child_process')
execSync(`git add ${notesPath}`, { stdio: 'inherit' })
