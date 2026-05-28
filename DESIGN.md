---
name: Eurospital Eventi
description: Calm, trustworthy event-booking platform for a medical organization
colors:
  brand-blue: "#3a7fb3"
  brand-blue-deep: "#2a6695"
  brand-blue-hover: "#1f4e74"
  brand-blue-active: "#163a57"
  brand-tint: "#eef6fb"
  brand-tint-strong: "#d8eaf4"
  brand-ink: "#163a57"
  surface: "#ffffff"
  foreground: "#0f1729"
  muted-foreground: "#6b7689"
  border: "#e2e8f0"
  destructive: "#dc2626"
  success: "#059669"
  warning: "#d97706"
typography:
  display:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  headline:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  title:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 500
    lineHeight: 1.4
  body:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.4
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  pill: "9999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.brand-blue-deep}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-blue-hover}"
    textColor: "{colors.surface}"
  button-primary-active:
    backgroundColor: "{colors.brand-blue-active}"
    textColor: "{colors.surface}"
  button-outline:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  badge-default:
    backgroundColor: "{colors.brand-tint-strong}"
    textColor: "{colors.brand-ink}"
    rounded: "{rounded.pill}"
    padding: "2px 10px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.md}"
    padding: "4px 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.foreground}"
    rounded: "{rounded.lg}"
    padding: "24px"
---

# Design System: Eurospital Eventi

## 1. Overview

**Creative North Star: "The Clinical Calm"**

Eurospital Eventi is the booking layer for a medical organization's events: courses, meetings, congresses. The interface earns trust by getting out of the way. Calm blues, generous whitespace, and one quiet accent carry the whole product. Nothing shouts. The user came to find an event and reserve a seat, not to admire chrome, so every surface points at that task and then steps back.

The system is built on shadcn/ui primitives over Tailwind, with a single blue identity scale (`brand-50` through `brand-950`). Density is medium: comfortable for an admin scanning a table of registrations, never cramped. Depth is real but soft. Cards lift off the page with a low ambient shadow rather than floating dramatically, and buttons feel physical under the cursor.

What this system rejects: dark-mode-by-default dashboards, neon SaaS gradients, gradient text, decorative glassmorphism, and the cold sterility of a default Bootstrap admin. Clinical does not mean lifeless. It means clean, legible, and confident.

**Key Characteristics:**
- One blue identity scale; color used sparingly and meaningfully
- Layered depth: low ambient shadows separate surfaces
- Tactile, confident buttons with visible hover and active states
- Medium density, comfortable for long admin tables
- System sans for fast, neutral, native-feeling reading

## 2. Colors

A single blue family is the entire identity. Neutrals are cool, tinted toward the brand hue. Semantic colors appear only on status.

### Primary
- **Brand Blue** (#3a7fb3): the live identity color. Calendar events, links, focus rings, accents. The blue users associate with the platform.
- **Brand Blue Deep** (#2a6695): primary button fill at rest. The committed action color.

### Secondary
- **Brand Blue Hover** (#1f4e74): primary button hover. One step darker, signals press readiness.
- **Brand Blue Active** (#163a57): pressed state and the darkest structural ink. Also used for strong headings on tinted surfaces.

### Tertiary
- **Brand Tint** (#eef6fb): faint blue wash for accent backgrounds and selected rows.
- **Brand Tint Strong** (#d8eaf4): default badge background, paired with deep-ink text.

### Neutral
- **Surface** (#ffffff): page and card background.
- **Foreground** (#0f1729): primary text. Near-black, tinted cool.
- **Muted Foreground** (#6b7689): secondary text, descriptions, placeholders.
- **Border** (#e2e8f0): hairline dividers, input strokes, card edges.

### Semantic
- **Destructive** (#dc2626): delete, cancel-event, error states.
- **Success** (#059669): confirmed registration, completed actions.
- **Warning** (#d97706): waitlist, near-capacity, attention states.

### Named Rules
**The One Blue Rule.** There is exactly one identity hue. Every accent, link, focus ring, and primary action draws from the brand scale. Resist adding a second brand color; the calm comes from restraint.

**The Status-Only Color Rule.** Red, green, and amber appear only to communicate state (error, success, warning). They are never decorative.

## 3. Typography

**Display / Body Font:** System sans stack (system-ui, -apple-system, Segoe UI, Roboto, sans-serif)
**Label Font:** Same stack, lighter sizing and medium weight

**Character:** Neutral and native. The system font renders instantly, matches the user's OS, and disappears into the content. Personality comes from hierarchy and spacing, not from a typeface.

### Hierarchy
- **Display** (600, 1.5rem / text-2xl, tracking-tight): page titles, primary `h1`.
- **Headline** (600, 1.25rem / text-xl, tracking-tight): section headers, `h2`.
- **Title** (500, 1.125rem / text-lg): card titles, `h3`, dialog headings.
- **Body** (400, 0.875rem / text-sm, line-height 1.6): default reading size. Cap long-form blocks at 65-75ch.
- **Label** (500, 0.75rem / text-xs): badges, table headers, helper text, form labels.

### Named Rules
**The Hierarchy-Not-Weight Rule.** Establish rank through scale and weight contrast (semibold titles over regular body), not through color. Colored text is reserved for links and status.

## 4. Elevation

The system is **layered**. Surfaces are not flat; they sit above the page on a low, soft ambient shadow that conveys structure without drama. The shadow is the boundary, so card borders stay hairline and quiet. Hover and focus add a perceptible lift on interactive elements, reinforcing the tactile feel.

### Shadow Vocabulary
- **Soft** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.04)`): inputs, buttons, small controls at rest.
- **Card** (`box-shadow: 0 1px 3px 0 rgb(15 35 60 / 0.06), 0 1px 2px -1px rgb(15 35 60 / 0.05)`): cards and panels. Tinted toward brand ink, not neutral black.

### Named Rules
**The Tinted-Shadow Rule.** Card shadows carry the brand ink hue (rgb 15 35 60), never pure black. The depth reads as part of the same calm blue world.

## 5. Components

### Buttons
- **Shape:** gently rounded (10px, `rounded-md`).
- **Primary:** brand-deep fill (#2a6695) with white text, soft shadow, `h-9 px-4`.
- **Hover / Active:** darken one step to brand-hover (#1f4e74), then brand-active (#163a57) on press. The two-step darkening is the tactile signature.
- **Outline / Ghost / Secondary:** outline on hairline border with accent-tint hover; ghost is borderless with the same tint; secondary uses the cool neutral fill.
- **Link:** brand-blue text, underline on hover only.
- **Focus:** 2px brand ring with a 2px offset on every variant.

### Badges
- **Shape:** full pill (`rounded-full`), `px-2.5 py-0.5`, text-xs medium.
- **Default:** brand-tint-strong background (#d8eaf4) with deep-ink text.
- **Status variants:** success (emerald), warning (amber), destructive (red) all as tint + dark-text pairs. Outline variant is text-only.

### Cards / Containers
- **Corner Style:** 12px (`rounded-lg`).
- **Background:** white surface.
- **Shadow Strategy:** Card shadow (see Elevation). Tinted, low, ambient.
- **Border:** hairline (#e2e8f0), works with the shadow, not instead of it.
- **Internal Padding:** 24px (`p-6`); header and content share the same inset.

### Inputs / Fields
- **Style:** hairline border, white background, 10px radius, soft shadow, `h-9`.
- **Focus:** 2px brand ring with offset; no border-color shift needed, the ring carries it.
- **Disabled:** reduced opacity, not-allowed cursor.

### Navigation
- **Style:** responsive; collapses to a mobile menu (admin and user shells both). Active route uses brand color; hover uses accent tint.

### Calendar (signature component)
FullCalendar themed to the brand scale. Toolbar buttons use brand-deep (#2a6695), hover brand-hover, active brand-active. Events render borderless on brand-blue (#3a7fb3) fills with a pointer cursor. This is the heart of the product: keep it brand-consistent, never the library default purple.

## 6. Do's and Don'ts

### Do:
- **Do** keep one blue identity scale for every accent and action.
- **Do** use the two-step button darkening (deep, hover, active) for tactile feedback.
- **Do** lift surfaces with the tinted Card shadow plus a hairline border.
- **Do** reserve red / green / amber strictly for status.
- **Do** cap long-form text at 65-75ch and lead hierarchy with scale and weight.

### Don't:
- **Don't** introduce a second brand hue or any gradient accent.
- **Don't** use gradient text (`background-clip: text`).
- **Don't** ship dark mode by default; this is a calm, light medical product.
- **Don't** use decorative glassmorphism or blur as ornament.
- **Don't** use `border-left` greater than 1px as a colored stripe on cards, list items, or alerts.
- **Don't** let the calendar fall back to its default library colors; theme it to the brand scale.
- **Don't** ship a generic Bootstrap admin look: flat grey, dense tables without breathing room, default-template chrome.
- **Don't** evoke legacy enterprise gestionale: nested menus, extreme density, absent hierarchy.
- **Don't** add consumer/social playfulness (emoji everywhere, excessive animation); inappropriate for a medical context.
