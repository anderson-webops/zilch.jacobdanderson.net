# iPhone design QA

## Comparison inputs

- Source capture: `/tmp/codex-remote-attachments/01a05350-f7aa-7963-8cdb-e52bdeed2ea6/CE1A2FE8-5E0F-4817-81CE-BB8C922D0799/1-Pasted-Image-1.jpg`
- Normalized source content: `/tmp/zilch-iphone-reference-content.png`
- Implementation capture: `/tmp/zilch-iphone-after.png`
- Side-by-side comparison: `/tmp/zilch-iphone-comparison.png`
- Source dimensions: 591 by 1280 pixels, with the browser-content area cropped from y=72 through y=1074 and normalized to 320 by 543 pixels.
- Implementation viewport: 320 by 543 CSS pixels.
- State: top of the new-game landing page, default solo setup, no saved-game prompt, and no focused control.

## Findings and iteration history

1. The supplied iPhone capture established the visual source of truth. The right side of both hero lines and the setup card was clipped, while the colors, typography, hierarchy, and card treatment were otherwise retained as the target art direction.
2. The failure was reproduced locally at 320 CSS pixels. The 292-pixel game frame contained a 337.7-pixel intrinsic grid track, putting the hero and setup card right edge at 351.7 pixels.
3. The single-column grid, welcome panel, and setup card were constrained to shrink within the viewport. The mobile headline now scales from the available width, and WebKit text sizing is stabilized. The retest measured every landing container at or inside x=14 through x=306, with a 320-pixel document width.
4. A 30-character unbroken player name initially expanded the game header to x=443 and displaced the score to x=492. After constraining the heading flex item, the heading ends at x=218.5 and the score ends at x=287 in the same 320-pixel viewport.
5. Core iPhone touch targets were raised to at least 44 pixels. The rules close control initially shrank to 41.2 pixels in the narrow dialog and was then fixed at 44 by 44 pixels.
6. The ready-state ghost dice were reduced at the narrow breakpoint so their rotated desktop footprint is not clipped. Phase overlays now wrap long names and can scroll vertically.
7. The final side-by-side comparison preserves the original spacing, palette, typography, and setup hierarchy while keeping all visible content inside the viewport. No P0, P1, or P2 visual mismatch remains for this state.

## Verification

- Chromium responsive checks passed at 320 CSS pixels for landing, start, roll, long-name header, rules dialog, input-error recovery, and form-control zoom safety.
- The automated accessibility smoke now covers the 320 by 852 iPhone reflow scenario, including start, roll, long-name containment, touch targets, and the rules dialog.
- Physical Safari browser chrome and private-mode storage behavior still require real-device acceptance after deployment.

## Final result

passed

# Gameplay and strategy design QA, 2026-09-04

## Visual source of truth

- Gameplay evidence: `/var/folders/l2/hs_3m4zd08d89jp_dzj2fqmw0000gn/T/TemporaryItems/NSIRD_screencaptureui_4LtDbp/Screenshot 2026-09-04 at 16.00.55.png` and `/var/folders/l2/hs_3m4zd08d89jp_dzj2fqmw0000gn/T/TemporaryItems/NSIRD_screencaptureui_PktvSb/Screenshot 2026-09-04 at 16.02.01.png`.
- Preserved detailed Tips capture: `/tmp/zilch-design-qa-20260904-beta1/tips-mobile.png` from tagged source `v1.1.0-beta.1`.
- Compact Tips implementation: `/tmp/zilch-design-qa-20260904-final/tips-mobile.png`.
- Full before-and-after comparison input: `/tmp/zilch-tips-comparison-beta1-to-compact.png`.
- Focused gameplay comparison input: `/tmp/zilch-gameplay-mobile-comparison.png`, containing the scoring-choice and visible-bust states together.
- Viewports: 320 by 852 CSS pixels at device scale 1 for iPhone reflow, plus 1280 by 1000 CSS pixels for desktop checks. Light and dark desktop schemes were checked. The visual captures use the light scheme.

## Findings and iteration history

1. The original scoring state muted whole die controls, which made selectable dice look disabled in WebKit. Availability is now expressed with explicit solid colors rather than control opacity. The combined gameplay input shows high-contrast available dice beside intentionally muted non-scoring dice.
   Follow-up reproduction identified a separate cause on the live `v1.0.2` build: the first roll's numeric key collided with the waiting branch, leaving actual dice inside `.waiting-dice` at 28% parent opacity and a -3-degree rotation. The distinct `rolled-*` and `waiting-dice` keys in the corrected source prevent that reuse. Checking a restored scoring state alone did not exercise this transition.
2. A bust originally advanced straight to the pass prompt. The finished bust state now keeps all six rolled dice visible, provides a direct “Zilch. Nothing scores.” result, and waits for acknowledgement before advancing.
3. The default human label “You” produced awkward pass and winner copy. New games now use “Player 1,” while legacy or custom “You” names still receive grammatical second-person text.
4. The first Tips implementation was intentionally retained as `v1.1.0-beta.1`. Its long hero, reminder card, endgame essays, and evidence sections pushed the actionable strategy well below the first phone viewport.
5. The compact revision removes the repeated reminder and secondary essays. The combined before-and-after input shows all six standard banking targets in the initial 320 by 852 viewport while retaining the established palette, type, cards, and spacing language.
6. Stealing remains a separate compact table because simulation found a materially different policy. Three Pairs is reduced to one sentence because it did not change the recommended policy.

## Interaction, accessibility, and console checks

- Hydrated navigation from an active table to Tips and back preserved the table, including saved-game restoration and computer-turn scheduling.
- Ready, scoring-choice, bust, pass, rules-dialog, and finished-game states were exercised at the iPhone viewport. The bust acknowledgement, phase-dialog focus trap, touch targets, and horizontal score-table access all passed.
- Automated accessibility scans passed on `/` and `/tips` for light and dark desktop schemes and the 320-pixel iPhone reflow scenario.
- The browser checks watched for console errors and uncaught page errors; none were reported.
- The compact Tips page has no horizontal reflow, retains semantic tables and headings, and keeps the primary navigation target at least 44 pixels tall.

## Final result

passed

# Stable release regression checks, 2026-09-04

- Reproduced the reported `[2, 3, 3, 5, 4, 5]` first roll on the public `v1.0.2` site. Both scoring 5s had full individual opacity but inherited 28% opacity from the incorrectly retained waiting container.
- The same roll in the corrected source uses the proper grid, full parent opacity, separated dice, and bright scoring faces. Local captures are in `output/playwright/live-grey-dice-before.png` and `output/playwright/local-dice-after.png`.
- Browser regression coverage now clicks through new-game, saved-ready, next-human, and accepted/declined Stealing rolls. It checks the dice's ancestors as well as their own colors, opacity, and visible spacing.
- An actual scoring roll followed by Risk it and a forced bust must retain its dice and current player beyond the computer acknowledgement timer, show a clear bust notice, and advance only when the human acknowledges it.
- Stable `v1.1.0` packages the corrected gameplay and compact Tips page for the existing stable-release deployment path. Source/tag validation and public deployment remain separate acceptance steps.
