/**
 * Public interface of the demo sign-in control.
 *
 * The control is browser-safe and imports no backend module: whether demo
 * sign-in is available at all is decided on the server, and expressed by
 * whether a page renders this at all.
 */
export {
  DemoRoleSwitcher,
  type DemoRoleSwitcherProps,
  type DemoRoleSwitcherVariant,
} from "./components/DemoRoleSwitcher";
