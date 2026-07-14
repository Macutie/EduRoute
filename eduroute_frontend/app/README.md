# EduRoute App Structure

`App.jsx` is intentionally kept small and delegates to `app/AppRoot.jsx`.

- `AppRoot.jsx` is the frontend composition root.
- `legacy/LegacyApp.jsx` contains the current monolithic implementation while
  pages are migrated safely.
- New extracted pages should be grouped by portal, for example:
  - `app/auth/`
  - `app/faculty/`
  - `app/dean/`
  - `app/hrmu/`
  - `app/cssu/`

Move one route or page at a time from `legacy/LegacyApp.jsx` into the matching
folder, then update `AppRoot.jsx` or a route map once that page is independent.
