# Brand assets

The mark is a peak whose upper edges are solid and whose base dissolves into
dashes: the shape is public, the mass underneath it is not. That is the product
in one figure — side disclosed, size sealed until reveal.

| File | Use |
|---|---|
| `darkstake-cover.png` | 1200×630 cover card for a submission page or link preview |
| `darkstake-logo.png` | Lockup, transparent, for dark backgrounds |
| `darkstake-logo-dark.png` | Lockup on the brand background, opaque |
| `darkstake-logo-light.png` | Lockup on white — accent darkened to hold contrast |
| `darkstake-mark.png` | Mark only, 1024², transparent |
| `darkstake-icon.png` | Mark only, 1024², opaque — for platforms that reject alpha |

Every PNG is rendered from the `.svg` beside it, which is the source of truth.

## Colours

| Token | Hex | Role |
|---|---|---|
| accent | `#a88fff` | violet — "shielded" |
| accent (on light) | `#6b46e5` | the same role, darkened for white backgrounds |
| background | `#070a10` | |
| foreground | `#e5e8ed` | |
| yes / no | `#23d091` / `#f25f76` | the two sides of a market |

Typeface is **Inter** (600 for the wordmark), matching the site.

## Re-rendering

The PNGs were produced with `@resvg/resvg-js` at the widths above, with Inter
supplied explicitly rather than resolved from system fonts — a wordmark that
silently falls back to Arial is a different logo.
