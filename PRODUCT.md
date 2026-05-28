# Product

## Register

product

## Users

Two audiences inside one organization (Eurospital, a pharmaceutical/medical company).

- **Dipendenti (employees):** discover internal events (courses, ECM training, meetings, congresses), register, join waitlists, manage their own registrations and profile, check the calendar. Context: busy professionals, often on a work machine, occasionally mobile. They want to find the right event and reserve a seat in under a minute, then get back to work.
- **Amministrazione (admins / HR / training office):** publish and manage events, configure categories and custom fields, manage registrations and waitlists, run check-in (QR), send email notifications, read reports and KPIs, manage users, settings, LDAP/AD sync, and GDPR operations. Context: power users doing focused, repeated tasks across long sessions, frequently in dense tables and forms.

## Product Purpose

Eurospital Eventi is the internal platform for company event management. Employees self-serve discovery and registration; the administration publishes events and manages the full lifecycle (registrations, attendance, notifications, reporting). It replaces ad-hoc email-and-spreadsheet coordination with one trustworthy system.

Success looks like: an employee finds and registers for an event without help; an admin publishes an event and tracks attendance end to end without leaving the tool; the calendar and registration state are always accurate. The product is plumbing for the organization, it should feel reliable and quiet, never demand attention for its own sake.

## Brand Personality

**Affidabile, sereno, efficiente** (trustworthy, calm, efficient).

The voice is professional and clear, the way a well-run medical organization communicates: precise, reassuring, never flashy. The interface should evoke confidence and calm. Italian-language product. Tone is direct and helpful, not corporate-stiff and not playful.

## Anti-references

- **Generic Bootstrap admin.** No 2010s flat-grey dashboard, no dense tables crammed without breathing room, no default template look.
- **Neon / dark SaaS.** No neon gradients, no dark-mode-by-default, no hero-metric template, no crypto-startup vibe.
- **Legacy enterprise gestionale.** No old ERP feel: no endless nested menus, no extreme density, no absent visual hierarchy.
- Avoid consumer/social playfulness (emoji everywhere, excessive animation); inappropriate for a medical-organization context.

## Design Principles

- **Trust through restraint.** The product earns trust by being calm and predictable. One blue identity, generous whitespace, no visual noise. Reliability reads as design.
- **Task first, chrome last.** Every screen points at the user's job (find an event, register, check in, publish, report) and then steps back. Decoration that doesn't serve the task is removed.
- **Comfortable density.** Admins live in tables and forms. Make dense data scannable and legible, never cramped; breathing room is a feature, not a luxury.
- **State is always honest.** Capacity, waitlist, registration status, and the calendar must always reflect reality clearly. Status color and labels carry real meaning, never decoration.
- **Two audiences, one system.** The employee catalog should feel light and self-serve; the admin shell should feel like a confident power tool. Same identity, different density.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Maintain AA contrast on text and interactive elements, visible keyboard focus (the 2px brand focus ring on every control), full keyboard navigation for forms, tables, dialogs, and the calendar. Respect `prefers-reduced-motion`. Do not rely on color alone to convey status; pair status color with text or icon. Italian as the primary language; keep labels and error messages plain and concrete.
