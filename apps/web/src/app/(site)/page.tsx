import { indexer } from "@/lib/data";
import { certificatePlate, fieldLog, pickRounds, problemFigures } from "@/components/landing/data";
import { Guarantees } from "@/components/landing/Guarantees";
import { Habitat } from "@/components/landing/Habitat";
import { Hero } from "@/components/landing/Hero";
import { How } from "@/components/landing/How";
import { LiveRounds } from "@/components/landing/LiveRounds";
import { Problem } from "@/components/landing/Problem";
import { Roost } from "@/components/landing/Roost";
import "@/styles/landing.css";

export const revalidate = 30;

export default async function Landing() {
  const [figures, rounds] = await Promise.all([problemFigures(), indexer.rounds()]);
  const shown = pickRounds(rounds);
  const [plate, log] = await Promise.all([certificatePlate(rounds), fieldLog(shown)]);
  return (
    <div className="fg ld">
      <Hero />
      <main>
        <Problem f={figures} />
        <How />
        <Guarantees plate={plate} />
        <Habitat />
        <Roost />
        <LiveRounds rounds={shown} log={log} />
      </main>
    </div>
  );
}
