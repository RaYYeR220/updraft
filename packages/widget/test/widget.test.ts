// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "../src/mount.js";

const ROUND = "0x1111111111111111111111111111111111111111";

function script(attrs: Record<string, string>) {
  const s = document.createElement("script");
  for (const [k, v] of Object.entries(attrs)) s.setAttribute(k, v);
  document.body.appendChild(s);
  return s;
}

describe("widget", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("inserts a sized iframe for the round right after the script tag", () => {
    const s = script({ "data-round": ROUND, src: "https://updraft.example/updraft-widget.js" });
    const frame = mount(s);
    expect(frame).not.toBeNull();
    expect(frame!.src).toBe(`https://updraft.example/embed/round/${ROUND}`);
    expect(s.nextElementSibling).toBe(frame);
    expect(frame!.style.width).toBe("100%");
    expect(frame!.getAttribute("title")).toContain("Updraft");
  });

  it("uses an explicit app origin when given", () => {
    const frame = mount(script({ "data-round": ROUND, "data-app": "https://app.example" }));
    expect(frame!.src).toBe(`https://app.example/embed/round/${ROUND}`);
  });

  it("refuses anything that is not a round address", () => {
    expect(mount(script({ "data-round": "javascript:alert(1)", src: "https://updraft.example/w.js" }))).toBeNull();
    expect(document.querySelector("iframe")).toBeNull();
  });

  it("resizes only on height messages from its own frame origin", () => {
    const frame = mount(script({ "data-round": ROUND, src: "https://updraft.example/w.js" }))!;
    window.dispatchEvent(new MessageEvent("message", { origin: "https://evil.example", data: { updraftHeight: 999 } }));
    expect(frame.style.height).toBe("560px");
    window.dispatchEvent(
      new MessageEvent("message", { origin: "https://updraft.example", data: { updraftHeight: 640 }, source: frame.contentWindow }),
    );
    expect(frame.style.height).toBe("640px");
  });
});
