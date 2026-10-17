"use client";

import dynamic from "next/dynamic";
import type { DemandZone } from "./ZoneDemandMap";

const Map = dynamic(() => import("./ZoneDemandMap"), { ssr: false, loading: () => <div className="h-[380px] w-full animate-pulse rounded-md bg-slate-100" /> });

export function ZoneDemandMapLoader(props: { zones: DemandZone[]; height?: number; demandLabel: string; supplyLabel: string; recenterLabel: string; scrollHint: string }) {
  return <Map {...props} height={props.height ?? 380} />;
}
