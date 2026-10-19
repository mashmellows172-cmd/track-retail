---
name: Lumina Finance
colors:
  surface: '#10131a'
  surface-dim: '#10131a'
  surface-bright: '#363941'
  surface-container-lowest: '#0b0e15'
  surface-container-low: '#191b23'
  surface-container: '#1d2027'
  surface-container-high: '#272a31'
  surface-container-highest: '#32353c'
  on-surface: '#e1e2ec'
  on-surface-variant: '#c2c6d6'
  inverse-surface: '#e1e2ec'
  inverse-on-surface: '#2e3038'
  outline: '#8c909f'
  outline-variant: '#424754'
  surface-tint: '#adc6ff'
  primary: '#adc6ff'
  on-primary: '#002e6a'
  primary-container: '#4d8eff'
  on-primary-container: '#00285d'
  inverse-primary: '#005ac2'
  secondary: '#4edea3'
  on-secondary: '#003824'
  secondary-container: '#00a572'
  on-secondary-container: '#00311f'
  tertiary: '#ffb786'
  on-tertiary: '#502400'
  tertiary-container: '#df7412'
  on-tertiary-container: '#461f00'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#d8e2ff'
  primary-fixed-dim: '#adc6ff'
  on-primary-fixed: '#001a42'
  on-primary-fixed-variant: '#004395'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffdcc6'
  tertiary-fixed-dim: '#ffb786'
  on-tertiary-fixed: '#311400'
  on-tertiary-fixed-variant: '#723600'
  background: '#10131a'
  on-background: '#e1e2ec'
  surface-variant: '#32353c'
typography:
  display-lg:
    fontFamily: Outfit
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Outfit
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Outfit
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Outfit
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  label-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  container-max: 1280px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 40px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
---

## Brand & Style

The design system is engineered for a premium financial experience that merges the stability of traditional banking with the high-velocity energy of crypto-native platforms. The visual narrative centers on **Glassmorphism** and **Modern Dark Mode**, creating a sense of depth and digital transparency.

The target audience consists of sophisticated investors and tech-savvy users who equate high-fidelity aesthetics with platform security and innovation. The UI should evoke a sense of being "inside the machine"—controlled, futuristic, and precise.

- **Primary Style:** Glassmorphism. Surfaces use multi-layered transparency and background blurs to maintain context while focusing on the active task.
- **Atmosphere:** Dark, immersive, and high-contrast. 
- **Transitions:** Fluid motion and subtle glows indicate system responsiveness and data "vitality."

## Colors

This design system utilizes a deep, multi-dimensional dark palette. The background is not a flat hex, but a complex mesh gradient transitioning from Deep Indigo (#0F172A) to subtle Violet (#1E1B4B) tones.

- **Primary (Electric Blue):** Used for primary actions, progress indicators, and active states.
- **Success (Neon Emerald):** Reserved for positive financial trends, confirmations, and "Growth" signals. This color should always be accompanied by a 15px glow effect when used in data visualization or critical buttons.
- **Surface Strategy:** Layers are built using translucent white (5%) or black (20%) overlays. This allows the background mesh gradient to peak through, ensuring the UI feels light despite the dark palette.

## Typography

The typography strategy balances high-impact headers with hyper-legible body text. 

- **Outfit** is used for all brand-facing elements, large financial figures, and headings. Its geometric nature complements the modern glass aesthetic.
- **Inter** handles all functional text, data tables, and descriptions. Its neutral profile ensures high readability across dense financial information.
- **Numbers:** In financial dashboards, use `tabular-nums` for alignment in lists and tables.

## Layout & Spacing

The layout utilizes a **12-column fluid grid** for desktop and a **4-column grid** for mobile. 

- **Breathing Room:** Large 40px margins on desktop reinforce the premium, "un-crowded" feel.
- **Stacking:** Elements are grouped using an 8px base-unit system. Use `stack-lg` for separating major sections and `stack-sm` for internal component spacing.
- **Responsive Behavior:** On mobile, glass cards should expand to the edge of the margin, while background blurs are increased to maintain legibility over moving gradients.

## Elevation & Depth

Depth is achieved through physical layering and light refraction rather than traditional shadows.

- **Layer 0 (Background):** Deep mesh gradients.
- **Layer 1 (Cards/Panels):** `backdrop-blur-md` with `bg-white/5`. 1px border of `white/10`.
- **Layer 2 (Modals/Popovers):** `backdrop-blur-lg` with `bg-white/10`. 1px border of `white/20`.
- **Active Effects:** Elements in an "Active" or "Success" state utilize neon glows: `drop-shadow(0 0 15px rgba(16, 185, 129, 0.4))`.
- **Interaction:** On hover, glass cards should increase their opacity slightly (e.g., from `white/5` to `white/8`) and lift by 2px to signal interactivity.

## Shapes

The design system uses a **Rounded** (0.5rem base) corner strategy. This softens the technical aesthetic, making the platform feel approachable and sophisticated.

- **Base Radius:** 8px for standard components like input fields and buttons.
- **Large Radius:** 16px (rounded-lg) for main containers and dashboard cards.
- **Extra Large Radius:** 24px (rounded-xl) for promotional banners or primary modals.

## Components

### Buttons
- **Primary:** Gradient fill (Electric Blue to a slightly darker shade), white text, no border. On hover: Increase glow intensity.
- **Ghost/Glass:** `bg-white/5` with `border-white/10`. Transitions to `white/15` on hover.

### Input Fields
- Background: `bg-black/20`.
- Border: `border-white/10`.
- Focus State: Border changes to Electric Blue with a subtle 4px outer glow.

### Cards
- Always use `backdrop-blur-md`.
- Include a 1px top-down linear gradient border (white/20 to white/5) to simulate a "light catch" on the top edge.

### Chips & Badges
- Used for categories or status.
- Success Badges: `bg-emerald-500/10` text-emerald-400 with a subtle green glow.

### Financial Lists
- High-contrast typography for figures. 
- Use "Inter" for secondary labels in `text-white/50`.
- Dividers should be `white/5` with no thickness (1px).

### Charts
- Line charts should use a 2px stroke width with a gradient "area" fill below the line that fades from `primary/20` to `transparent`.