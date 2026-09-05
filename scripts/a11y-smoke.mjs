import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
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
  '/tips',
]
const colorSchemes = (process.env.A11Y_COLOR_SCHEMES || 'light,dark')
  .split(',')
  .map(scheme => scheme.trim())
  .filter(Boolean)
const desktopViewport = { name: 'desktop', width: 1280, height: 1000 }
const mobileViewport = { name: 'iphone-reflow', width: 320, height: 852 }
const screenshotDir = process.env.DESIGN_QA_SCREENSHOT_DIR

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

async function captureScreenshot(page, filename) {
  if (!screenshotDir)
    return
  await mkdir(screenshotDir, { recursive: true })
  await page.screenshot({ path: resolve(screenshotDir, filename), fullPage: false })
}

async function stageSavedGame(page, gameState) {
  await page.goto(`${baseUrl}/tips`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#tips-title')
  await page.evaluate((nextState) => {
    localStorage.setItem('zilch-browser-game-v1', JSON.stringify(nextState))
  }, gameState)
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.resume-button')
}

async function rollKnownDice(page, values, { selector = '.roll-button', resultSelector = '.selection-actions' } = {}) {
  await page.waitForSelector(`${selector}:not(:disabled)`)
  await page.evaluate(({ values: rollValues, selector: buttonSelector }) => {
    const button = document.querySelector(buttonSelector)
    if (!(button instanceof HTMLButtonElement) || button.disabled)
      throw new Error('The requested human roll button is unavailable')

    const originalRandom = Math.random
    let nextValue = 0
    try {
      // Exercise the real button handler with a reproducible roll. Restore the
      // random source synchronously, before any later game or browser action.
      Math.random = () => {
        const value = rollValues[nextValue++]
        if (value === undefined)
          throw new Error('The roll requested more dice than the fixture supplies')
        return (value - 0.5) / 6
      }
      button.click()
    }
    finally {
      Math.random = originalRandom
    }
    if (nextValue !== rollValues.length)
      throw new Error(`Expected to roll ${rollValues.length} dice, rolled ${nextValue}`)
  }, { values, selector })
  await page.waitForSelector(resultSelector)
  await delay(600)
}

async function findRolledDiceIssues(page, label, expectedValues, { expectScoring = true } = {}) {
  return await page.evaluate(({ label: stateLabel, values, expectScoring: hasScoringDice }) => {
    const issues = []
    const dice = [...document.querySelectorAll('.dice-zone .die')]
    if (dice.length !== values.length)
      return [`${stateLabel}: expected ${values.length} visible dice, found ${dice.length}`]

    const grid = dice[0]?.parentElement
    if (!grid?.matches('.dice-grid') || grid.classList.contains('waiting-dice'))
      issues.push(`${stateLabel}: rolled dice retained the waiting placeholder container`)
    if (grid && getComputedStyle(grid).display !== 'grid')
      issues.push(`${stateLabel}: rolled dice lost their grid layout`)

    const checkedAncestors = new Set()
    for (const [index, die] of dice.entries()) {
      if (!die.getAttribute('aria-label')?.startsWith(`Die showing ${values[index]},`))
        issues.push(`${stateLabel}: die ${index + 1} does not show its rolled value ${values[index]}`)
      for (let element = die; element; element = element.parentElement) {
        if (checkedAncestors.has(element))
          continue
        checkedAncestors.add(element)
        const style = getComputedStyle(element)
        if (Number.parseFloat(style.opacity) < 0.99)
          issues.push(`${stateLabel}: ${element.className || element.tagName} dims the rolled dice with opacity ${style.opacity}`)
        if (style.filter !== 'none')
          issues.push(`${stateLabel}: ${element.className || element.tagName} filters the rolled dice with ${style.filter}`)
      }
    }

    // Check the visible gaps, since the old placeholder's narrow columns made
    // full-size rolled dice touch even when their own opacity was correct.
    const bounds = dice.map(die => die.getBoundingClientRect())
    for (let index = 1; index < bounds.length; index++) {
      const previous = bounds[index - 1]
      const current = bounds[index]
      if (Math.abs(current.top - previous.top) < 8 && current.left - previous.right < 6)
        issues.push(`${stateLabel}: dice ${index} and ${index + 1} touch or have less than a 6px gap`)
    }

    const available = dice.filter(die => !die.disabled)
    if (hasScoringDice && !available.length)
      issues.push(`${stateLabel}: the scoring roll has no available dice`)
    if (!hasScoringDice && (available.length || dice.some(die => die.classList.contains('muted'))))
      issues.push(`${stateLabel}: bust dice should be readable roll results without scoring controls`)
    for (const die of hasScoringDice ? available : dice) {
      const background = getComputedStyle(die).backgroundColor
      const components = background.match(/[\d.]+/g)?.map(Number) ?? []
      const alpha = components[3] ?? 1
      if (components.length < 3 || Math.min(...components.slice(0, 3)) < 200 || alpha < 0.95)
        issues.push(`${stateLabel}: a readable die has a dim or translucent face (${background})`)
    }
    return issues
  }, { label, values: expectedValues, expectScoring })
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
      && document.querySelector('[aria-label="Computer difficulty"]')?.value === 'medium'
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

async function findAxeIssues(page, label) {
  const hasAxe = await page.evaluate(() => typeof globalThis.axe !== 'undefined')
  if (!hasAxe)
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
  return result.violations
    .filter(violation => violation.id !== 'frame-tested')
    .map((violation) => {
      const targets = violation.nodes.flatMap(node => node.target).join(', ')
      const sample = violation.nodes[0]?.html ?? ''
      return `${label}: [${violation.id}] ${violation.help} (${targets}; ${sample}; ${violation.helpUrl})`
    })
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
  await captureScreenshot(page, 'setup-mobile.png')

  await page.select('[aria-label="Computer difficulty"]', 'hard')
  await page.click('[aria-label="Your player name"]', { clickCount: 3 })
  await page.keyboard.type('ABCDEFGHIJKLMNOPQRSTUVWXYZABCD')
  await page.click('.setup-card .primary-button')
  await page.waitForSelector('.play-layout')
  const computerLabel = await page.$eval('.scoreboard li:nth-child(2) .score-copy small', element => element.textContent?.trim())
  if (computerLabel !== 'Hard computer')
    issues.push(`ready game: expected Hard computer in the scoreboard, found ${computerLabel || 'nothing'}`)
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
  issues.push(...await findAxeIssues(page, 'ready game'))

  const playerNameBeforeTips = await page.$eval('#turn-title', element => element.textContent?.trim())
  await page.click('.site-header .tips-link')
  await page.waitForFunction(() => location.pathname === '/tips')
  await page.click('.play-link')
  await page.waitForSelector('.play-layout')
  const playerNameAfterTips = await page.$eval('#turn-title', element => element.textContent?.trim())
  if (playerNameAfterTips !== playerNameBeforeTips)
    issues.push('ready game: returning from Tips did not preserve the active table')

  const firstRollValues = [2, 3, 3, 5, 4, 5]
  await rollKnownDice(page, firstRollValues)
  issues.push(...await findRolledDiceIssues(page, 'new game first roll', firstRollValues))
  issues.push(...await findReflowIssues(page, 'rolled game', [
    '.play-layout',
    '.scoreboard',
    '.felt-table',
    '.turn-log',
    '.dice-zone',
    '.action-panel',
  ]))
  issues.push(...await findTapTargetIssues(page, 'rolled game'))
  issues.push(...await findAxeIssues(page, 'rolled game'))

  await page.click('.log-heading button')
  await page.waitForSelector('.rules-dialog[open]')
  issues.push(...await findReflowIssues(page, 'rules dialog', [
    '.rules-dialog',
    '.dialog-header',
    '.rules-copy',
  ]))
  issues.push(...await findTapTargetIssues(page, 'rules dialog'))
  issues.push(...await findAxeIssues(page, 'rules dialog'))
  await page.click('[aria-label="Close rules"]')

  await stageSavedGame(page, {
    schemaVersion: 2,
    settings: {
      winningScore: 5000,
      openingScore: 1000,
      firstRollBust: true,
      finalChase: true,
      allowTies: true,
      stealing: false,
    },
    players: [
      { id: 'player-1', name: 'Player 1', kind: 'human', difficulty: null, score: 0, scoreReachedAt: 0 },
      { id: 'player-2', name: 'Computer', kind: 'computer', difficulty: 'hard', score: 0, scoreReachedAt: 0 },
    ],
    currentPlayerIndex: 0,
    nextPlayerIndex: null,
    phase: 'selecting',
    dice: [6, 1, 4, 6, 6, 3].map((value, index) => ({ id: 10 + index, value })),
    diceInPlay: 6,
    selectedDieIds: [],
    turnScore: 0,
    scoredMultiples: {},
    rollNumber: 1,
    bankSequence: 0,
    eventSequence: 2,
    message: 'Player 1 rolled. Choose scoring dice.',
    events: [
      { id: 2, text: 'Player 1 rolled. Choose scoring dice.', tone: 'neutral' },
    ],
    continuation: null,
    endgame: null,
    winnerIds: [],
  })
  await page.click('.resume-button')
  await page.waitForSelector('.selection-actions')
  await delay(600)
  const diceContrastIssues = await page.evaluate(() => {
    const issues = []
    const available = [...document.querySelectorAll('.dice-grid .die.available')]
    const muted = [...document.querySelectorAll('.dice-grid .die.muted')]
    const total = document.querySelectorAll('.dice-grid .die').length
    if (available.length !== 4 || muted.length !== 2 || total !== 6) {
      issues.push(`scoring result: expected 4 available and 2 muted dice, found ${available.length} available, ${muted.length} muted, and ${total} total`)
      return issues
    }

    const availableStyle = getComputedStyle(available[0])
    const mutedStyle = getComputedStyle(muted[0])
    if (availableStyle.opacity !== '1' || mutedStyle.opacity !== '1')
      issues.push(`scoring result: die opacity must remain 1, found ${availableStyle.opacity} available and ${mutedStyle.opacity} muted`)
    if (availableStyle.backgroundColor === mutedStyle.backgroundColor)
      issues.push('scoring result: available and muted dice do not have distinct backgrounds')
    if (getComputedStyle(available[0].querySelector('.pip')).backgroundColor
      === getComputedStyle(muted[0].querySelector('.pip')).backgroundColor) {
      issues.push('scoring result: available and muted dice do not have distinct pip colors')
    }
    return issues
  })
  issues.push(...diceContrastIssues)
  issues.push(...await findAxeIssues(page, 'scoring result'))
  await captureScreenshot(page, 'scoring-mobile.png')

  await stageSavedGame(page, {
    schemaVersion: 2,
    settings: {
      winningScore: 5000,
      openingScore: 1000,
      firstRollBust: true,
      finalChase: true,
      allowTies: true,
      stealing: false,
    },
    players: [
      { id: 'player-1', name: 'Player 1', kind: 'human', difficulty: null, score: 0, scoreReachedAt: 0 },
      { id: 'player-2', name: 'Computer', kind: 'computer', difficulty: 'hard', score: 0, scoreReachedAt: 0 },
    ],
    currentPlayerIndex: 0,
    nextPlayerIndex: 1,
    phase: 'bust',
    dice: [2, 3, 3, 4, 4, 6].map((value, index) => ({ id: 10 + index, value })),
    diceInPlay: 6,
    selectedDieIds: [],
    turnScore: 0,
    scoredMultiples: {},
    rollNumber: 1,
    bankSequence: 0,
    eventSequence: 2,
    message: 'Bust! Player 1 rolled no scoring dice and lost the turn points.',
    events: [
      { id: 2, text: 'Bust! Player 1 rolled no scoring dice and lost the turn points.', tone: 'risk' },
    ],
    continuation: null,
    endgame: null,
    winnerIds: [],
  })
  await page.click('.resume-button')
  await page.waitForSelector('.bust-actions')
  await delay(600)
  const bustStateIssues = await page.evaluate(() => {
    const issues = []
    if (document.querySelectorAll('.dice-grid .die').length !== 6)
      issues.push('bust result: rolled dice are not all visible')
    if (document.querySelectorAll('.dice-grid .die.muted').length !== 0)
      issues.push('bust result: rolled dice are visually muted')
    if ([...document.querySelectorAll('.dice-grid .die')]
      .some(die => getComputedStyle(die).opacity !== '1')) {
      issues.push('bust result: one or more rolled dice are translucent')
    }
    if (document.querySelector('.bust-action')?.textContent?.trim() !== 'Watch Computer play')
      issues.push('bust result: next action is unclear')
    return issues
  })
  issues.push(...bustStateIssues)
  issues.push(...await findReflowIssues(page, 'bust result', [
    '.play-layout',
    '.felt-table',
    '.dice-grid',
    '.bust-actions',
  ]))
  issues.push(...await findTapTargetIssues(page, 'bust result'))
  issues.push(...await findAxeIssues(page, 'bust result'))
  await captureScreenshot(page, 'bust-mobile.png')

  const handoffState = {
    schemaVersion: 2,
    settings: {
      winningScore: 5000,
      openingScore: 1000,
      firstRollBust: true,
      finalChase: true,
      allowTies: true,
      stealing: false,
    },
    players: [
      { id: 'player-1', name: 'Alice', kind: 'human', difficulty: null, score: 1000, scoreReachedAt: 1 },
      { id: 'player-2', name: 'You', kind: 'human', difficulty: null, score: 0, scoreReachedAt: 0 },
    ],
    currentPlayerIndex: 0,
    nextPlayerIndex: 1,
    phase: 'pass',
    dice: [],
    diceInPlay: 6,
    selectedDieIds: [],
    turnScore: 0,
    scoredMultiples: {},
    rollNumber: 1,
    bankSequence: 1,
    eventSequence: 2,
    message: 'Alice banked 1,000 points.',
    events: [
      { id: 2, text: 'Alice banked 1,000 points.', tone: 'good' },
    ],
    continuation: null,
    endgame: null,
    winnerIds: [],
  }
  await stageSavedGame(page, handoffState)
  await page.click('.resume-button')
  await page.waitForSelector('.phase-dialog')
  await delay(50)
  const passCopy = await page.evaluate(() => ({
    action: document.querySelector('.phase-dialog button')?.textContent?.trim(),
    title: document.querySelector('#pass-title')?.textContent?.trim(),
  }))
  if (passCopy.title !== 'You are up next')
    issues.push(`pass result: expected "You are up next", found "${passCopy.title || 'nothing'}"`)
  if (passCopy.action !== 'Start your turn')
    issues.push(`pass result: expected "Start your turn", found "${passCopy.action || 'nothing'}"`)
  await page.keyboard.down('Shift')
  await page.keyboard.press('Tab')
  await page.keyboard.up('Shift')
  const focusStayedInDialog = await page.evaluate(() => {
    const dialog = document.querySelector('.phase-dialog')
    return dialog instanceof HTMLElement && dialog.contains(document.activeElement)
  })
  if (!focusStayedInDialog)
    issues.push('pass result: reverse tab navigation escaped the modal turn handoff')
  issues.push(...await findAxeIssues(page, 'pass result'))

  await page.click('.phase-dialog button')
  await rollKnownDice(page, firstRollValues)
  issues.push(...await findRolledDiceIssues(page, 'next human first roll', firstRollValues))

  const savedReadyState = {
    ...handoffState,
    players: handoffState.players.map(player => ({ ...player, score: 0, scoreReachedAt: 0 })),
    currentPlayerIndex: 0,
    nextPlayerIndex: null,
    phase: 'ready',
    rollNumber: 0,
    bankSequence: 0,
    message: 'Alice\'s turn. Roll all six dice.',
    events: [],
  }
  await stageSavedGame(page, savedReadyState)
  await page.click('.resume-button')
  await rollKnownDice(page, firstRollValues)
  issues.push(...await findRolledDiceIssues(page, 'saved ready first roll', firstRollValues))

  const playerBeforeBust = await page.$eval('#turn-title', element => element.textContent?.trim())
  await page.click('.select-all')
  const bustValues = [2, 3, 4, 6]
  await rollKnownDice(page, bustValues, {
    selector: '.secondary-action',
    resultSelector: '.bust-actions',
  })
  // Together with the settle wait, exceed the computer's 1.24s bust timer.
  // A human's result must stay visible until they choose to move on.
  await delay(800)
  issues.push(...await findRolledDiceIssues(page, 'human Risk it bust', bustValues, { expectScoring: false }))
  const retainedBust = await page.evaluate(() => ({
    title: document.querySelector('#turn-title')?.textContent?.trim(),
    status: document.querySelector('.status-banner')?.textContent?.trim(),
    bustAction: document.querySelector('.bust-action') !== null,
    passDialog: document.querySelector('.phase-dialog') !== null,
  }))
  if (retainedBust.title !== playerBeforeBust)
    issues.push('human Risk it bust: the next player took over before acknowledgement')
  if (!retainedBust.bustAction || !/bust/i.test(retainedBust.status || ''))
    issues.push('human Risk it bust: the roll lost its visible bust indication or acknowledgement action')
  if (retainedBust.passDialog)
    issues.push('human Risk it bust: a turn handoff dialog hides the bust roll')
  await page.click('.bust-action')
  await page.waitForSelector('.roll-button:not(:disabled)')
  const playerAfterBust = await page.$eval('#turn-title', element => element.textContent?.trim())
  if (playerAfterBust !== savedReadyState.players[1].name)
    issues.push(`human Risk it bust: acknowledgement did not pass the dice to ${savedReadyState.players[1].name}`)

  for (const acceptSteal of [false, true]) {
    await stageSavedGame(page, {
      ...handoffState,
      settings: { ...handoffState.settings, stealing: true },
      players: handoffState.players.map(player => ({ ...player, score: 1000, scoreReachedAt: 1 })),
      continuation: {
        sourcePlayerId: 'player-1',
        sourcePlayerName: 'Alice',
        inheritedScore: 500,
        diceInPlay: 3,
        scoredMultiples: {},
      },
    })
    await page.click('.resume-button')
    await page.waitForSelector('#pass-title')
    await page.click('.phase-dialog button')
    await page.waitForSelector('.steal-card')
    await page.click(acceptSteal ? '.steal-card button:not(.fresh-button)' : '.steal-card .fresh-button')
    const values = acceptSteal ? [2, 3, 5] : firstRollValues
    const label = acceptSteal ? 'accepted continuation first roll' : 'fresh continuation first roll'
    await rollKnownDice(page, values)
    issues.push(...await findRolledDiceIssues(page, label, values))
  }

  await stageSavedGame(page, {
    schemaVersion: 2,
    settings: {
      winningScore: 5000,
      openingScore: 1000,
      firstRollBust: true,
      finalChase: true,
      allowTies: true,
      stealing: false,
    },
    players: [
      { id: 'player-1', name: 'You', kind: 'human', difficulty: null, score: 5000, scoreReachedAt: 1 },
      { id: 'player-2', name: 'Computer', kind: 'computer', difficulty: 'medium', score: 4200, scoreReachedAt: 2 },
    ],
    currentPlayerIndex: 0,
    nextPlayerIndex: null,
    phase: 'finished',
    dice: [],
    diceInPlay: 6,
    selectedDieIds: [],
    turnScore: 0,
    scoredMultiples: {},
    rollNumber: 1,
    bankSequence: 2,
    eventSequence: 2,
    message: 'You win with 5,000 points.',
    events: [
      { id: 2, text: 'You win with 5,000 points.', tone: 'special' },
    ],
    continuation: null,
    endgame: { triggerPlayerId: 'player-1', remainingTurns: 0 },
    winnerIds: ['player-1'],
  })
  await page.click('.resume-button')
  await page.waitForSelector('#winner-title')
  const winnerTitle = await page.$eval('#winner-title', element => element.textContent?.trim())
  if (winnerTitle !== 'You win')
    issues.push(`finished result: expected "You win", found "${winnerTitle || 'nothing'}"`)
  issues.push(...await findAxeIssues(page, 'finished result'))

  return issues
}

async function verifyMobileTips(page) {
  const issues = await findReflowIssues(page, 'tips', [
    '.tips-page',
    '.site-header',
    '.tips-main',
    '.tips-hero',
    '.hero-rule',
    '.threshold-card',
    '.strategy-grid',
    '.variants',
    '.evidence-card',
    '.tips-cta',
  ])
  const facts = await page.evaluate(() => ({
    heading: document.querySelector('#tips-title')?.textContent?.trim(),
    rows: document.querySelectorAll('.threshold-card tbody tr').length,
  }))
  if (!facts.heading)
    issues.push('tips: page heading is missing')
  if (facts.rows !== 6)
    issues.push(`tips: expected 6 dice-threshold rows, found ${facts.rows}`)
  await captureScreenshot(page, 'tips-mobile.png')
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
    if (route === '/')
      await verifyHydratedSetup(page)
    else
      await page.waitForSelector('#tips-title')
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
      ? route === '/'
        ? await verifyMobileGameFlow(page)
        : await verifyMobileTips(page)
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
