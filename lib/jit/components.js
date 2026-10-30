/*!
 * Hygular v1.0.0-beta.1
 * (c) Eyruz Badalzada
 * Released under the MIT License
 * https://hygular.com
 */

/** Runtime-owned classes. Keep this contract in sync with component markup. */
const words = (value) => value.split(/\s+/).filter(Boolean);
export const COMPONENTS = {
  modal: {
    roots: ["modal"],
    classes: words(
      "modal modal-dialog modal-header modal-body modal-actions modal-close modal-confirm modal-backdrop is-open is-center is-top is-bottom status-icon status-svg status-ring status-mark status-dot is-success is-error is-warning is-info is-animated is-second button is-primary-ghost is-dark-ghost",
    ),
  },
  toast: {
    roots: ["toast"],
    classes: words(
      "toast toast-icon toast-message toast-progress hygular-toast-container hygular-toast-container-top hygular-toast-container-bottom is-active is-top is-bottom has-icon is-success is-danger is-warning is-info is-default",
    ),
  },
  tooltip: {
    roots: ["tooltip"],
    classes: words(
      "tooltip is-open has-arrow is-top is-bottom is-left is-right",
    ),
  },
  popover: {
    roots: ["popover"],
    classes: words(
      "popover popover-header popover-body is-open has-arrow is-top is-bottom is-left is-right is-start is-end",
    ),
  },
  select: {
    roots: ["custom-select"],
    classes: words(
      "custom-select selected-option options-container select-option option-icon select-tag tag-remove more-tag form-input is-open is-active is-selected is-disabled",
    ),
  },
  range: {
    roots: ["form-range"],
    classes: words(
      "form-range form-range-dual form-range-dual-track form-range-dual-fill form-range-tooltip form-range-ticks form-range-tick form-range-tick-label is-visible",
    ),
  },
  carousel: {
    roots: ["carousel"],
    classes: words(
      "carousel carousel-items item is-fade is-active item-caption pager thumbnails thumbnail-image carousel-next carousel-prev next-icon prev-icon",
    ),
  },
  alert: {
    roots: ["alert"],
    classes: words(
      "alert alert-content alert-close button has-icon animation-none border-0 is-success is-danger is-warning is-info is-default",
    ),
  },
  skeleton: {
    roots: [],
    classes: words(
      "hygular-sk-wave-overlay hygular-sk-ghost hygular-sk-error-layer hygular-sk-error-msg hygular-sk-retry",
    ),
  },
  accordion: {
    roots: ["accordion"],
    classes: words(
      "accordion accordion-item accordion-toggler accordion-content accordion-inner is-open",
    ),
  },
  dropdown: {
    roots: ["dropdown"],
    classes: words(
      "dropdown dropdown-trigger dropdown-menu dropdown-content is-active",
    ),
  },
  drawer: {
    roots: ["drawer"],
    classes: words(
      "drawer drawer-panel drawer-close drawer-header drawer-title drawer-body drawer-footer is-open",
    ),
  },
  navbar: {
    roots: ["navbar"],
    classes: words(
      "navbar navbar-start navbar-center navbar-end navbar-brand brand-link navbar-links navbar-toggler navbar-menu is-active",
    ),
  },
  tabview: {
    roots: ["tab-content", "is-tabview"],
    classes: words(
      "nav nav-item nav-link is-tabview tab-content tab-indicator is-active is-open is-instant",
    ),
  },
  swiper: {
    roots: ["swiper"],
    classes: words("swiper swiper-wrapper swiper-item is-dragging"),
  },
  collapse: { roots: ["collapse"], classes: words("collapse is-open") },

  badge: { roots: ["badge"], classes: words("badge") },

  form: {
    roots: [],
    classes: words(
      "form-feedback is-valid is-invalid is-server with-success with-error user-valid user-invalid floating-label-visible button is-loading",
    ),
  },
  darkmode: {
    roots: ["dark-mode-toggler"],
    classes: words(
      "dark-mode-toggler dark-mode-toggler-track dark-mode-toggler-thumb dark-mode-toggler-sun dark-mode-toggler-moon is-fixed",
    ),
  },
  lazyimage: {
    roots: ["hygular-lazy-image"],
    classes: words(
      "hygular-lazy-image hygular-image-wrap hygular-image-loaded hygular-image-shimmer hygular-image-error-layer is-visible",
    ),
  },
};

COMPONENTS.form.anchors = words(
  "form-input form-textarea form-select form-file form-checkbox form-radio floating-label select-label",
);

COMPONENTS.form.groups = [
  words(
    "form-feedback is-valid is-invalid is-server with-success with-error user-valid user-invalid floating-label-visible",
  ),
  words("button is-loading"),
];

// Keep modifiers on their owning parts rather than sharing them with buttons.
COMPONENTS.modal.groups = [
  words(
    "modal modal-dialog modal-header modal-body modal-actions modal-close modal-confirm modal-backdrop is-open is-center is-top is-bottom",
  ),
  words(
    "status-icon status-svg status-ring status-mark status-dot is-success is-error is-warning is-info is-animated is-second",
  ),
  words("button modal-close modal-confirm is-primary-ghost is-dark-ghost"),
];
COMPONENTS.alert.groups = [
  words(
    "alert alert-content alert-close has-icon animation-none border-0 is-success is-danger is-warning is-info is-default",
  ),
  words("button alert-close"),
];

export function componentName(name) {
  const key = name.replace(/^use/, "").replace(/[-_]/g, "").toLowerCase();
  return Object.hasOwn(COMPONENTS, key) ? key : null;
}

export function expandComponents(classes, components = new Set()) {
  const active = new Set(components);
  for (const [name, entry] of Object.entries(COMPONENTS)) {
    if (entry.roots.some((root) => classes.has(root))) active.add(name);
  }
  const expanded = new Set(classes);
  for (const name of active)
    for (const cls of COMPONENTS[name]?.classes || []) expanded.add(cls);
  return { classes: expanded, components: active };
}
