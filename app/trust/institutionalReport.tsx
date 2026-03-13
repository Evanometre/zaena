import { supabase } from "@/lib/supabase"; // adjust path
import * as Print from "expo-print";
import { useRouter } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useCallback, useEffect, useState } from "react";
import {
    Alert,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, {
    Circle,
    Defs,
    Line,
    LinearGradient,
    Path,
    Stop,
} from "react-native-svg";
import { useAuthStore } from "../../stores/authStore"; // adjust path

// ─── Brand mark (Zaena.svg path) ──────────────────────────────────────────────
const Z =
  "m 103.29513,210.17948 c -0.36381,-0.20797 -1.33149,-0.38234 -2.15042,-0.3875 -0.99138,-0.006 -1.599028,-0.142 -1.818338,-0.40625 -0.18115,-0.21828 -0.73525,-0.39688 -1.23132,-0.39688 -0.55766,0 -0.96008,-0.15149 -1.05425,-0.39687 -0.0838,-0.21828 -0.42263,-0.39688 -0.75304,-0.39688 -0.33042,0 -0.74515,-0.17398 -0.92163,-0.38663 -0.17648,-0.21264 -0.57801,-0.46817 -0.89229,-0.56784 -1.29167,-0.40962 -4.684242,-3.32237 -5.757754,-4.94341 -0.598339,-0.90351 -1.253768,-1.73795 -1.456508,-1.85433 -0.202741,-0.11637 -0.36862,-0.36305 -0.36862,-0.54818 0,-0.18512 -0.353875,-0.80428 -0.786389,-1.37591 -0.432514,-0.57163 -0.789701,-1.18931 -0.79375,-1.37264 -0.004,-0.18332 -0.245486,-0.53721 -0.536527,-0.78641 -0.291042,-0.24919 -0.529167,-0.71836 -0.529167,-1.04259 0,-0.32423 -0.148828,-0.68472 -0.330729,-0.8011 -0.315041,-0.20154 -0.625392,-0.71979 -1.869598,-3.122 -0.301486,-0.58208 -0.703654,-1.15354 -0.893706,-1.26992 -0.190053,-0.11637 -0.34555,-0.43765 -0.34555,-0.71397 0,-0.27631 -0.281544,-0.80618 -0.625652,-1.17748 -0.612008,-0.66036 -0.705777,-0.67527 -4.299479,-0.6835 -2.810515,-0.006 -3.794515,-0.0997 -4.187417,-0.39688 -0.282475,-0.21365 -1.013877,-0.38846 -1.625339,-0.38846 -0.744144,0 -1.162104,-0.13122 -1.264043,-0.39687 -0.08791,-0.22909 -0.483388,-0.39688 -0.93545,-0.39688 -0.430735,0 -0.940488,-0.14882 -1.132783,-0.33072 -0.192295,-0.18191 -0.903381,-0.60109 -1.580191,-0.93152 -0.67681,-0.33043 -1.298152,-0.77692 -1.380759,-0.99219 -0.08261,-0.21527 -0.3867,-0.3914 -0.675762,-0.3914 -0.57835,0 -5.311874,-4.46916 -5.311874,-5.01521 0,-0.18293 -0.357187,-0.78358 -0.79375,-1.33479 -0.436562,-0.5512 -0.79375,-1.14528 -0.79375,-1.32017 0,-0.3152 -0.177693,-0.71062 -1.261866,-2.80798 -0.318996,-0.61711 -0.497577,-1.32833 -0.413888,-1.64835 0.08377,-0.32033 -0.09354,-1.02478 -0.411438,-1.63468 -0.492972,-0.94579 -0.558641,-1.51958 -0.558641,-4.88119 0,-3.19175 0.07099,-3.8804 0.437834,-4.24725 0.240808,-0.2408 0.493872,-1.02104 0.562363,-1.73384 0.06849,-0.71281 0.288186,-1.43183 0.488209,-1.59784 0.200022,-0.166 0.363677,-0.57032 0.363677,-0.89849 0,-0.32816 0.178594,-0.74488 0.396875,-0.92604 0.218282,-0.18116 0.396875,-0.53835 0.396875,-0.79375 0,-0.25541 0.178594,-0.61259 0.396875,-0.79375 0.218282,-0.18116 0.396875,-0.53447 0.396875,-0.78514 0,-0.25067 0.238125,-0.67126 0.529167,-0.93465 0.751761,-0.68034 0.751761,-2.89921 0,-3.3687 -0.291042,-0.18175 -0.529167,-0.56034 -0.529167,-0.8413 0,-0.28096 -0.165069,-0.6988 -0.36682,-0.92854 -0.659243,-0.7507 -2.01443,-3.52112 -2.01443,-4.11812 0,-0.32076 -0.238125,-0.7987 -0.529166,-1.06209 -0.394407,-0.35693 -0.53131,-0.82219 -0.537582,-1.82695 -0.0048,-0.76334 -0.176907,-1.57082 -0.396874,-1.86164 -0.564861,-0.74681 -0.557903,-6.55703 0.0084,-7.02704 0.260071,-0.21584 0.396875,-0.80569 0.396875,-1.71118 0,-1.04578 0.12868,-1.49825 0.529167,-1.86069 0.291041,-0.26339 0.529166,-0.74133 0.529166,-1.0621 0,-0.55183 1.303656,-3.27324 1.949512,-4.06965 0.164696,-0.20309 0.418509,-0.65076 0.56403,-0.99483 0.374153,-0.88466 4.373468,-4.85363 4.890731,-4.85363 0.236182,0 0.833322,-0.41672 1.326977,-0.92604 0.493655,-0.50932 1.159117,-0.92604 1.478803,-0.92604 0.319687,0 0.649781,-0.1786 0.733544,-0.39688 0.08376,-0.21828 0.439109,-0.39687 0.78966,-0.39687 0.350551,0 0.785585,-0.1786 0.966743,-0.39688 0.181157,-0.21828 0.683381,-0.39687 1.116053,-0.39687 0.432671,0 1.102702,-0.17958 1.488957,-0.39907 0.516965,-0.29377 2.028006,-0.45086 5.726292,-0.59531 4.738449,-0.18509 5.029213,-0.22632 5.115549,-0.72541 0.05035,-0.29104 0.240169,-0.64823 0.421828,-0.79375 0.329066,-0.26361 0.486564,-0.53092 1.741489,-2.95572 0.363665,-0.70269 0.81015,-1.37283 0.992187,-1.4892 0.182037,-0.11637 0.330977,-0.50333 0.330977,-0.8599 0,-0.35657 0.121615,-0.64831 0.270256,-0.64831 0.14864,0 0.414198,-0.32742 0.590128,-0.7276 0.17593,-0.40018 0.649627,-1.19195 1.052661,-1.75949 0.403033,-0.56754 0.732788,-1.19635 0.732788,-1.39737 0,-0.20101 0.178594,-0.43401 0.396875,-0.51777 0.218282,-0.0838 0.398262,-0.407454 0.399957,-0.719308 0.0046,-0.842744 5.610724,-6.515396 6.817554,-6.898427 0.29695,-0.09425 0.6843,-0.345345 0.86078,-0.557991 0.17648,-0.212645 0.59122,-0.386628 0.92163,-0.386628 0.33042,0 0.66929,-0.178594 0.75305,-0.396875 0.0871,-0.22692 0.48189,-0.396875 0.92195,-0.396875 0.42331,0 0.91788,-0.178594 1.09904,-0.396875 0.18378,-0.22144 0.76053,-0.396875 1.304738,-0.396875 0.53645,0 1.20648,-0.174807 1.48895,-0.388461 0.76108,-0.575646 9.16487,-0.582981 9.64172,-0.0084 0.18116,0.218281 0.76128,0.400661 1.28917,0.405289 0.52788,0.0046 1.1909,0.183222 1.47338,0.396875 0.28247,0.213654 0.85176,0.388461 1.26507,0.388461 0.42391,0 0.81787,0.172999 0.90378,0.396875 0.0838,0.218281 0.37665,0.396875 0.65087,0.396875 0.27421,0 1.0445,0.416718 1.71175,0.926041 0.66725,0.509323 1.31687,0.926042 1.44361,0.926042 0.29218,0 4.75612,4.44092 4.75612,4.7316 0,0.118848 0.36256,0.716593 0.8057,1.328323 0.44313,0.611734 0.9191,1.373734 1.0577,1.693344 0.1386,0.31961 0.37135,0.78947 0.51722,1.04413 0.43815,0.76493 0.74395,1.33048 1.37673,2.54608 0.33125,0.63635 0.75245,1.21464 0.936,1.28507 0.18355,0.0704 0.33373,0.4088 0.33373,0.75191 0,0.35305 0.22969,0.74677 0.52917,0.90704 0.29104,0.15576 0.52916,0.52977 0.52916,0.83113 0,0.30136 0.35719,0.99892 0.79375,1.55012 0.43657,0.55121 0.79375,1.12686 0.79375,1.27923 0,0.4943 0.38641,0.55154 4.75593,0.70451 3.1594,0.11061 4.45601,0.25428 4.86215,0.53876 0.30461,0.21335 0.9478,0.38792 1.42931,0.38792 0.53412,0 0.93485,0.15474 1.02777,0.39687 0.0838,0.21828 0.42263,0.39688 0.75305,0.39688 0.33041,0 0.74897,0.17859 0.93013,0.39687 0.18115,0.21828 0.53834,0.39688 0.79375,0.39688 0.2554,0 0.61259,0.17859 0.79375,0.39687 0.18115,0.21828 0.4742,0.39688 0.65122,0.39688 0.78647,0 5.88105,5.03183 6.67111,6.58893 0.26558,0.52343 0.6317,1.04691 0.8136,1.16328 0.1819,0.11637 0.33073,0.50706 0.33073,0.8682 0,0.36114 0.1786,0.72515 0.39688,0.80891 0.21828,0.0838 0.39687,0.41876 0.39687,0.74444 0,0.32568 0.23813,0.80764 0.52917,1.07103 0.33772,0.30564 0.53221,0.82301 0.53758,1.43007 0.005,0.52315 0.18322,1.1823 0.39688,1.46477 0.56563,0.74783 0.56563,9.33749 0,10.08532 -0.21366,0.28247 -0.39225,0.94162 -0.39688,1.46477 -0.005,0.60706 -0.19986,1.12443 -0.53758,1.43007 -0.29104,0.26339 -0.52917,0.74535 -0.52917,1.07103 0,0.32568 -0.17859,0.66068 -0.39687,0.74444 -0.21828,0.0838 -0.39688,0.45743 -0.39688,0.83036 0,0.37294 -0.17859,0.7466 -0.39687,0.83036 -0.21828,0.0838 -0.39688,0.34152 -0.39688,0.57279 0,0.23127 -0.32039,0.88282 -0.71199,1.4479 -0.59465,0.85808 -0.66006,1.11055 -0.39687,1.53198 0.17331,0.27752 0.31511,0.73159 0.31511,1.00903 0,0.27745 0.14883,0.56365 0.33073,0.636 0.1819,0.0723 0.56439,0.5911 0.84998,1.15278 0.28559,0.56169 0.72801,1.23046 0.98316,1.48616 0.25515,0.2557 0.40424,0.6204 0.33131,0.81044 -0.0729,0.19004 0.10973,0.56483 0.40591,0.83287 0.29617,0.26803 0.54228,0.73677 0.54691,1.04164 0.005,0.30486 0.18322,0.78542 0.39688,1.06789 0.21365,0.28248 0.38846,0.94433 0.38846,1.47079 0,0.52645 0.1748,1.18831 0.38846,1.47078 0.56274,0.74401 0.57671,7.99102 0.0168,8.73125 -0.21366,0.28247 -0.39225,1.08287 -0.39688,1.77867 -0.006,0.87462 -0.13091,1.31207 -0.40529,1.41737 -0.21828,0.0838 -0.39687,0.37401 -0.39687,0.645 0,0.62771 -1.45901,3.31136 -3.03831,5.58855 -0.93449,1.34745 -3.34278,3.90693 -3.68132,3.91243 -0.13053,0.002 -0.74588,0.42058 -1.36744,0.9299 -0.62157,0.50933 -1.31844,0.92604 -1.54861,0.92604 -0.23017,0 -0.41849,0.1168 -0.41849,0.25955 0,0.14275 -0.29277,0.33302 -0.65061,0.42283 -0.35783,0.0898 -0.78913,0.33021 -0.95843,0.53421 -0.16931,0.204 -0.63771,0.37091 -1.04088,0.37091 -0.40752,0 -0.80068,0.17625 -0.88534,0.39688 -0.10277,0.26781 -0.52305,0.39687 -1.29236,0.39687 -0.62703,0 -1.39093,0.17573 -1.69757,0.3905 -0.42848,0.30012 -1.62083,0.40728 -5.1521,0.46302 l -4.59458,0.0725 -0.0849,0.66145 c -0.0467,0.36381 -0.2441,0.78566 -0.43874,0.93746 -0.19463,0.1518 -0.61072,0.76877 -0.92464,1.37104 -0.31392,0.60227 -0.74157,1.23679 -0.95033,1.41005 -0.20875,0.17325 -0.37955,0.58534 -0.37955,0.91575 0,0.33042 -0.17859,0.66929 -0.39687,0.75305 -0.21829,0.0838 -0.39688,0.32866 -0.39688,0.54421 0,0.21555 -0.32742,0.9039 -0.7276,1.52966 -1.2068,1.88705 -1.36551,2.16129 -1.76849,3.05597 -0.21303,0.47294 -0.4834,0.8599 -0.60082,0.8599 -0.11742,0 -0.38111,0.38695 -0.58597,0.85989 -0.4381,1.01143 -4.97957,5.75469 -5.50986,5.75469 -0.2002,0 -0.90976,0.41672 -1.5768,0.92604 -0.66704,0.50932 -1.41923,0.92604 -1.67153,0.92604 -0.25229,0 -0.60694,0.1786 -0.7881,0.39688 -0.18115,0.21828 -0.67572,0.39687 -1.09903,0.39687 -0.44006,0 -0.83487,0.16996 -0.92195,0.39688 -0.11074,0.28857 -0.564,0.39687 -1.66092,0.39687 -0.91688,0 -1.71007,0.15237 -2.02221,0.38846 -0.70606,0.53404 -5.27182,0.54024 -6.20213,0.008 z";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReportData {
  report_ref: string;
  generated_at: string;
  expires_at: string;
  organization_name: string;
  zaena_id: string;
  overall_score: number;
  tier: string;
  score_confidence: number;
  dimensions: {
    cash_flow: number;
    payment_behaviour: number;
    financial_discipline: number;
    customer_quality: number;
    longevity: number;
  };
  recording_integrity: {
    multiplier: number;
    live_rate_1h: number;
  };
  metrics: {
    total_sales: number;
    days_active: [];
    recovery_rate_pct: number;
    avg_recovery_days: number;
    cash_collection_pct: number;
    supplier_payment_pct: number;
    void_rate_pct: number;
    whatsapp_receipt_pct: number;
  };
  score_history: { snapshot_date: string; overall_score: number }[];
  recommended_credit_ceiling?: number;
}

// ─── Palette — document mode (light, certified) ───────────────────────────────
const D = {
  paper: "#F5F0E8", // warm parchment
  paperDeep: "#EDE7D9", // slightly darker for section headers
  ink: "#1A1008", // near-black warm ink
  inkMid: "#3D2E1A", // mid ink for body
  inkDim: "#7A6A52", // subdued labels
  inkGhost: "#B8A98C", // very light labels
  teal: "#0E2931", // brand deep teal — accent only
  gold: "#C9922A", // brand gold
  green: "#1A6B4A", // dark document green for positive signals
  red: "#8B2020", // dark document red for flags
  rule: "#D4C9B0", // horizontal rules
  ruleDark: "#B8A98C", // section dividers
};

const TIER_COLORS: Record<string, string> = {
  unverified: "#7A6A52",
  bronze: "#8B5E2A",
  silver: "#5A6070",
  gold: D.gold,
  zaena_verified: D.green,
};

const DIMS: Record<string, { label: string; weight: number }> = {
  cash_flow: { label: "Cash Flow Consistency", weight: 25 },
  payment_behaviour: { label: "Payment Behaviour", weight: 25 },
  financial_discipline: { label: "Financial Discipline", weight: 20 },
  customer_quality: { label: "Customer Quality", weight: 15 },
  longevity: { label: "Longevity & Growth", weight: 15 },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function formatZaenaId(id: string): string {
  // Ensure format ZID-XXXX-XX for display
  return id.startsWith("ZID") ? id : `ZID-${id.slice(0, 8).toUpperCase()}`;
}

function scoreToRating(score: number): string {
  if (score >= 85) return "EXCELLENT";
  if (score >= 75) return "GOOD";
  if (score >= 65) return "FAIR";
  if (score >= 50) return "DEVELOPING";
  return "INSUFFICIENT";
}

function scoreToColor(score: number): string {
  if (score >= 75) return D.green;
  if (score >= 50) return D.gold;
  return D.red;
}

// ─── Wax Seal ─────────────────────────────────────────────────────────────────
// Constructed purely from SVG — concentric circles + the brand mark
function WaxSeal({ size = 90, tier }: { size?: number; tier: string }) {
  const tierColor = TIER_COLORS[tier] ?? D.gold;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 2;

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Defs>
        <LinearGradient id="sealGrad" x1="30%" y1="20%" x2="70%" y2="80%">
          <Stop offset="0%" stopColor={tierColor} stopOpacity={0.95} />
          <Stop offset="100%" stopColor={tierColor} stopOpacity={0.7} />
        </LinearGradient>
      </Defs>
      {/* outer ring with notched edge effect */}
      <Circle cx={cx} cy={cy} r={r} fill="url(#sealGrad)" />
      <Circle
        cx={cx}
        cy={cy}
        r={r - 4}
        fill="none"
        stroke={D.paper}
        strokeWidth={0.6}
        strokeOpacity={0.4}
      />
      <Circle
        cx={cx}
        cy={cy}
        r={r - 7}
        fill="none"
        stroke={D.paper}
        strokeWidth={0.4}
        strokeOpacity={0.25}
      />
      {/* brand mark inside seal */}
      <Svg
        width={size * 0.55}
        height={size * 0.55}
        viewBox="42.33 85.84 128 128"
        x={cx - (size * 0.55) / 2}
        y={cy - (size * 0.55) / 2}
      >
        <Path d={Z} fill={D.paper} fillOpacity={0.85} />
      </Svg>
    </Svg>
  );
}

// ─── Score Sparkline ──────────────────────────────────────────────────────────
function ScoreSparkline({
  history,
  width,
  height = 48,
}: {
  history: { snapshot_date: string; overall_score: number }[];
  width: number;
  height?: number;
}) {
  if (!history || history.length < 2) {
    return (
      <View style={{ height, alignItems: "center", justifyContent: "center" }}>
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: 9,
            color: D.inkGhost,
            letterSpacing: 1.5,
          }}
        >
          INSUFFICIENT HISTORY
        </Text>
      </View>
    );
  }

  const scores = history.map((h) => h.overall_score);
  const min = Math.max(0, Math.min(...scores) - 5);
  const max = Math.min(100, Math.max(...scores) + 5);
  const range = max - min || 1;
  const pad = 4;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;

  const points = scores.map((s, i) => {
    const x = pad + (i / (scores.length - 1)) * innerW;
    const y = pad + innerH - ((s - min) / range) * innerH;
    return `${x},${y}`;
  });

  const latest = scores[scores.length - 1];
  const latestX = pad + innerW;
  const latestY = pad + innerH - ((latest - min) / range) * innerH;

  return (
    <Svg width={width} height={height}>
      <Defs>
        <LinearGradient id="sparkGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor={D.gold} stopOpacity={0.3} />
          <Stop offset="100%" stopColor={D.gold} stopOpacity={0.9} />
        </LinearGradient>
      </Defs>
      {/* baseline */}
      <Line
        x1={pad}
        y1={height - pad}
        x2={width - pad}
        y2={height - pad}
        stroke={D.rule}
        strokeWidth={0.5}
      />
      {/* sparkline */}
      <Path
        d={`M ${points.join(" L ")}`}
        fill="none"
        stroke="url(#sparkGrad)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* latest dot */}
      <Circle cx={latestX} cy={latestY} r={3} fill={D.gold} />
    </Svg>
  );
}

// ─── Document Row ─────────────────────────────────────────────────────────────
function DocRow({
  label,
  value,
  valueColor,
  mono = true,
  last = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  mono?: boolean;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingVertical: 8,
        borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
        borderBottomColor: D.rule,
      }}
    >
      <Text
        style={{
          fontFamily: "DM Mono",
          fontSize: 9.5,
          color: D.inkDim,
          flex: 1,
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: mono ? "DM Mono" : "Cormorant Garamond",
          fontSize: mono ? 10 : 12,
          color: valueColor ?? D.inkMid,
          textAlign: "right",
          maxWidth: "55%",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

// ─── Section header ───────────────────────────────────────────────────────────
function SectionHeader({ label, number }: { label: string; number: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: 24,
        marginBottom: 10,
        paddingBottom: 6,
        borderBottomWidth: 1,
        borderBottomColor: D.ruleDark,
      }}
    >
      <Text
        style={{
          fontFamily: "DM Mono",
          fontSize: 8,
          color: D.inkGhost,
          marginRight: 10,
          letterSpacing: 1,
        }}
      >
        {number}
      </Text>
      <Text
        style={{
          fontFamily: "DM Mono",
          fontSize: 8.5,
          color: D.inkDim,
          letterSpacing: 2,
          textTransform: "uppercase",
          flex: 1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── Dimension bar row ────────────────────────────────────────────────────────
function DimDocRow({ k, v }: { k: string; v: number }) {
  const c = scoreToColor(v);
  return (
    <View style={{ marginBottom: 10 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 3,
        }}
      >
        <Text style={{ fontFamily: "DM Mono", fontSize: 9.5, color: D.inkDim }}>
          {DIMS[k]?.label}{" "}
          <Text style={{ color: D.inkGhost }}>({DIMS[k]?.weight}%)</Text>
        </Text>
        <Text style={{ fontFamily: "DM Mono", fontSize: 10, color: c }}>
          {v.toFixed(1)}
        </Text>
      </View>
      <View
        style={{
          height: 3,
          backgroundColor: D.paperDeep,
          borderRadius: 1.5,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${Math.min(100, v)}%`,
            height: "100%",
            backgroundColor: c,
            borderRadius: 1.5,
          }}
        />
      </View>
    </View>
  );
}

// ─── Loading / Error states ───────────────────────────────────────────────────
function LoadingState() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: D.paper,
      }}
    >
      <WaxSeal size={64} tier="unverified" />
      <Text
        style={{
          fontFamily: "DM Mono",
          fontSize: 9,
          color: D.inkGhost,
          letterSpacing: 2,
          marginTop: 20,
        }}
      >
        GENERATING REPORT
      </Text>
    </View>
  );
}

function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: D.paper,
        padding: 32,
      }}
    >
      <Text
        style={{
          fontFamily: "Cormorant Garamond",
          fontSize: 18,
          color: D.inkMid,
          marginBottom: 8,
        }}
      >
        Report Unavailable
      </Text>
      <Text
        style={{
          fontFamily: "DM Mono",
          fontSize: 10,
          color: D.inkDim,
          textAlign: "center",
          marginBottom: 24,
          lineHeight: 18,
        }}
      >
        {message}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        style={{
          borderWidth: 1,
          borderColor: D.ruleDark,
          paddingHorizontal: 18,
          paddingVertical: 8,
          borderRadius: 2,
        }}
      >
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: 10,
            color: D.inkDim,
            letterSpacing: 1.5,
          }}
        >
          RETRY
        </Text>
      </TouchableOpacity>
    </View>
  );
}

function buildReportHTML(r: ReportData): string {
  const tierColor: Record<string, string> = {
    unverified: "#7A6A52",
    bronze: "#8B5E2A",
    silver: "#5A6070",
    gold: "#C9922A",
    zaena_verified: "#1A6B4A",
  };
  const tc = tierColor[r.tier] ?? "#C9922A";

  const scoreColor =
    r.overall_score >= 75
      ? "#1A6B4A"
      : r.overall_score >= 50
        ? "#C9922A"
        : "#8B2020";

  const rating =
    r.overall_score >= 85
      ? "EXCELLENT"
      : r.overall_score >= 75
        ? "GOOD"
        : r.overall_score >= 65
          ? "FAIR"
          : r.overall_score >= 50
            ? "DEVELOPING"
            : "INSUFFICIENT";

  const fmtDate = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  const dimLabel: Record<string, string> = {
    cash_flow: "Cash Flow Consistency",
    payment_behaviour: "Payment Behaviour",
    financial_discipline: "Financial Discipline",
    customer_quality: "Customer Quality",
    longevity: "Longevity & Growth",
  };

  const dimRows = Object.entries(r.dimensions)
    .map(([k, v]) => {
      const val = v as number;
      const c = val >= 75 ? "#1A6B4A" : val >= 50 ? "#C9922A" : "#8B2020";
      return `
      <tr>
        <td>${dimLabel[k] ?? k}</td>
        <td style="color:${c};font-weight:600;text-align:right">${val.toFixed(1)}</td>
        <td style="width:120px;padding-left:12px">
          <div style="height:4px;background:#E8E0D0;border-radius:2px">
            <div style="width:${Math.min(100, val)}%;height:4px;background:${c};border-radius:2px"></div>
          </div>
        </td>
      </tr>`;
    })
    .join("");

  const historyRows =
    r.score_history.length >= 2
      ? r.score_history
          .map(
            (h) =>
              `<tr>
          <td>${fmtDate(h.snapshot_date)}</td>
          <td style="text-align:right;font-weight:600">${h.overall_score.toFixed(1)}</td>
        </tr>`,
          )
          .join("")
      : `<tr><td colspan="2" style="color:#B8A98C;font-style:italic">Insufficient history</td></tr>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family: Georgia, serif; background: #F5F0E8; color: #1A1008; }
  .page { max-width: 700px; margin: 0 auto; padding: 48px 40px; background: #F5F0E8; }

  .letterhead { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:24px; }
  .brand-label { font-size:10px; letter-spacing:3px; color:#B8A98C; margin-bottom:6px; font-family:monospace; }
  .report-title { font-size:26px; color:#0E2931; line-height:1.3; }
  .seal { width:72px; height:72px; border-radius:50%; background:${tc}; display:flex; align-items:center; justify-content:center; }
  .seal-text { color:white; font-size:9px; letter-spacing:1px; font-family:monospace; text-align:center; line-height:1.4; }

  hr { border:none; border-top:1px solid #D4C9B0; margin: 16px 0; }
  .hr-thick { border-top: 2px solid ${tc}; margin-bottom:0; }

  .merchant-label { font-size:9px; letter-spacing:2px; color:#B8A98C; font-family:monospace; margin-bottom:4px; }
  .merchant-name { font-size:22px; font-weight:600; color:#1A1008; margin-bottom:2px; }
  .zaena-id { font-size:10px; letter-spacing:1.5px; color:#7A6A52; font-family:monospace; }

  .meta-grid { display:flex; justify-content:space-between; margin-top:16px; padding:14px 16px; background:#EDE7D9; border-radius:3px; }
  .meta-item label { font-size:8px; letter-spacing:1px; color:#B8A98C; font-family:monospace; display:block; margin-bottom:3px; }
  .meta-item span { font-size:10px; color:#3D2E1A; font-family:monospace; }

  .section { background:white; margin-top:8px; padding:20px 24px; border-radius:3px; }
  .section-header { display:flex; align-items:center; margin-bottom:14px; padding-bottom:8px; border-bottom:1px solid #B8A98C; }
  .section-num { font-size:8px; color:#B8A98C; font-family:monospace; letter-spacing:1px; margin-right:12px; }
  .section-title { font-size:9px; color:#7A6A52; font-family:monospace; letter-spacing:2px; text-transform:uppercase; }

  .score-block { display:flex; justify-content:space-between; align-items:center; padding:16px; background:#EDE7D9; border-radius:4px; margin-bottom:14px; }
  .score-num { font-size:52px; font-weight:300; color:#1A1008; line-height:1; }
  .score-label { font-size:8px; color:#B8A98C; font-family:monospace; letter-spacing:2px; }
  .score-out { font-size:8px; color:#B8A98C; font-family:monospace; letter-spacing:1px; margin-top:4px; }
  .tier-pill { padding:5px 10px; border:1px solid ${tc}40; border-radius:2px; background:${tc}15; font-size:9px; color:${tc}; font-family:monospace; letter-spacing:1.5px; margin-bottom:8px; display:inline-block; }
  .rating { font-size:20px; font-weight:600; color:${scoreColor}; }
  .confidence { font-size:8px; color:#B8A98C; font-family:monospace; letter-spacing:1px; margin-top:2px; }

  table { width:100%; border-collapse:collapse; }
  td { padding:8px 0; font-size:11px; border-bottom:1px solid #EDE7D9; color:#3D2E1A; }
  td:first-child { color:#7A6A52; font-family:monospace; font-size:10px; }
  tr:last-child td { border-bottom:none; }

  .footer-block { margin-top:8px; padding:16px; background:#EDE7D9; border-top:2px solid ${tc}; border-radius:3px; }
  .footer-brand { font-size:9px; color:#7A6A52; font-family:monospace; letter-spacing:1.5px; margin-bottom:8px; }
  .footer-body { font-size:9px; color:#B8A98C; line-height:1.7; font-family:monospace; }
  .footer-ref { margin-top:10px; padding-top:10px; border-top:1px solid #D4C9B0; font-size:8px; color:#B8A98C; font-family:monospace; line-height:1.8; }
</style>
</head>
<body>
<div class="page">

  <!-- Letterhead -->
  <div class="letterhead">
    <div>
      <div class="brand-label">ZAENA TRUST INFRASTRUCTURE</div>
      <div class="report-title">Business Performance<br/>&amp; Trust Report</div>
    </div>
    <div class="seal">
      <div class="seal-text">${r.tier.replace("_", " ").toUpperCase()}<br/>VERIFIED</div>
    </div>
  </div>
  <hr class="hr-thick"/>

  <!-- Merchant -->
  <div style="padding:20px 0 0">
    <div class="merchant-label">MERCHANT</div>
    <div class="merchant-name">${r.organization_name}</div>
    <div class="zaena-id">${r.zaena_id}</div>
  </div>
  <div class="meta-grid">
    <div class="meta-item"><label>ISSUED</label><span>${fmtDate(r.generated_at)}</span></div>
    <div class="meta-item" style="text-align:center"><label>VALID UNTIL</label><span>${fmtDate(r.expires_at)}</span></div>
    <div class="meta-item" style="text-align:right"><label>REPORT REF</label><span>${r.report_ref.slice(0, 16)}</span></div>
  </div>

  <!-- 01 Overall Assessment -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">01</span>
      <span class="section-title">Overall Assessment</span>
    </div>
    <div class="score-block">
      <div>
        <div class="score-label">ZAENA TRUST SCORE</div>
        <div class="score-num">${r.overall_score.toFixed(1)}</div>
        <div class="score-out">OUT OF 100</div>
      </div>
      <div style="text-align:right">
        <div class="tier-pill">${r.tier.replace("_", " ").toUpperCase()}</div><br/>
        <div class="rating">${rating}</div>
        <div class="confidence">CONFIDENCE: ${Math.min(100, Math.round(r.score_confidence * 100))}%</div>
      </div>
    </div>
    <table>
      <tr><td>Recording Integrity Multiplier</td><td style="text-align:right;color:${r.recording_integrity.multiplier >= 1 ? "#1A6B4A" : "#8B2020"}">×${r.recording_integrity.multiplier.toFixed(2)}</td></tr>
      <tr><td>Live Recording Rate (within 1hr)</td><td style="text-align:right;color:${r.recording_integrity.live_rate_1h >= 80 ? "#1A6B4A" : "#8B2020"}">${r.recording_integrity.live_rate_1h}%</td></tr>
      ${r.recommended_credit_ceiling != null ? `<tr><td>Recommended Credit Ceiling</td><td style="text-align:right;color:#0E2931">₦${r.recommended_credit_ceiling.toLocaleString()}</td></tr>` : ""}
    </table>
  </div>

  <!-- 02 Score History -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">02</span>
      <span class="section-title">Score Trajectory (90 Days)</span>
    </div>
    <table>${historyRows}</table>
  </div>

  <!-- 03 Dimensions -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">03</span>
      <span class="section-title">Score Dimensions</span>
    </div>
    <table>${dimRows}</table>
  </div>

  <!-- 04 Financial Vital Signs -->
  <div class="section">
    <div class="section-header">
      <span class="section-num">04</span>
      <span class="section-title">Financial Vital Signs</span>
    </div>
    <table>
      <tr><td>Total Verified Transactions</td><td style="text-align:right">${r.metrics.total_sales}</td></tr>
      <tr><td>Operational Days on Record</td><td style="text-align:right">${r.metrics.days_active}</td></tr>
      <tr><td>Cash Collection Rate</td><td style="text-align:right;color:${r.metrics.cash_collection_pct >= 75 ? "#1A6B4A" : "#C9922A"}">${r.metrics.cash_collection_pct.toFixed(1)}%</td></tr>
      <tr><td>Credit Recovery Rate</td><td style="text-align:right;color:${r.metrics.recovery_rate_pct >= 75 ? "#1A6B4A" : "#C9922A"}">${r.metrics.recovery_rate_pct.toFixed(1)}%</td></tr>
      <tr><td>Avg. Credit Recovery Time</td><td style="text-align:right">${r.metrics.avg_recovery_days.toFixed(0)} days</td></tr>
      <tr><td>Supplier Payment Rate</td><td style="text-align:right;color:${r.metrics.supplier_payment_pct >= 75 ? "#1A6B4A" : "#C9922A"}">${r.metrics.supplier_payment_pct.toFixed(1)}%</td></tr>
      <tr><td>Transaction Void Rate</td><td style="text-align:right;color:${r.metrics.void_rate_pct > 10 ? "#8B2020" : "#1A6B4A"}">${r.metrics.void_rate_pct.toFixed(1)}%</td></tr>
      <tr><td>WhatsApp Receipt Rate</td><td style="text-align:right">${r.metrics.whatsapp_receipt_pct.toFixed(1)}%</td></tr>
    </table>
  </div>

  <!-- Footer -->
  <div class="footer-block">
    <div class="footer-brand">ZAENA TRUST INFRASTRUCTURE</div>
    <div class="footer-body">This report is generated from real-time, tamper-evident transaction data recorded within the ZAENA ERP system. Verified via WhatsApp digital audit trail.</div>
    <div class="footer-ref">
      REF: ${r.report_ref}<br/>
      VERIFY: zaena.app/verify/${r.report_ref}
    </div>
  </div>

</div>
</body>
</html>`;
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function InstitutionalReportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { organizationId } = useAuthStore();

  const [report, setReport] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const generate = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        "generate_trust_report",
        {
          p_org_id: organizationId,
          p_report_type: "institutional",
          p_requester_type: "owner",
          p_requester_identifier: null,
        },
      );
      if (rpcErr) throw rpcErr;
      // The function returns a jsonb — unwrap the same way as calculate_trust_score_v2
      const raw = Array.isArray(data)
        ? (data[0]?.generate_trust_report ?? data[0])
        : data;
      if (!raw) throw new Error("Empty report response");
      setReport(raw as ReportData);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    generate();
  }, [generate]);

  const handleShare = useCallback(async () => {
    if (!report) return;

    try {
      const html = buildReportHTML(report);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Trust Report — ${report.organization_name}`,
        UTI: "com.adobe.pdf",
      });
    } catch (e: any) {
      Alert.alert("Export Failed", e?.message ?? "Could not generate PDF");
    }
  }, [report]);

  if (loading) return <LoadingState />;
  if (error || !report)
    return <ErrorState message={error ?? "Unknown error"} onRetry={generate} />;

  const tierColor = TIER_COLORS[report.tier] ?? D.gold;
  const rating = scoreToRating(report.overall_score);

  return (
    <View style={{ flex: 1, backgroundColor: D.paperDeep }}>
      {/* ── Top bar ── */}
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 20,
          backgroundColor: D.teal,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text
            style={{
              fontFamily: "DM Mono",
              fontSize: 10,
              color: "#4A8898",
              letterSpacing: 1.5,
            }}
          >
            ← BACK
          </Text>
        </TouchableOpacity>
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: 8.5,
            color: "#1A3848",
            letterSpacing: 2.5,
          }}
        >
          INSTITUTIONAL REPORT
        </Text>
        <TouchableOpacity
          onPress={handleShare}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text
            style={{
              fontFamily: "DM Mono",
              fontSize: 10,
              color: "#4A8898",
              letterSpacing: 1.5,
            }}
          >
            SHARE
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Document header ── */}
        <View
          style={{
            backgroundColor: D.paper,
            paddingHorizontal: 24,
            paddingTop: 28,
            paddingBottom: 20,
            borderBottomWidth: 2,
            borderBottomColor: tierColor,
          }}
        >
          {/* Letterhead row */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 20,
            }}
          >
            <View>
              <Text
                style={{
                  fontFamily: "Cormorant Garamond",
                  fontSize: 11,
                  color: D.inkGhost,
                  letterSpacing: 3,
                  marginBottom: 2,
                }}
              >
                ZAENA TRUST INFRASTRUCTURE
              </Text>
              <Text
                style={{
                  fontFamily: "Cormorant Garamond",
                  fontSize: 22,
                  fontWeight: "600",
                  color: D.teal,
                  lineHeight: 26,
                }}
              >
                Business Performance{"\n"}& Trust Report
              </Text>
            </View>
            <WaxSeal size={72} tier={report.tier} />
          </View>

          {/* Horizontal rule */}
          <View
            style={{
              height: StyleSheet.hairlineWidth,
              backgroundColor: D.ruleDark,
              marginBottom: 16,
            }}
          />

          {/* Merchant identity block */}
          <View style={{ marginBottom: 4 }}>
            <Text
              style={{
                fontFamily: "DM Mono",
                fontSize: 8.5,
                color: D.inkGhost,
                letterSpacing: 2,
                marginBottom: 4,
              }}
            >
              MERCHANT
            </Text>
            <Text
              style={{
                fontFamily: "Cormorant Garamond",
                fontSize: 20,
                fontWeight: "600",
                color: D.ink,
                marginBottom: 2,
              }}
            >
              {report.organization_name}
            </Text>
            <Text
              style={{
                fontFamily: "DM Mono",
                fontSize: 9.5,
                color: D.inkDim,
                letterSpacing: 1.5,
              }}
            >
              {formatZaenaId(report.zaena_id)}
            </Text>
          </View>

          {/* Report metadata */}
          <View
            style={{
              marginTop: 14,
              padding: 12,
              backgroundColor: D.paperDeep,
              borderRadius: 3,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <View>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8,
                  color: D.inkGhost,
                  letterSpacing: 1,
                  marginBottom: 2,
                }}
              >
                ISSUED
              </Text>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 9.5,
                  color: D.inkMid,
                }}
              >
                {formatDate(report.generated_at)}
              </Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8,
                  color: D.inkGhost,
                  letterSpacing: 1,
                  marginBottom: 2,
                }}
              >
                VALID UNTIL
              </Text>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 9.5,
                  color: D.inkMid,
                }}
              >
                {formatDate(report.expires_at)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8,
                  color: D.inkGhost,
                  letterSpacing: 1,
                  marginBottom: 2,
                }}
              >
                REPORT REF
              </Text>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 9.5,
                  color: D.inkMid,
                }}
              >
                {report.report_ref.slice(0, 16)}
              </Text>
            </View>
          </View>
        </View>

        {/* ── Section 1: Overall Assessment ── */}
        <View
          style={{
            backgroundColor: D.paper,
            marginTop: 6,
            paddingHorizontal: 24,
            paddingBottom: 20,
          }}
        >
          <SectionHeader label="Overall Assessment" number="01" />

          {/* Score + rating block */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingVertical: 14,
              paddingHorizontal: 16,
              backgroundColor: D.paperDeep,
              borderRadius: 4,
              marginBottom: 14,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8.5,
                  color: D.inkGhost,
                  letterSpacing: 2,
                  marginBottom: 4,
                }}
              >
                ZAENA TRUST SCORE
              </Text>
              <Text
                style={{
                  fontFamily: "Cormorant Garamond",
                  fontSize: 48,
                  fontWeight: "400",
                  color: D.ink,
                  lineHeight: 52,
                }}
              >
                {report.overall_score.toFixed(1)}
              </Text>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8,
                  color: D.inkGhost,
                  letterSpacing: 1,
                }}
              >
                OUT OF 100
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  backgroundColor: `${tierColor}15`,
                  borderWidth: 1,
                  borderColor: `${tierColor}40`,
                  borderRadius: 2,
                  marginBottom: 8,
                }}
              >
                <Text
                  style={{
                    fontFamily: "DM Mono",
                    fontSize: 9,
                    color: tierColor,
                    letterSpacing: 1.5,
                  }}
                >
                  {report.tier.replace("_", " ").toUpperCase()}
                </Text>
              </View>
              <Text
                style={{
                  fontFamily: "Cormorant Garamond",
                  fontSize: 20,
                  fontWeight: "600",
                  color: scoreToColor(report.overall_score),
                }}
              >
                {rating}
              </Text>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8,
                  color: D.inkGhost,
                  letterSpacing: 1,
                  marginTop: 2,
                }}
              >
                CONFIDENCE: {(report.score_confidence * 100).toFixed(0)}%
              </Text>
            </View>
          </View>

          <DocRow
            label="Recording Integrity Multiplier"
            value={`×${report.recording_integrity.multiplier.toFixed(2)}`}
            valueColor={
              report.recording_integrity.multiplier >= 1 ? D.green : D.red
            }
          />
          <DocRow
            label="Live Recording Rate (within 1hr)"
            value={`${report.recording_integrity.live_rate_1h}%`}
            valueColor={
              report.recording_integrity.live_rate_1h >= 80 ? D.green : D.red
            }
          />
          {report.recommended_credit_ceiling != null && (
            <DocRow
              label="Recommended Credit Ceiling"
              value={`₦${report.recommended_credit_ceiling.toLocaleString()}`}
              valueColor={D.teal}
              last
            />
          )}
        </View>

        {/* ── Section 2: Score History ── */}
        <View
          style={{
            backgroundColor: D.paper,
            marginTop: 6,
            paddingHorizontal: 24,
            paddingBottom: 20,
          }}
        >
          <SectionHeader label="Score Trajectory (90 Days)" number="02" />
          <View style={{ marginBottom: 8 }}>
            <ScoreSparkline
              history={report.score_history}
              width={320}
              height={56}
            />
          </View>
          {report.score_history.length >= 2 && (
            <View
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8.5,
                  color: D.inkGhost,
                }}
              >
                {formatDate(report.score_history[0].snapshot_date)}
              </Text>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8.5,
                  color: D.inkGhost,
                }}
              >
                {formatDate(
                  report.score_history[report.score_history.length - 1]
                    .snapshot_date,
                )}
              </Text>
            </View>
          )}
        </View>

        {/* ── Section 3: Score Dimensions ── */}
        <View
          style={{
            backgroundColor: D.paper,
            marginTop: 6,
            paddingHorizontal: 24,
            paddingBottom: 20,
          }}
        >
          <SectionHeader label="Score Dimensions" number="03" />
          {Object.entries(report.dimensions).map(([k, v]) => (
            <DimDocRow key={k} k={k} v={v as number} />
          ))}
        </View>

        {/* ── Section 4: Financial Vital Signs ── */}
        <View
          style={{
            backgroundColor: D.paper,
            marginTop: 6,
            paddingHorizontal: 24,
            paddingBottom: 20,
          }}
        >
          <SectionHeader label="Financial Vital Signs" number="04" />
          <DocRow
            label="Total Verified Transactions"
            value={String(report.metrics.total_sales)}
          />
          <DocRow
            label="Operational Days on Record"
            value={String(report.metrics.days_active)}
          />
          <DocRow
            label="Cash Collection Rate"
            value={`${report.metrics.cash_collection_pct.toFixed(1)}%`}
            valueColor={scoreToColor(report.metrics.cash_collection_pct)}
          />
          <DocRow
            label="Credit Recovery Rate"
            value={`${report.metrics.recovery_rate_pct.toFixed(1)}%`}
            valueColor={scoreToColor(report.metrics.recovery_rate_pct)}
          />
          <DocRow
            label="Avg. Credit Recovery Time"
            value={`${report.metrics.avg_recovery_days.toFixed(0)} days`}
          />
          <DocRow
            label="Supplier Payment Rate"
            value={`${report.metrics.supplier_payment_pct.toFixed(1)}%`}
            valueColor={scoreToColor(report.metrics.supplier_payment_pct)}
          />
          <DocRow
            label="Transaction Void Rate"
            value={`${report.metrics.void_rate_pct.toFixed(1)}%`}
            valueColor={report.metrics.void_rate_pct > 10 ? D.red : D.green}
          />
          <DocRow
            label="WhatsApp Receipt Rate"
            value={`${report.metrics.whatsapp_receipt_pct.toFixed(1)}%`}
            last
          />
        </View>

        {/* ── Verification footer ── */}
        <View
          style={{
            marginTop: 6,
            marginHorizontal: 24,
            padding: 16,
            backgroundColor: D.paperDeep,
            borderTopWidth: 2,
            borderTopColor: tierColor,
            borderRadius: 3,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Svg
              width={20}
              height={20}
              viewBox="42.33 85.84 128 128"
              style={{ marginRight: 8 }}
            >
              <Path d={Z} fill={D.inkGhost} fillOpacity={0.6} />
            </Svg>
            <Text
              style={{
                fontFamily: "DM Mono",
                fontSize: 8.5,
                color: D.inkDim,
                letterSpacing: 1.5,
              }}
            >
              ZAENA TRUST INFRASTRUCTURE
            </Text>
          </View>
          <Text
            style={{
              fontFamily: "DM Mono",
              fontSize: 8.5,
              color: D.inkGhost,
              lineHeight: 16,
            }}
          >
            This report is generated from real-time, tamper-evident transaction
            data recorded within the ZAENA ERP system. Verified via WhatsApp
            digital audit trail.
          </Text>
          <View
            style={{
              marginTop: 10,
              paddingTop: 10,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: D.rule,
            }}
          >
            <Text
              style={{
                fontFamily: "DM Mono",
                fontSize: 8,
                color: D.inkGhost,
                letterSpacing: 0.8,
              }}
            >
              REF: {report.report_ref}
            </Text>
            <Text
              style={{
                fontFamily: "DM Mono",
                fontSize: 8,
                color: D.inkGhost,
                letterSpacing: 0.8,
                marginTop: 2,
              }}
            >
              VERIFY: zaena.app/verify/{report.report_ref}
            </Text>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
