# Accessibility QA Checklist

This checklist complements the automated `npm run a11y` axe smoke suite. Run it before shipping game, layout, theme, routing, or rules changes.

## Screen Reader Pass

- macOS VoiceOver: open `/`; use `VO + Right Arrow` through setup and a complete game turn, then jump by headings, landmarks, buttons, form controls, and links.
- Windows NVDA: repeat the same routes in Firefox or Chrome when a Windows machine is available; verify browse mode and focus mode both announce the active control and destination clearly.
- Confirm page titles, headings, landmarks, link text, form labels, validation messages, and interactive state changes are announced clearly.

## Keyboard Pass

- Start at the browser address bar and tab through each page without using the mouse.
- Verify visible focus on setup controls, dice, roll and bank decisions, pass-turn overlays, rules, and new-game confirmation.
- Confirm no hidden control receives focus, no keyboard trap occurs, and Escape closes dismissible overlays or menus when present.

## Contrast And Motion Pass

- Check the warm-paper setup and dark-felt game surface at desktop and mobile widths.
- Verify primary text, muted text, buttons, form controls, links, alerts, cards, and media captions remain readable.
- With reduced motion enabled, confirm animation is not the only status cue and no page depends on motion to be understandable.

## Required Automated Evidence

- `npm run a11y`
- `npm run lint`
- `npm run typecheck`
- `npm run build`
