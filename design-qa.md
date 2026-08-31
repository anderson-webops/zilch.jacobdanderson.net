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
