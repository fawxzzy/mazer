# Mazer UI rework: Wave 2A DOM primitives

## Wave 2A boundary

Wave 2A establishes the base DOM vocabulary required by later application-UI
waves. It does **not** mount a new application shell, replace Phaser-owned game
presentation, change authentication, or make a visual-completion claim.

The source boundary is deliberately narrow:

- `AppShell` and `StageShell` provide safe-area-aware application and semantic
  stage containers.
- `MazerPanel` provides an opaque surface for future authentication, account,
  settings, and dialog composition.
- `MazerIcon`, `MazerButton`, and `MazerIconButton` provide one line-icon and
  native-button vocabulary.
- `MazerField` and `MazerPasswordField` provide labelled native inputs, a clean
  one-pixel outline/label notch, transparent field interiors, error semantics,
  and an in-field password visibility control.
- `MazerSlider` provides a labelled native range input and bound output.
- Wave 2A.1 adds `SettingRow`, `SettingsSection`, `MazerSwitch`,
  `MazerSegmentedControl`, `MazerScrollArea`, `StatusBanner`, and
  `ConfirmDialog` as stateless settings composition primitives.

Every factory accepts an explicit `Document` for deterministic tests. The
default remains the current browser document. None mounts itself or retains
application, authentication, network, persistence, command, or store state.
The password visibility bit is transient presentation state owned by the
returned DOM nodes and is never serialized.

## Renderer ownership

Phaser continues to own the maze world, title animation, world entities,
camera effects, and menu demonstration maze. These primitives are DOM-only and
do not import or call `MenuScene`. They remain unreferenced by shipping runtime
entrypoints until a later dependency-ordered integrator wave owns composition
and cleanup.

Consequently, Wave 2A changes no production appearance. Visual acceptance is
deferred to the route-aware wave that mounts each primitive family.

## Accessibility and interaction contracts

- Actions use native `<button type="button">` elements.
- Fields use native `<label for>` and `<input>` relationships.
- Slider value output uses the native `for` relationship.
- Interactive controls have a minimum 44 by 44 CSS-pixel target.
- Icons are line-only SVGs using `currentColor`; decorative icons are hidden
  from assistive technology and named icons expose `role="img"`.
- The password eye is exactly 20 by 20 inside a 44 by 44 button, exposes
  `aria-label` and `aria-pressed`, and never captures the input value.
- Errors set `aria-invalid`, attach through `aria-describedby`, and use an
  alert role.
- Keyboard focus remains visible and reduced-motion preferences disable
  decorative primitive transitions.
- Boolean settings use a native checkbox with `role="switch"`; finite settings
  use native radios inside a radiogroup rather than tab semantics.
- Settings overflow has one native `pan-y` scroll owner that consumes shell
  safe-area and dock-clearance variables.
- Status banners remain nonblocking polite live regions unless explicitly
  urgent, while confirmation dialogs start on Cancel, trap focus, close safely
  on Escape, and restore the invoking control.

## Visual contracts

- Panels have an opaque canonical panel/elevated background.
- Input interiors remain transparent so panel tone owns the fill.
- Field outlines and button outlines use the one-pixel hairline token.
- Field labels use the owning panel background to create a clean outline notch.
- The implementation consumes semantic token variables with deterministic
  fallback values; it does not introduce a second player-facing theme.

## Fitness pattern intake

| Fitness precedent | Disposition | Mazer contract |
| --- | --- | --- |
| Native labels and inputs | ADOPT | Preserve semantic label/control relationships and browser input behavior. |
| Password eye geometry | ADOPT | 20x20 line icon within a minimum 44x44 native button. |
| Opaque auth/account surface | ADOPT | Use `MazerPanel`; never depend on the game canvas for form readability. |
| Field outline and floating label | ADAPT | Retain the clean one-pixel notch while using Mazer semantic tokens and typography. |
| Fitness state/auth hooks | N/A | Wave 2A is state-, network-, persistence-, and provider-free. |
| Fitness route composition | N/A | Mazer composition remains owned by later dependency-ordered UI waves. |

Wave 2A.1 additionally **adopts** safe-default responsive layouts and the
one-overlay/recoverable-interaction rule; **adapts** Fitness switch, segmented
control, safe-area, persistent-dock, and reduced-motion lessons to framework-free
Mazer DOM semantics; and marks install capability, persistent-state versioning,
Fitness auth/workout schemas, React components, and Fitness visual tokens as
**not applicable** to this source-only lane.

## Wave 2A.1 settings boundary

The settings tranche is implemented and registered, but remains deliberately
unmounted. It owns native semantics, controlled presentation, safe scrolling,
safe-default confirmation focus, and component styling only. It does not read or
write preferences, dispatch commands, call providers, mount a settings route, or
change `MenuScene`. Later Wave 3C wiring owns view-model projection, persistence,
one-overlay enforcement, and route-aware visual acceptance.

## Verification and follow-on

Wave 2A acceptance requires source-level and constructed-DOM tests for native
semantics, accessible names and relationships, icon geometry, target sizing,
opaque/transparent surface rules, exact source isolation, decision-registry
truth, TypeScript, the canonical test and fixture suites, and the production
build. No route screenshot can truthfully prove these primitives in Wave 2A
because mounting is intentionally excluded.

The next consumer wave must own mounting, cleanup, view-model projection,
route-aware keyboard/pointer/touch evidence, and before/after screenshots. It
must not push domain state into these factories or make them query a provider.
