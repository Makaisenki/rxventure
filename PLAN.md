# RxVenture Dungeon

## Goal

Deliver a landscape-first, touch-friendly fantasy pharmacy quiz game with role-specific questions, five lives, 50-question runs, local role leaderboards, and a PIN-protected local administration area.

## Stack

- Phaser 3 and TypeScript with Vite
- SheetJS for the supplied Excel question-bank format
- Playwright with bundled Chromium for browser verification
- Browser localStorage for scores, settings, and imported question banks

## Delivery checks

- Mobile Chrome is the primary target; Edge receives compatibility checks.
- A run randomly selects 50 unique eligible questions with category balancing.
- The local admin validates and replaces the workbook only after confirmation, clears scores, and can restore bundled data.
- Logs are kept under `.logs/`; ImageGen prompts under `.prompts/`.
