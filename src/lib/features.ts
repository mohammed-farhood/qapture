/**
 * features.ts — things that are built but deliberately not shown.
 *
 * A flag here means "this works, it is just not earning its place in the panel
 * right now". It is not a kill switch for broken code and it is not a config
 * the host app can set: flipping one is a one-line source edit and a release,
 * which is the point — the code, its tests and its strings all stay alive and
 * compiled, so turning it back on is a decision rather than an archaeology
 * project.
 */

/**
 * The Guide tab (GuideSection — the journey planner and its lanes).
 *
 * Off since 0.7.8, at the owner's request: the panel's real job is capture and
 * the log, and a third tab that nobody is using yet costs a third of the tab
 * bar on every single session. Nothing about it was removed — GuideSection,
 * its strings, its state and the `?qa=walk` deep links are all still here and
 * still type-checked — so this comes back by setting this to `true`.
 */
export const GUIDE_TAB_ENABLED = false;
