"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { startMurmuration } from "./flock";

export function Hero() {
  const hero = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const ctas = useRef<HTMLDivElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const capText = useRef<HTMLSpanElement>(null);
  const prog = useRef<HTMLElement>(null);
  const phases = useRef<HTMLDivElement>(null);
  const hawk = useRef<HTMLDivElement>(null);
  const wire = useRef<HTMLDivElement>(null);
  const you = useRef<HTMLDivElement>(null);
  const dev = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    requestAnimationFrame(() => root.classList.add("is-in"));
    if (!hero.current || !canvas.current || !ctas.current || !tip.current || !capText.current || !prog.current || !phases.current) return;
    return startMurmuration({
      hero: hero.current,
      canvas: canvas.current,
      ctas: ctas.current,
      tip: tip.current,
      capText: capText.current,
      prog: prog.current,
      phases: [...phases.current.querySelectorAll<HTMLElement>(".phase")],
      hawk: hawk.current!,
      wire: wire.current!,
      you: you.current!,
      dev: dev.current!,
    });
  }, []);

  return (
    <section className="hero" id="top" aria-labelledby="h1" ref={hero}>
      <canvas
        className="flock"
        ref={canvas}
        role="img"
        aria-label="Illustration: a flock of birds, one per commit, wheels together, then lands on one wire in commit order. Every bird sits at the same height: one price for everyone, the dev included. A hawk, a buyer right after T0, circles above."
      />
      <div className="hero-copy">
        <h1 className="display reveal" id="h1" style={{ "--d": ".12s" } as React.CSSProperties}>
          Everyone lands at the same price.
        </h1>
        <p className="lede reveal" style={{ "--d": ".24s" } as React.CSSProperties}>
          Updraft pools a round&apos;s commits into Ascend&apos;s launch buy, so every wallet, the dev&apos;s too, pays one average price.
          Nobody gets the bottom of the curve to themselves.
        </p>
        <div className="ctas reveal" style={{ "--d": ".36s" } as React.CSSProperties} ref={ctas}>
          <Link className="btn" href="/rounds">
            Join a round
            <svg className="glyph" viewBox="0 0 22 14" aria-hidden="true">
              <path d="M1 8 L8 2.5 L11 6 L14 2.5 L21 8 L14 5.4 L11 9.5 L8 5.4 Z" fill="#231e19" />
            </svg>
          </Link>
          <Link className="link" href="/studio">
            Launch with Updraft
          </Link>
        </div>
      </div>
      <div className="hero-lbl lbl-hawk" ref={hawk} aria-hidden="true" style={{ opacity: 0 }}>
        The hawk came after T0. It pays more.
      </div>
      <div className="hero-lbl lbl-wire" ref={wire} aria-hidden="true">
        The wire: <b>one price</b> per token, for every bird
      </div>
      <div className="hero-lbl lbl-pin" ref={you} aria-hidden="true">
        you, 250 USDC
      </div>
      <div className="hero-lbl lbl-pin" ref={dev} aria-hidden="true">
        the dev, same wire
      </div>
      <figure className="plate-cap reveal" style={{ "--d": ".6s" } as React.CSSProperties}>
        <div className="phases" aria-hidden="true" ref={phases}>
          <span className="phase on" data-p="commit">
            Commit
          </span>
          <span className="phase" data-p="fire">
            Fire
          </span>
          <span className="phase" data-p="land">
            Land
          </span>
          <span className="prog">
            <i ref={prog} />
          </span>
        </div>
        <figcaption className="cap">
          <b>Plate 1, an illustration.</b>{" "}
          <span ref={capText}>Before T0: 120 commits wheel as one flock. Anyone can leave until the lock.</span>
        </figcaption>
      </figure>
      <div className="tip" ref={tip} role="status" />
    </section>
  );
}
