import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

const require = createRequire(import.meta.url)
const axeSourcePath = require.resolve('axe-core/axe.min.js')
const scriptDir = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDir, '..')

const siteName = 'Zilch'
const frontendPort = Number(process.env.A11Y_FRONTEND_PORT || 3356)
const baseUrl = `http://127.0.0.1:${frontendPort}`
const routes = [
  '/',
]
const colorSchemes = (process.env.A11Y_COLOR_SCHEMES || 'light,dark')
  .split(',')
  .map(scheme => scheme.trim())
  .filter(Boolean)
const desktopViewport = { name: 'desktop', width: 1280, height: 1000 }
const mobileViewport = { name: 'iphone-reflow', width: 320, height: 852 }

const chromeCandidates = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
].filter(Boolean)

const chromePath = chromeCandidates.find(candidate => existsSync(candidate))
if (chromePath)
  process.env.PUPPETEER_EXECUTABLE_PATH = chromePath

function writeServerLine(prefix, data) {
  const text = data.toString().trim()
  if (text)
    process.stderr.write(`[${prefix}] ${text}\n`)
}

async function waitForHttp(url, timeoutMs = 45_000) {
  const start = Date.now()
  let lastError
  while (Date.now() - start < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.ok)
        return
      lastError = new Error(`${url} returned ${response.status}`)
    }
    catch (error) {
      lastError = error
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 400))
  }
  throw lastError || new Error(`Timed out waiting for ${url}`)
}

function startFrontend() {
  const args = ['exec', '-w', 'front-end', '--', 'nuxt', 'dev', '--host', '127.0.0.1', '--port', String(frontendPort)]

  const child = spawn('npm', args, {
    cwd: projectRoot,
    detached: process.platform !== 'win32',
    env: {
      ...process.env,
      BROWSER: 'none',
      NUXT_A11Y_SCAN: 'true',
      NUXT_IGNORE_LOCK: '1',
      NUXT_TELEMETRY_DISABLED: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', data => writeServerLine('nuxt', data))
  child.stderr.on('data', data => writeServerLine('nuxt', data))
  return child
}

function delay(durationMs) {
  return new Promise(resolveDelay => setTimeout(resolveDelay, durationMs))
}

function signalProcessTree(child, signal) {
  if (!child.pid)
    return false

  try {
    if (process.platform === 'win32')
      return child.kill(signal)

    process.kill(-child.pid, signal)
    return true
  }
  catch (error) {
    if (error?.code === 'ESRCH')
      return false
    throw error
  }
}

async function stopProcessTree(child) {
  if (!child.pid)
    return

  signalProcessTree(child, 'SIGTERM')
  await delay(1_000)

  if (process.platform === 'win32') {
    if (child.exitCode === null)
      signalProcessTree(child, 'SIGKILL')
  }
  else {
    try {
      process.kill(-child.pid, 0)
      signalProcessTree(child, 'SIGKILL')
    }
    catch (error) {
      if (error?.code !== 'ESRCH')
        throw error
    }
  }

  await Promise.race([
    new Promise(resolveClose => child.once('close', resolveClose)),
    delay(1_000),
  ])
}

async function verifyHydratedSetup(page) {
  await page.waitForSelector('.mode-picker input[value="local"]')
  await page.click('.mode-picker label:nth-of-type(2)')
  await page.waitForFunction(() => {
    const localMode = document.querySelector('.mode-picker input[value="local"]')
    return localMode instanceof HTMLInputElement
      && localMode.checked
      && document.querySelectorAll('.name-grid input').length === 2
      && document.querySelector('.local-setup') !== null
  })

  await page.click('.mode-picker label:nth-of-type(1)')
  await page.waitForFunction(() => {
    const computerMode = document.querySelector('.mode-picker input[value="computer"]')
    return computerMode instanceof HTMLInputElement
      && computerMode.checked
      && document.querySelector('[aria-label="Computer player name"]') !== null
      && document.querySelector('.players-list') !== null
  })
}

async function findReflowIssues(page, label, selectors) {
  return await page.evaluate(({ label: stateLabel, selectors: checkedSelectors }) => {
    const viewportWidth = document.documentElement.clientWidth
    const issues = []

    for (const selector of checkedSelectors) {
      for (const element of document.querySelectorAll(selector)) {
        const rect = element.getBoundingClientRect()
        if (rect.left < -0.5 || rect.right > viewportWidth + 0.5)
          issues.push(`${stateLabel}: ${selector} extends from ${rect.left.toFixed(1)}px to ${rect.right.toFixed(1)}px in a ${viewportWidth}px viewport`)
      }
    }

    return issues
  }, { label, selectors })
}

async function findTapTargetIssues(page, label) {
  return await page.evaluate((stateLabel) => {
    return [...document.querySelectorAll('button, summary')]
      .map((element) => {
        const rect = element.getBoundingClientRect()
        return {
          height: rect.height,
          label: element.getAttribute('aria-label') || element.textContent?.trim().replace(/\s+/g, ' ') || element.tagName.toLowerCase(),
          width: rect.width,
        }
      })
      .filter(target => target.height > 0 && target.width > 0 && (target.height < 44 || target.width < 44))
      .map(target => `${stateLabel}: ${target.label} has a ${target.width.toFixed(1)}px by ${target.height.toFixed(1)}px touch target`)
  }, label)
}

async function verifyMobileGameFlow(page) {
  const issues = await findReflowIssues(page, 'landing', [
    '.game-frame',
    '.welcome-card',
    '.welcome-card h1',
    '.setup-card',
    '.mode-picker',
    '.player-row',
  ])
  issues.push(...await findTapTargetIssues(page, 'landing'))

  const undersizedFields = await page.evaluate(() => {
    return [...document.querySelectorAll('input:not([type="radio"]), select')]
      .filter(element => Number.parseFloat(getComputedStyle(element).fontSize) < 16)
      .map(element => element.getAttribute('aria-label') || element.tagName.toLowerCase())
  })
  for (const field of undersizedFields)
    issues.push(`landing: ${field} uses text smaller than 16px and can trigger iOS form zoom`)

  await page.click('[aria-label="Your player name"]', { clickCount: 3 })
  await page.keyboard.type('ABCDEFGHIJKLMNOPQRSTUVWXYZABCD')
  await page.click('.setup-card .primary-button')
  await page.waitForSelector('.play-layout')
  issues.push(...await findReflowIssues(page, 'ready game', [
    '.play-layout',
    '.scoreboard',
    '.felt-table',
    '.turn-log',
    '.table-topline',
    '.table-topline h1',
    '.turn-score',
    '.waiting-dice',
    '.action-panel',
  ]))
  issues.push(...await findTapTargetIssues(page, 'ready game'))

  await page.click('.roll-button')
  await delay(250)
  issues.push(...await findReflowIssues(page, 'rolled game', [
    '.play-layout',
    '.scoreboard',
    '.felt-table',
    '.turn-log',
    '.dice-zone',
    '.action-panel',
  ]))
  issues.push(...await findTapTargetIssues(page, 'rolled game'))

  await page.click('.log-heading button')
  await page.waitForSelector('.rules-dialog[open]')
  issues.push(...await findReflowIssues(page, 'rules dialog', [
    '.rules-dialog',
    '.dialog-header',
    '.rules-copy',
  ]))
  issues.push(...await findTapTargetIssues(page, 'rules dialog'))
  await page.click('[aria-label="Close rules"]')

  return issues
}

async function analyzePage(browser, route, scheme, viewport) {
  const url = `${baseUrl}${route}`
  const page = await browser.newPage()
  const runtimeFailures = new Set()

  page.on('console', (message) => {
    if (message.type() === 'error')
      runtimeFailures.add(`console: ${message.text()}`)
  })
  page.on('pageerror', (error) => {
    runtimeFailures.add(`page: ${error.message}`)
  })
  page.on('requestfailed', (request) => {
    runtimeFailures.add(`request: ${request.url()} (${request.failure()?.errorText || 'unknown failure'})`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400)
      runtimeFailures.add(`response: ${response.status()} ${response.url()}`)
  })

  page.setDefaultTimeout(30_000)
  try {
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 })
    if (scheme === 'dark' || scheme === 'light')
      await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }])

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.waitForNetworkIdle({ idleTime: 500, timeout: 8_000 }).catch(() => {})
    await verifyHydratedSetup(page)
    await page.addScriptTag({ path: axeSourcePath })
    const result = await page.evaluate(async () => {
      return await globalThis.axe.run(document, {
        resultTypes: ['violations'],
        runOnly: {
          type: 'tag',
          values: ['wcag2a', 'wcag2aa'],
        },
      })
    })
    const reflowIssues = viewport.name === mobileViewport.name
      ? await verifyMobileGameFlow(page)
      : []
    return {
      url,
      scheme,
      viewport: viewport.name,
      reflowIssues,
      runtimeFailures: [...runtimeFailures],
      violations: result.violations.filter(violation => violation.id !== 'frame-tested'),
    }
  }
  finally {
    await page.close()
  }
}

const frontendProcess = startFrontend()
let browser

try {
  await waitForHttp(baseUrl)

  browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  const failures = []
  const scenarios = [
    ...colorSchemes.map(scheme => ({ scheme, viewport: desktopViewport })),
    { scheme: 'light', viewport: mobileViewport },
  ]
  for (const route of routes) {
    for (const scenario of scenarios) {
      const result = await analyzePage(browser, route, scenario.scheme, scenario.viewport)
      if (result.violations.length || result.runtimeFailures.length || result.reflowIssues.length) {
        failures.push(result)
        continue
      }
      console.log(`a11y and hydrated interaction ok: ${result.url} [${result.scheme}; ${result.viewport}]`)
    }
  }

  if (failures.length) {
    for (const failure of failures) {
      console.error(`\nBrowser smoke issues for ${siteName} at ${failure.url} [${failure.scheme}; ${failure.viewport}]`)
      for (const runtimeFailure of failure.runtimeFailures)
        console.error(`- ${runtimeFailure}`)
      for (const reflowIssue of failure.reflowIssues)
        console.error(`- ${reflowIssue}`)
      for (const violation of failure.violations) {
        console.error(`- [${violation.impact ?? 'unknown'}] ${violation.id}: ${violation.help}`)
        console.error(`  ${violation.helpUrl}`)
        for (const node of violation.nodes) {
          console.error(`  ${node.target.join(', ')}`)
        }
      }
    }
    process.exitCode = 1
  }
}
finally {
  if (browser)
    await browser.close()
  await stopProcessTree(frontendProcess)
}
