# EduRoute Styles

Styles are now grouped by responsibility instead of being appended to one
large `App.css` file.

- `index.css` controls stylesheet order.
- `base/base.css` contains global variables, the mobile shell, shared proof UI, and base UI rules.
- `../app/auth/auth.css` contains login, signup, forgot password, reset code, and set-password screens.
- `../app/faculty/faculty.css` contains faculty dashboard, locator slip, status, trip route, profile, notification settings, edit profile, and privacy/security styles.
- `../app/admin/admin.css` contains shared admin/dean dashboard mobile styles.
- `../app/hrmu/hrmu.css` contains HRMU dashboard, verification, analytics, reports, notifications, and live tracking styles.
- `../app/shared/workspace.css` contains shared admin/dean pages, desktop auth, registry modal, profile, edit profile, and workspace styles.
- `../app/cssu/cssu.css` contains CSSU desktop and mobile command/reporting styles.

When extracting a page from `app/legacy/LegacyApp.jsx`, move its styles into
the closest feature stylesheet beside its JSX, then import it from `index.css`
in the same cascade position.
