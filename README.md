# aion2-updater-config

KINOJO INFO GitHub Pages upload package.

- `index.html`: GitHub Pages root entry redirect
- `config.json`: Chrome extension remote config compatibility file
- `kinojo-main/`: KINOJO INFO main, common UI/core/pages/docs
- `hall-of-fame/`: Hall of Fame page and assets
- `sanctuary/`: Sanctuary page

`config.json` is intentionally kept at repository root because the extension currently reads `/config.json`.

## Character detail modal

- The shared modal lives in `ui/kinojo-character-reaction.*` and is used by Hall of Fame, ranking, and sanctuary pages on PC and mobile.
- The overview keeps stats and skills side by side on desktop, with independent category tabs to reduce vertical scrolling.
- Skill cards highlight levels 20+, 25+, and 30+ with yellow, orange, and red gradient borders and badges.
- Manual full-detail refresh is mounted in the right side of the character header on desktop and stacks below the profile on mobile.
- Passkey users do not see the comparison tab while viewing a character owned by their own account.
