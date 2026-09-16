import { THEME_INIT_SCRIPT } from "./themeInitScript";

/**
 * Renders the pre-paint theme script into the document head.
 *
 * A server component with no props and no state: the markup it produces is the
 * same on every request, so it stays in the static shell rather than forcing
 * the page that hosts it to render per request.
 *
 * `next/script` is not used on purpose. Its strategies all place the script
 * after the document has begun rendering, which is the one thing this script
 * cannot tolerate.
 */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
