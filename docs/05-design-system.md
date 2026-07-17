# 05 — Design system specification

## Visual direction

AssetDesk uses a warm cream background, white operational surfaces, and purple
brand actions. It should feel like a compact university operations application,
not a marketing site. Density is controlled without reducing readability or
touch accuracy.

## Colour tokens

| Token             |     Value | Use                               |
| ----------------- | --------: | --------------------------------- |
| `background`      | `#FBF8F3` | Application background            |
| `surface`         | `#FFFFFF` | Cards, forms, menus               |
| `surface-tint`    | `#F7F3FF` | Selected or featured area         |
| `primary`         | `#6D28D9` | Primary action, link, active icon |
| `primary-hover`   | `#5B21B6` | Hover                             |
| `primary-pressed` | `#4C1D95` | Pressed and strong heading        |
| `primary-soft`    | `#EDE9FE` | Selected navigation and chips     |
| `primary-border`  | `#C4B5FD` | Soft purple boundary              |
| `text-strong`     | `#29252D` | High-emphasis text                |
| `text-default`    | `#3B3541` | Body text                         |
| `text-secondary`  | `#625C68` | Secondary information             |
| `text-muted`      | `#6B6570` | Metadata                          |
| `border-subtle`   | `#E4DDE9` | Cards and dividers                |
| `border-control`  | `#8A8192` | Input boundary                    |
| `focus`           | `#7C3AED` | Keyboard focus                    |
| `danger`          | `#B42318` | Overdue, lost, destructive        |
| `danger-soft`     | `#FEF3F2` | Danger container                  |
| `warning`         | `#B54708` | Due soon, damaged                 |
| `warning-soft`    | `#FFFAEB` | Warning container                 |
| `success`         | `#067647` | Returned, success                 |
| `success-soft`    | `#ECFDF3` | Success container                 |
| `info`            | `#175CD3` | Partial return, information       |
| `info-soft`       | `#EFF8FF` | Information container             |

Primary/semantic foreground combinations must meet WCAG contrast requirements.
Status meaning always combines a label and icon with colour.

## Typography

Use self-hosted **Manrope Variable** with a system fallback:

```css
font-family:
  'Manrope',
  Inter,
  system-ui,
  -apple-system,
  'Segoe UI',
  sans-serif;
```

Use `font-display: swap`. If a future Hindi interface uses Devanagari, load a
subset of Noto Sans Devanagari only for that locale.

| Token              | Size / line height | Weight |
| ------------------ | ------------------ | -----: |
| Display            | 32 / 40 px         |    700 |
| Page title desktop | 24 / 32 px         |    700 |
| Page title mobile  | 22 / 28 px         |    700 |
| Section title      | 18 / 26 px         |    700 |
| Card title         | 16 / 24 px         |    700 |
| Body/input         | 16 / 24 px         |    500 |
| Compact body       | 14 / 20 px         |    500 |
| Label              | 13 / 18 px         |    600 |
| Metadata           | 12 / 16 px         |    500 |
| KPI number         | 24 / 28 px         |    700 |

Inputs remain 16 px on mobile. IDs, dates, quantities, and metrics use tabular
numerals. Avoid uppercase paragraphs and labels.

## Spacing and shape

- Spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48 px.
- Mobile horizontal gutter: 16 px.
- Tablet/desktop horizontal gutter: 24 px.
- Input and button radius: 10 px.
- Card radius: 14 px.
- Dialog and sheet radius: 18 px.
- Mobile card padding: 14 px.
- Desktop card padding: 16–20 px.
- Pills are reserved for statuses and compact filters.

Default card shadow:

```css
box-shadow:
  0 1px 2px rgba(44, 37, 52, 0.06),
  0 4px 16px rgba(67, 45, 90, 0.05);
```

## Control sizing

- Mobile input/button height: 48 px.
- Desktop input/button height: 44 px.
- Icon-button interactive area: at least 44×44 px.
- Standard icon: 20 px.
- Bottom-navigation icon: 22–24 px.
- Table row: 52 px.
- Table header: 44 px.

Use Lucide icons with a consistent 1.75–2 px stroke. An icon-only action needs an
accessible name and desktop tooltip. Mobile primary navigation always has labels.

## Core components

The first reusable component set contains:

- AppShell, TopBar, Sidebar, NavigationRail, BottomNavigation
- Button: primary, secondary, quiet, danger, icon
- TextField, PasswordField, TextArea, Select, SearchCombobox
- DatePresetGroup and DateTimeField
- AppCard, MetricCard, IssueCard, ReceiverCard, MaterialCard
- StatusBadge
- DataTable and mobile CardList
- Pagination and ResultCount
- FilterBar and FilterSheet
- Dialog, BottomSheet, SideSheet, Menu, Tooltip
- StepHeader and StickyFormActions
- ActivityTimeline
- Skeleton, InlineProgress, EmptyState, ErrorState
- Toast and persistent Banner

Components own their focus, loading, disabled, error, and reduced-motion states.

## Status presentation

| Status             | Colour role  | Icon example  |
| ------------------ | ------------ | ------------- |
| Issued             | Primary/info | Package/arrow |
| Due soon           | Warning      | Clock         |
| Overdue            | Danger       | Alert circle  |
| Partially returned | Info         | Split arrows  |
| Returned           | Success      | Check circle  |
| Damaged            | Warning      | Tool/triangle |
| Lost               | Danger       | Search X      |
| Cancelled          | Muted        | Circle slash  |

## Motion tokens

| Token    | Duration | Use                        |
| -------- | -------: | -------------------------- |
| Instant  |    80 ms | Press feedback             |
| Fast     |   120 ms | Hover/focus colour         |
| Standard |   180 ms | Menu, chip, tooltip        |
| Medium   |   240 ms | Drawer and page transition |
| Slow     |   320 ms | Dialog and bottom sheet    |

Easing:

```text
Enter/standard: cubic-bezier(0.2, 0, 0, 1)
Exit:           cubic-bezier(0.4, 0, 1, 1)
```

Page transitions use opacity and at most 4 px movement. Under
`prefers-reduced-motion: reduce`, spatial movement and shimmer are removed.

## Form behavior

- Labels remain visible; placeholders only provide examples.
- Required state is communicated in text, not colour alone.
- Helper text precedes an error.
- Validate after blur and again on submit.
- Keep all valid values after an error.
- Invalid submission focuses an error summary and then the first invalid field.
- Back navigation preserves step data.
- Review is required before Issue or Return confirmation.
- Buttons show an inline activity state and cannot submit twice.

## Responsive behavior

- 320–599 px: single column, mobile cards, fixed safe-area bottom navigation.
- 600–839 px: navigation rail and one/two-column composition.
- 840–1199 px: collapsible sidebar, tables, optional side sheet.
- 1200 px and above: persistent sidebar and max 1440 px content.
- No page-level horizontal scrolling.
- Long tables change to mobile cards instead of shrinking columns.

## Accessibility acceptance

- WCAG 2.2 AA target.
- Text contrast at least 4.5:1; meaningful non-text controls at least 3:1.
- Visible 2 px focus outline with 2 px offset.
- Keyboard focus is never hidden under sticky bars.
- Logical heading hierarchy with one `h1` per screen.
- Semantic navigation, main, forms, tables, lists, and buttons.
- Dialog focus trap, Escape support, and focus return.
- Dynamic result/loading messages use an accessible status region.
- 200% text zoom does not clip content or actions.
- All core flows work at 320 px without horizontal page scroll.
