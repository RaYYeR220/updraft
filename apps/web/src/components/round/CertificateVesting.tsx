"use client";

import type { VestingLike } from "./format";
import { useNow } from "./hooks";
import { VEST_COLORS, VestingChart } from "./VestingChart";

/** The certificate's two vesting schedules, with today marked. */
export function CertificateVesting({ firedAt, creator, participants }: { firedAt: number; creator: VestingLike; participants: VestingLike }) {
  const now = useNow(15_000);
  return (
    <VestingChart
      start={firedAt}
      now={now}
      schedules={[
        { label: "The creator", v: creator, color: VEST_COLORS.creator },
        { label: "Participants", v: participants, color: VEST_COLORS.participants, dash: true },
      ]}
    />
  );
}
