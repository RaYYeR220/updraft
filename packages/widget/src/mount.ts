const ROUND = /^0x[0-9a-fA-F]{40}$/;
const DEFAULT_HEIGHT = 560;

/**
 * Turns `<script src=".../updraft-widget.js" data-round="0x…">` into an embedded round: an iframe
 * pointing at the Updraft app's embed page, placed right after the script tag.
 */
export function mount(script: HTMLScriptElement): HTMLIFrameElement | null {
  const round = script.getAttribute("data-round") ?? "";
  if (!ROUND.test(round)) return null;

  let origin: string;
  try {
    origin = new URL(script.getAttribute("data-app") ?? script.src).origin;
  } catch {
    return null;
  }

  const frame = document.createElement("iframe");
  frame.src = `${origin}/embed/round/${round}`;
  frame.title = "Updraft round";
  frame.loading = "lazy";
  frame.style.width = "100%";
  frame.style.height = `${DEFAULT_HEIGHT}px`;
  frame.style.border = "0";
  frame.style.display = "block";
  frame.setAttribute("allow", "clipboard-write");
  script.insertAdjacentElement("afterend", frame);

  // The embed page reports its height; accept it only from our own frame and origin.
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.origin !== origin || e.source !== frame.contentWindow) return;
    const h = (e.data as { updraftHeight?: unknown } | null)?.updraftHeight;
    if (typeof h === "number" && h > 0 && h < 4000) frame.style.height = `${Math.round(h)}px`;
  });
  return frame;
}
