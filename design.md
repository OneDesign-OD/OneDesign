---
version: alpha
name: "xAI Light"
description: "xAI's marketing site uses a warm off-white surface palette anchored by --color-ivory (#f9f8f6) and --color-white (#ffffff), with near-black #0a0a0a as the dominant text and foreground color. The typographic system is split between universalSansDisplay for large display headings (60–72px, tight negative letter-spacing), universalSans for body and UI copy, and GeistMono for code and terminal contexts. Radius language is dominated by 9999px pill shapes on CTAs and tags, with 12px and 6px for cards and inputs. Elevation is minimal. cards use a soft multi-layer drop shadow while most surfaces are flat. The overall tone is technical-premium: restrained color, generous whitespace, and a strong monospace code aesthetic signaling developer credibility."
colors:
  dove: "#d5d9e2"
  ivory: "#f9f8f6"
  sunset: "#ff6308"
  white: "#ffffff"
  fog: "#7d8187"
  jet: "#0a0a0a"
  pewter: "#d7d1c9"
  umbra: "#1f2228"
typography:
  display-hero:
    fontFamily: "universalSansDisplay"
    fontSize: "60px"
    fontWeight: "500"
    lineHeight: "60px"
    letterSpacing: "-1.5px"
  display-large:
    fontFamily: "universalSansDisplay"
    fontSize: "72px"
    fontWeight: "400"
    lineHeight: "72px"
    letterSpacing: "-1.8px"
  body-default:
    fontFamily: "universalSans"
    fontSize: "16px"
    fontWeight: "400"
    lineHeight: "24px"
  label-medium:
    fontFamily: "universalSans"
    fontSize: "14px"
    fontWeight: "500"
    lineHeight: "20px"
  label-small:
    fontFamily: "universalSans"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "21.125px"
  code-default:
    fontFamily: "GeistMono"
    fontSize: "13px"
    fontWeight: "400"
    lineHeight: "24px"
  code-small:
    fontFamily: "GeistMono"
    fontSize: "12px"
    fontWeight: "400"
    lineHeight: "19.5px"
    letterSpacing: "-0.12px"
  code-tiny:
    fontFamily: "GeistMono"
    fontSize: "11px"
    fontWeight: "400"
    lineHeight: "17.875px"
    letterSpacing: "-0.11px"
rounded:
  radius-pill: "9999px"
  radius-card: "12px"
  radius-panel: "16px"
  radius-input: "8px"
  radius-tag: "6px"
  radius-badge: "4px"
  radius-chip: "3px"
spacing:
  spacing-1: "2px"
  spacing-2: "4px"
  spacing-3: "6px"
  spacing-4: "8px"
  spacing-5: "12px"
  spacing-6: "14px"
  spacing-7: "16px"
  spacing-8: "18px"
  spacing-9: "20px"
  spacing-10: "24px"
  spacing-11: "32px"
  spacing-12: "40px"
  spacing-13: "48px"
  spacing-14: "96px"
---

## Overview

xAI's marketing site uses a warm off-white surface palette anchored by --color-ivory (#f9f8f6) and --color-white (#ffffff), with near-black #0a0a0a as the dominant text and foreground color. The typographic system is split between universalSansDisplay for large display headings (60–72px, tight negative letter-spacing), universalSans for body and UI copy, and GeistMono for code and terminal contexts. Radius language is dominated by 9999px pill shapes on CTAs and tags, with 12px and 6px for cards and inputs. Elevation is minimal. cards use a soft multi-layer drop shadow while most surfaces are flat. The overall tone is technical-premium: restrained color, generous whitespace, and a strong monospace code aesthetic signaling developer credibility.

**Signature traits:**
- Dual typeface system: Pairs universalSansDisplay and universalSans across the type hierarchy.
- Soft, rounded geometry: Generous corner rounding up to 9999px.

## Colors

The palette uses 8 validated color tokens across 1 theme profile. Semantic roles stay attached to observed usage so generation agents can choose accents without inventing new color meaning.

**Semantic naming:**
- **action-text** maps to `jet`: Role "text" is grounded by usage context "Primary foreground, headings, body text, nav links, button text".
- **surface-background** maps to `white`: Role "background" is grounded by usage context "Page background, input background, ring offset".
- **action-primary** maps to `dove`: Role "primary" is grounded by usage context "Borders, dividers, button outlines, input borders".
- **content-text** maps to `fog`: Role "text" is grounded by usage context "Secondary text, muted labels, nav secondary items".

### Primary Brand
- **Dove** (#d5d9e2): Borders, dividers, button outlines, input borders. Role: primary. {authored: rgb(213, 217, 226), space: rgb, alpha: 0.2}

### Text Scale
- **Fog** (#7d8187): Secondary text, muted labels, nav secondary items. Role: text. {authored: rgb(125, 129, 135), space: rgb}
- **Jet** (#0a0a0a): Primary foreground, headings, body text, nav links, button text. Role: text. {authored: rgb(10, 10, 10), space: rgb, alpha: 0.06}
- **Pewter** (#d7d1c9): Muted body text, secondary descriptive copy in hero and footer. Role: text. {authored: rgb(215, 209, 201), space: rgb}
- **Umbra** (#1f2228): Dark surface fills, code block backgrounds, secondary dark text. Role: text. {authored: rgb(31, 34, 40), space: rgb}

### Surface & Shadows
- **Ivory** (#f9f8f6): Card and section surface fills. Role: background. {authored: rgb(249, 248, 246), space: rgb}
- **Sunset** (#ff6308): Accent highlights, CTA hover states. Role: background. {authored: rgb(255, 99, 8), space: rgb, alpha: 0.45}
- **White** (#ffffff): Page background, input background, ring offset. Role: background. {authored: rgb(255, 255, 255), space: rgb, alpha: 0.043}

## Typography

Typography uses universalSansDisplay, universalSans, GeistMono across extracted hierarchy roles. Keep hierarchy mapped to these token rows before adding decorative type styles.

Mixes universalSansDisplay and universalSans and GeistMono for visual contrast. Weight range spans medium, regular. Sizes range from 11px to 72px.

### Type Scale Evidence
| Role | Font | Size | Weight | Line Height | Letter Spacing | Stack / Features | Notes |
|------|------|------|--------|-------------|----------------|------------------|-------|
| Primary hero headline — 'Frontier AI models for everything you search.' | universalSansDisplay | 60px | 500 | 60px | -1.5px | universalSansDisplay, universalSansDisplay Fallback | Extracted token |
| Large section display headings | universalSansDisplay | 72px | 400 | 72px | -1.8px | universalSansDisplay, universalSansDisplay Fallback | Extracted token |
| Primary body copy, nav items, general UI text | universalSans | 16px | 400 | 24px | normal | universalSans, universalSans Fallback | Extracted token |
| Button labels, nav sub-items, UI control labels | universalSans | 14px | 500 | 20px | normal | universalSans, universalSans Fallback | Extracted token |
| Small descriptive labels, metadata, breadcrumbs | universalSans | 13px | 400 | 21.125px | normal | universalSans, universalSans Fallback | Extracted token |
| Code blocks, terminal output, API examples | GeistMono | 13px | 400 | 24px | normal | GeistMono, ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace | Extracted token |
| Inline code, small terminal snippets | GeistMono | 12px | 400 | 19.5px | -0.12px | GeistMono, ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace | Extracted token |
| Line numbers, micro code annotations | GeistMono | 11px | 400 | 17.875px | -0.11px | GeistMono, ui-monospace, SFMono-Regular, Roboto Mono, Menlo, Monaco, Liberation Mono, DejaVu Sans Mono, Courier New, monospace | Extracted token |

## Layout

Responsive system uses 4 breakpoint tier(s): mobile, tablet, desktop, wide.

This system uses a 4px base grid with scale values 2, 4, 6, 8, 12, 14, 16, 18, 20, 24, 32, 40, 48, 96.

### Responsive Strategy
- **mobile (360-600px)**: Constrain layout for small viewports and prioritize vertical stacking.
- **tablet (>= 640px)**: Increase spacing and column structure for medium-width viewports.
- **desktop (>= 1024px)**: Expand layout density and horizontal composition for wide viewports.
- **wide (>= 1536px)**: Stretch composition with generous gutters and wider layout spans.

### Spacing System
| Token | Value | Px | Notes |
|------|-------|----|-------|
| spacing-1 | 2px | 2 | Extracted spacing token |
| spacing-2 | 4px | 4 | Extracted spacing token |
| spacing-3 | 6px | 6 | Extracted spacing token |
| spacing-4 | 8px | 8 | Extracted spacing token |
| spacing-5 | 12px | 12 | Extracted spacing token |
| spacing-6 | 14px | 14 | Extracted spacing token |
| spacing-7 | 16px | 16 | Extracted spacing token |
| spacing-8 | 18px | 18 | Extracted spacing token |
| spacing-9 | 20px | 20 | Extracted spacing token |
| spacing-10 | 24px | 24 | Extracted spacing token |
| spacing-11 | 32px | 32 | Extracted spacing token |
| spacing-12 | 40px | 40 | Extracted spacing token |
| spacing-13 | 48px | 48 | Extracted spacing token |
| spacing-14 | 96px | 96 | Extracted spacing token |

## Elevation & Depth

Keep depth flat unless validated shadow or interaction evidence appears in the extraction payload. Do not invent shadows beyond this evidence boundary.

### Shadow Evidence
| Shadow Token | Layers | Details |
|--------------|--------|---------|
| n/a | 0 | No validated shadow payload |

### Interaction Signals
| Theme | Signal | Evidence |
|-------|--------|----------|
| Light | backdrop-filter | blur(4px) ; blur(12px) ; blur(0.5px) |
| Light | outline-style | solid |
| Light | outline-color | rgb(10, 10, 10) ; rgb(215, 209, 201) ; rgb(36, 41, 46) |
| Light | outline-width | 3px ; 2px |
| Light | outline-offset | 0px ; 2px |
| Light | transform | matrix(1, 0, 0, 1, 0, -0.130358) ; matrix(1, 0, 0, 1, 0, -1) ; matrix(1, 0, 0, 1, 0, 0) |

## Shapes

Shape language maps directly to rounded tokens. Keep component corners consistent with the role mapping below before introducing bespoke geometry.

### Radius Roles
| Token | Value | Px | Role Mapping |
|------|-------|----|--------------|
| radius-chip | 3px | 3 | Subtle corner |
| radius-badge | 4px | 4 | Subtle corner |
| radius-tag | 6px | 6 | Subtle corner |
| radius-input | 8px | 8 | Control corner |
| radius-card | 12px | 12 | Control corner |
| radius-panel | 16px | 16 | Card corner |
| radius-pill | 9999px | 9999 | Large surface corner |

### Geometry Evidence
| Radius Token | Shape | Units |
|--------------|-------|-------|
| radius-pill | 9999px | px |
| radius-card | 12px | px |
| radius-panel | 16px | px |
| radius-input | 8px | px |
| radius-tag | 6px | px |
| radius-badge | 4px | px |
| radius-chip | 3px | px |

## Components

(none detected)

## Do's and Don'ts

Guardrails protect Dual typeface system, Soft, rounded geometry without adding unsupported visual claims.

| Do | Don't |
|----|---------|
| Do maintain consistent spacing using the base grid | Don't make unsupported claims about absent visual features |
| Do maintain WCAG AA contrast ratios (4.5:1 for normal text) | Don't mix rounded and sharp corners in the same view |
| Do use the primary color only for the single most important action per screen |  |
| Do verify evidence before writing new design-system guidance |  |

## Responsive Evidence

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <= 600px | (max-width: 600px) |
| Mobile | >= 360px | (min-width: 360px) |
| Mobile | >= 480px | (min-width: 480px) |
| Mobile | >= 640px | (min-width: 640px) |
| Tablet | >= 768px | (min-width: 768px) |
| Desktop | >= 1024px | (min-width: 1024px) |
| Desktop | >= 1100px | (min-width: 1100px) |
| Desktop | >= 1280px | (min-width: 1280px) |
| Desktop | >= 1536px | (min-width: 1536px) |
| Desktop | >= 2000px | (min-width: 2000px) |
| Breakpoint 11 | Unknown | (forced-colors: active) |

## Agent Prompt Guide

### Example Component Prompts
- Create button component using validated primary color role and spacing tokens.
- Create card component with mapped radius role and evidence-backed elevation.
- Create form input component using inferred typography hierarchy and border roles.

### Iteration Guide
1. Start with extracted palette and typography roles only.
2. Map spacing and radius directly from token tables before visual polish.
3. Apply component patterns one section at a time and compare against source intent.
4. Keep elevation claims tied to explicit evidence in output.
5. Iterate with smallest diffs and re-check section hierarchy after each change.