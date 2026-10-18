import { mount } from "./mount.js";

const current = document.currentScript as HTMLScriptElement | null;
if (current) {
  mount(current);
} else {
  for (const s of Array.from(document.querySelectorAll<HTMLScriptElement>("script[data-round]"))) {
    if (!s.dataset.updraftMounted) {
      s.dataset.updraftMounted = "1";
      mount(s);
    }
  }
}
