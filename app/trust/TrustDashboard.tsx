import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuthStore } from "../../stores/authStore"; // adjust to your path
import { TrustScoreData, TrustTier, useTrustScore } from "./useTrustScore"; // same folder

// ─── Brand mark path (from Zaena.svg) ────────────────────────────────────────
const Z =
  "m 103.29513,210.17948 c -0.36381,-0.20797 -1.33149,-0.38234 -2.15042,-0.3875 -0.99138,-0.006 -1.599028,-0.142 -1.818338,-0.40625 -0.18115,-0.21828 -0.73525,-0.39688 -1.23132,-0.39688 -0.55766,0 -0.96008,-0.15149 -1.05425,-0.39687 -0.0838,-0.21828 -0.42263,-0.39688 -0.75304,-0.39688 -0.33042,0 -0.74515,-0.17398 -0.92163,-0.38663 -0.17648,-0.21264 -0.57801,-0.46817 -0.89229,-0.56784 -1.29167,-0.40962 -4.684242,-3.32237 -5.757754,-4.94341 -0.598339,-0.90351 -1.253768,-1.73795 -1.456508,-1.85433 -0.202741,-0.11637 -0.36862,-0.36305 -0.36862,-0.54818 0,-0.18512 -0.353875,-0.80428 -0.786389,-1.37591 -0.432514,-0.57163 -0.789701,-1.18931 -0.79375,-1.37264 -0.004,-0.18332 -0.245486,-0.53721 -0.536527,-0.78641 -0.291042,-0.24919 -0.529167,-0.71836 -0.529167,-1.04259 0,-0.32423 -0.148828,-0.68472 -0.330729,-0.8011 -0.315041,-0.20154 -0.625392,-0.71979 -1.869598,-3.122 -0.301486,-0.58208 -0.703654,-1.15354 -0.893706,-1.26992 -0.190053,-0.11637 -0.34555,-0.43765 -0.34555,-0.71397 0,-0.27631 -0.281544,-0.80618 -0.625652,-1.17748 -0.612008,-0.66036 -0.705777,-0.67527 -4.299479,-0.6835 -2.810515,-0.006 -3.794515,-0.0997 -4.187417,-0.39688 -0.282475,-0.21365 -1.013877,-0.38846 -1.625339,-0.38846 -0.744144,0 -1.162104,-0.13122 -1.264043,-0.39687 -0.08791,-0.22909 -0.483388,-0.39688 -0.93545,-0.39688 -0.430735,0 -0.940488,-0.14882 -1.132783,-0.33072 -0.192295,-0.18191 -0.903381,-0.60109 -1.580191,-0.93152 -0.67681,-0.33043 -1.298152,-0.77692 -1.380759,-0.99219 -0.08261,-0.21527 -0.3867,-0.3914 -0.675762,-0.3914 -0.57835,0 -5.311874,-4.46916 -5.311874,-5.01521 0,-0.18293 -0.357187,-0.78358 -0.79375,-1.33479 -0.436562,-0.5512 -0.79375,-1.14528 -0.79375,-1.32017 0,-0.3152 -0.177693,-0.71062 -1.261866,-2.80798 -0.318996,-0.61711 -0.497577,-1.32833 -0.413888,-1.64835 0.08377,-0.32033 -0.09354,-1.02478 -0.411438,-1.63468 -0.492972,-0.94579 -0.558641,-1.51958 -0.558641,-4.88119 0,-3.19175 0.07099,-3.8804 0.437834,-4.24725 0.240808,-0.2408 0.493872,-1.02104 0.562363,-1.73384 0.06849,-0.71281 0.288186,-1.43183 0.488209,-1.59784 0.200022,-0.166 0.363677,-0.57032 0.363677,-0.89849 0,-0.32816 0.178594,-0.74488 0.396875,-0.92604 0.218282,-0.18116 0.396875,-0.53835 0.396875,-0.79375 0,-0.25541 0.178594,-0.61259 0.396875,-0.79375 0.218282,-0.18116 0.396875,-0.53447 0.396875,-0.78514 0,-0.25067 0.238125,-0.67126 0.529167,-0.93465 0.751761,-0.68034 0.751761,-2.89921 0,-3.3687 -0.291042,-0.18175 -0.529167,-0.56034 -0.529167,-0.8413 0,-0.28096 -0.165069,-0.6988 -0.36682,-0.92854 -0.659243,-0.7507 -2.01443,-3.52112 -2.01443,-4.11812 0,-0.32076 -0.238125,-0.7987 -0.529166,-1.06209 -0.394407,-0.35693 -0.53131,-0.82219 -0.537582,-1.82695 -0.0048,-0.76334 -0.176907,-1.57082 -0.396874,-1.86164 -0.564861,-0.74681 -0.557903,-6.55703 0.0084,-7.02704 0.260071,-0.21584 0.396875,-0.80569 0.396875,-1.71118 0,-1.04578 0.12868,-1.49825 0.529167,-1.86069 0.291041,-0.26339 0.529166,-0.74133 0.529166,-1.0621 0,-0.55183 1.303656,-3.27324 1.949512,-4.06965 0.164696,-0.20309 0.418509,-0.65076 0.56403,-0.99483 0.374153,-0.88466 4.373468,-4.85363 4.890731,-4.85363 0.236182,0 0.833322,-0.41672 1.326977,-0.92604 0.493655,-0.50932 1.159117,-0.92604 1.478803,-0.92604 0.319687,0 0.649781,-0.1786 0.733544,-0.39688 0.08376,-0.21828 0.439109,-0.39687 0.78966,-0.39687 0.350551,0 0.785585,-0.1786 0.966743,-0.39688 0.181157,-0.21828 0.683381,-0.39687 1.116053,-0.39687 0.432671,0 1.102702,-0.17958 1.488957,-0.39907 0.516965,-0.29377 2.028006,-0.45086 5.726292,-0.59531 4.738449,-0.18509 5.029213,-0.22632 5.115549,-0.72541 0.05035,-0.29104 0.240169,-0.64823 0.421828,-0.79375 0.329066,-0.26361 0.486564,-0.53092 1.741489,-2.95572 0.363665,-0.70269 0.81015,-1.37283 0.992187,-1.4892 0.182037,-0.11637 0.330977,-0.50333 0.330977,-0.8599 0,-0.35657 0.121615,-0.64831 0.270256,-0.64831 0.14864,0 0.414198,-0.32742 0.590128,-0.7276 0.17593,-0.40018 0.649627,-1.19195 1.052661,-1.75949 0.403033,-0.56754 0.732788,-1.19635 0.732788,-1.39737 0,-0.20101 0.178594,-0.43401 0.396875,-0.51777 0.218282,-0.0838 0.398262,-0.407454 0.399957,-0.719308 0.0046,-0.842744 5.610724,-6.515396 6.817554,-6.898427 0.29695,-0.09425 0.6843,-0.345345 0.86078,-0.557991 0.17648,-0.212645 0.59122,-0.386628 0.92163,-0.386628 0.33042,0 0.66929,-0.178594 0.75305,-0.396875 0.0871,-0.22692 0.48189,-0.396875 0.92195,-0.396875 0.42331,0 0.91788,-0.178594 1.09904,-0.396875 0.18378,-0.22144 0.76053,-0.396875 1.304738,-0.396875 0.53645,0 1.20648,-0.174807 1.48895,-0.388461 0.76108,-0.575646 9.16487,-0.582981 9.64172,-0.0084 0.18116,0.218281 0.76128,0.400661 1.28917,0.405289 0.52788,0.0046 1.1909,0.183222 1.47338,0.396875 0.28247,0.213654 0.85176,0.388461 1.26507,0.388461 0.42391,0 0.81787,0.172999 0.90378,0.396875 0.0838,0.218281 0.37665,0.396875 0.65087,0.396875 0.27421,0 1.0445,0.416718 1.71175,0.926041 0.66725,0.509323 1.31687,0.926042 1.44361,0.926042 0.29218,0 4.75612,4.44092 4.75612,4.7316 0,0.118848 0.36256,0.716593 0.8057,1.328323 0.44313,0.611734 0.9191,1.373734 1.0577,1.693344 0.1386,0.31961 0.37135,0.78947 0.51722,1.04413 0.43815,0.76493 0.74395,1.33048 1.37673,2.54608 0.33125,0.63635 0.75245,1.21464 0.936,1.28507 0.18355,0.0704 0.33373,0.4088 0.33373,0.75191 0,0.35305 0.22969,0.74677 0.52917,0.90704 0.29104,0.15576 0.52916,0.52977 0.52916,0.83113 0,0.30136 0.35719,0.99892 0.79375,1.55012 0.43657,0.55121 0.79375,1.12686 0.79375,1.27923 0,0.4943 0.38641,0.55154 4.75593,0.70451 3.1594,0.11061 4.45601,0.25428 4.86215,0.53876 0.30461,0.21335 0.9478,0.38792 1.42931,0.38792 0.53412,0 0.93485,0.15474 1.02777,0.39687 0.0838,0.21828 0.42263,0.39688 0.75305,0.39688 0.33041,0 0.74897,0.17859 0.93013,0.39687 0.18115,0.21828 0.53834,0.39688 0.79375,0.39688 0.2554,0 0.61259,0.17859 0.79375,0.39687 0.18115,0.21828 0.4742,0.39688 0.65122,0.39688 0.78647,0 5.88105,5.03183 6.67111,6.58893 0.26558,0.52343 0.6317,1.04691 0.8136,1.16328 0.1819,0.11637 0.33073,0.50706 0.33073,0.8682 0,0.36114 0.1786,0.72515 0.39688,0.80891 0.21828,0.0838 0.39687,0.41876 0.39687,0.74444 0,0.32568 0.23813,0.80764 0.52917,1.07103 0.33772,0.30564 0.53221,0.82301 0.53758,1.43007 0.005,0.52315 0.18322,1.1823 0.39688,1.46477 0.56563,0.74783 0.56563,9.33749 0,10.08532 -0.21366,0.28247 -0.39225,0.94162 -0.39688,1.46477 -0.005,0.60706 -0.19986,1.12443 -0.53758,1.43007 -0.29104,0.26339 -0.52917,0.74535 -0.52917,1.07103 0,0.32568 -0.17859,0.66068 -0.39687,0.74444 -0.21828,0.0838 -0.39688,0.45743 -0.39688,0.83036 0,0.37294 -0.17859,0.7466 -0.39687,0.83036 -0.21828,0.0838 -0.39688,0.34152 -0.39688,0.57279 0,0.23127 -0.32039,0.88282 -0.71199,1.4479 -0.59465,0.85808 -0.66006,1.11055 -0.39687,1.53198 0.17331,0.27752 0.31511,0.73159 0.31511,1.00903 0,0.27745 0.14883,0.56365 0.33073,0.636 0.1819,0.0723 0.56439,0.5911 0.84998,1.15278 0.28559,0.56169 0.72801,1.23046 0.98316,1.48616 0.25515,0.2557 0.40424,0.6204 0.33131,0.81044 -0.0729,0.19004 0.10973,0.56483 0.40591,0.83287 0.29617,0.26803 0.54228,0.73677 0.54691,1.04164 0.005,0.30486 0.18322,0.78542 0.39688,1.06789 0.21365,0.28248 0.38846,0.94433 0.38846,1.47079 0,0.52645 0.1748,1.18831 0.38846,1.47078 0.56274,0.74401 0.57671,7.99102 0.0168,8.73125 -0.21366,0.28247 -0.39225,1.08287 -0.39688,1.77867 -0.006,0.87462 -0.13091,1.31207 -0.40529,1.41737 -0.21828,0.0838 -0.39687,0.37401 -0.39687,0.645 0,0.62771 -1.45901,3.31136 -3.03831,5.58855 -0.93449,1.34745 -3.34278,3.90693 -3.68132,3.91243 -0.13053,0.002 -0.74588,0.42058 -1.36744,0.9299 -0.62157,0.50933 -1.31844,0.92604 -1.54861,0.92604 -0.23017,0 -0.41849,0.1168 -0.41849,0.25955 0,0.14275 -0.29277,0.33302 -0.65061,0.42283 -0.35783,0.0898 -0.78913,0.33021 -0.95843,0.53421 -0.16931,0.204 -0.63771,0.37091 -1.04088,0.37091 -0.40752,0 -0.80068,0.17625 -0.88534,0.39688 -0.10277,0.26781 -0.52305,0.39687 -1.29236,0.39687 -0.62703,0 -1.39093,0.17573 -1.69757,0.3905 -0.42848,0.30012 -1.62083,0.40728 -5.1521,0.46302 l -4.59458,0.0725 -0.0849,0.66145 c -0.0467,0.36381 -0.2441,0.78566 -0.43874,0.93746 -0.19463,0.1518 -0.61072,0.76877 -0.92464,1.37104 -0.31392,0.60227 -0.74157,1.23679 -0.95033,1.41005 -0.20875,0.17325 -0.37955,0.58534 -0.37955,0.91575 0,0.33042 -0.17859,0.66929 -0.39687,0.75305 -0.21829,0.0838 -0.39688,0.32866 -0.39688,0.54421 0,0.21555 -0.32742,0.9039 -0.7276,1.52966 -1.2068,1.88705 -1.36551,2.16129 -1.76849,3.05597 -0.21303,0.47294 -0.4834,0.8599 -0.60082,0.8599 -0.11742,0 -0.38111,0.38695 -0.58597,0.85989 -0.4381,1.01143 -4.97957,5.75469 -5.50986,5.75469 -0.2002,0 -0.90976,0.41672 -1.5768,0.92604 -0.66704,0.50932 -1.41923,0.92604 -1.67153,0.92604 -0.25229,0 -0.60694,0.1786 -0.7881,0.39688 -0.18115,0.21828 -0.67572,0.39687 -1.09903,0.39687 -0.44006,0 -0.83487,0.16996 -0.92195,0.39688 -0.11074,0.28857 -0.564,0.39687 -1.66092,0.39687 -0.91688,0 -1.71007,0.15237 -2.02221,0.38846 -0.70606,0.53404 -5.27182,0.54024 -6.20213,0.008 z";

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  bg: "#04101A",
  bgDeep: "#020810",
  bgCard: "#030C16",
  border: "#071420",
  borderMid: "#0A1C24",
  textPrimary: "#B4CAD2",
  textMid: "#6A94A4",
  textDim: "#1A3040",
  textGhost: "#0E2030",
  green: "#00C896",
  gold: "#C9922A",
  red: "#E05050",
};

const TIERS: Record<TrustTier, { label: string; color: string }> = {
  unverified: { label: "UNVERIFIED", color: "#4A8898" },
  bronze: { label: "BRONZE", color: "#CD7F32" },
  silver: { label: "SILVER", color: "#A8A9AD" },
  gold: { label: "GOLD", color: C.gold },
  zaena_verified: { label: "ZAENA VERIFIED", color: C.green },
};

const DIMS: Record<string, { label: string; weight: number }> = {
  cash_flow: { label: "Cash Flow Consistency", weight: 25 },
  payment_behaviour: { label: "Payment Behaviour", weight: 25 },
  financial_discipline: { label: "Financial Discipline", weight: 20 },
  customer_quality: { label: "Customer Quality", weight: 15 },
  longevity: { label: "Longevity & Growth", weight: 15 },
};

const HINTS: Record<string, string> = {
  cash_flow:
    "Revenue consistency over 12 weeks × daily activity density × void quality.",
  payment_behaviour:
    "Debt recovery rate + settlement speed + supplier payment discipline.",
  financial_discipline:
    "Profit allocation, tax remittances, cash-vs-book rate, drawing discipline.",
  customer_quality:
    "Revenue from repeat customers + WhatsApp receipt delivery + breadth.",
  longevity:
    "Days active + activity density + business formality + score trajectory.",
};

const TIER_KEYS: TrustTier[] = [
  "unverified",
  "bronze",
  "silver",
  "gold",
  "zaena_verified",
];
const TIER_ABBR: Record<TrustTier, string> = {
  unverified: "UNVER",
  bronze: "BRZ",
  silver: "SLV",
  gold: "GLD",
  zaena_verified: "ZV",
};
const TIER_THRESHOLDS: Partial<Record<TrustTier, number>> = {
  bronze: 50,
  silver: 65,
  gold: 75,
  zaena_verified: 85,
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ScoreHero({ score, tier }: { score: number; tier: TrustTier }) {
  const cfg = TIERS[tier] ?? TIERS.unverified;
  const SIZE = 220;
  // Mark is always clearly visible: floor 0.30 (ghost), ceiling 0.82 (luminous at 100)
  const opacity = 0.3 + (score / 100) * 0.52;

  return (
    <View
      style={{
        width: SIZE,
        height: SIZE,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Svg
        width={SIZE}
        height={SIZE}
        viewBox="42.33 85.84 128 128"
        style={StyleSheet.absoluteFillObject}
      >
        <Path d={Z} fill={cfg.color} fillOpacity={opacity} />
      </Svg>

      <View style={{ alignItems: "center", marginTop: SIZE * 0.04 }}>
        <Text
          style={{
            fontFamily: "Cormorant Garamond",
            fontSize: SIZE * 0.21,
            fontWeight: "400",
            color: "#E0EEF2",
            lineHeight: SIZE * 0.23,
          }}
        >
          {score.toFixed(1)}
        </Text>
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: SIZE * 0.058,
            color: cfg.color,
            letterSpacing: 3,
            opacity: 0.5,
            marginTop: 2,
          }}
        >
          / 100
        </Text>
      </View>
    </View>
  );
}

function TierTrack({ tier, score }: { tier: TrustTier; score: number }) {
  const cfg = TIERS[tier];
  const idx = TIER_KEYS.indexOf(tier);
  const next = TIER_KEYS[idx + 1] as TrustTier | undefined;
  const toGo = next
    ? Math.max(0, (TIER_THRESHOLDS[next] ?? 0) - score).toFixed(1)
    : null;

  return (
    <View style={{ width: "100%" }}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {TIER_KEYS.map((k, i) => {
          const kc = TIERS[k].color;
          const isActive = k === tier;
          const isPast = i < idx;
          return (
            <View
              key={k}
              style={{
                flexDirection: "row",
                alignItems: "center",
                flex: i < TIER_KEYS.length - 1 ? 1 : undefined,
              }}
            >
              <View
                style={{
                  width: isActive ? 10 : 6,
                  height: isActive ? 10 : 6,
                  borderRadius: 5,
                  backgroundColor: isPast || isActive ? kc : "transparent",
                  borderWidth: 1.5,
                  borderColor: isPast || isActive ? kc : C.border,
                }}
              />
              {i < TIER_KEYS.length - 1 && (
                <View
                  style={{
                    flex: 1,
                    height: 1,
                    backgroundColor: isPast ? kc : C.border,
                    marginHorizontal: 3,
                  }}
                />
              )}
            </View>
          );
        })}
      </View>

      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: 7,
        }}
      >
        {TIER_KEYS.map((k) => (
          <Text
            key={k}
            style={{
              fontFamily: "DM Mono",
              fontSize: 8,
              color: k === tier ? TIERS[k].color : C.border,
              letterSpacing: 0.5,
            }}
          >
            {TIER_ABBR[k]}
          </Text>
        ))}
      </View>

      {next && toGo && (
        <View
          style={{
            marginTop: 10,
            padding: 10,
            backgroundColor: C.bgDeep,
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: 3,
            flexDirection: "row",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{ fontFamily: "DM Mono", fontSize: 9.5, color: C.textDim }}
          >
            Next:{" "}
            <Text style={{ color: TIERS[next].color }}>
              {TIERS[next].label}
            </Text>
          </Text>
          <Text
            style={{ fontFamily: "DM Mono", fontSize: 9.5, color: C.border }}
          >
            +{toGo} pts · sustained
          </Text>
        </View>
      )}
    </View>
  );
}

function DimRow({
  dimKey,
  value,
  weight,
  expanded,
  onToggle,
}: {
  dimKey: string;
  value: number;
  weight: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pct = Math.min(100, value);
  const barColor =
    pct >= 75
      ? C.green
      : pct >= 50
        ? C.gold
        : pct >= 20
          ? "#C08030"
          : C.borderMid;

  return (
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      style={{
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: C.border,
      }}
    >
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: 9,
            color: C.border,
            width: 10,
          }}
        >
          ▸
        </Text>
        <Text
          style={{
            fontFamily: "Cormorant Garamond",
            fontSize: 14,
            color: C.textMid,
            flex: 1,
          }}
        >
          {DIMS[dimKey]?.label}
        </Text>
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: 9,
            color: C.textDim,
            marginRight: 8,
          }}
        >
          {weight}%
        </Text>
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: 15,
            color: barColor,
            minWidth: 40,
            textAlign: "right",
          }}
        >
          {value.toFixed(1)}
        </Text>
      </View>

      <View
        style={{
          marginTop: 6,
          marginLeft: 20,
          height: 2,
          backgroundColor: C.border,
          borderRadius: 1,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: barColor,
            borderRadius: 1,
          }}
        />
      </View>

      {expanded && (
        <View
          style={{
            marginTop: 8,
            marginLeft: 20,
            padding: 10,
            backgroundColor: "#020810",
            borderWidth: 1,
            borderColor: C.border,
            borderRadius: 3,
          }}
        >
          <Text
            style={{
              fontFamily: "DM Mono",
              fontSize: 10.5,
              color: C.textDim,
              lineHeight: 18,
            }}
          >
            {HINTS[dimKey]}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function IntegrityPanel({ d }: { d: TrustScoreData["recording_integrity"] }) {
  const m = d.multiplier;
  const color = m > 1 ? C.green : m < 0.85 ? C.red : C.gold;
  const barPct = Math.min(100, ((m - 0.5) / 0.55) * 100);

  return (
    <View
      style={{
        padding: 14,
        backgroundColor: C.bgDeep,
        borderWidth: 1,
        borderColor: C.border,
        borderRadius: 5,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: 8.5,
            color: C.textGhost,
            letterSpacing: 2,
          }}
        >
          RECORDING INTEGRITY
        </Text>
        <View
          style={{
            backgroundColor: `${color}15`,
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 2,
          }}
        >
          <Text style={{ fontFamily: "DM Mono", fontSize: 12, color }}>
            ×{m.toFixed(2)}
            {m > 1 ? " BONUS" : ""}
          </Text>
        </View>
      </View>

      <View
        style={{
          height: 2,
          backgroundColor: C.bgCard,
          borderRadius: 1,
          overflow: "hidden",
          marginBottom: 12,
        }}
      >
        <View
          style={{
            width: `${barPct}%`,
            height: "100%",
            backgroundColor: color,
          }}
        />
      </View>

      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {[
          {
            k: "Live Rate (1h)",
            v: `${d.live_rate_1h}%`,
            ok: d.live_rate_1h >= 80,
          },
          {
            k: "Consistency",
            v: d.consistency_bonus ? "ACTIVE" : "—",
            ok: d.consistency_bonus,
          },
          {
            k: "Silent Backdated",
            v: `${d.silent_backdated}`,
            ok: d.silent_backdated === 0,
          },
          {
            k: "Anomaly (30d)",
            v: d.anomaly_pct_30d > 0 ? `${d.anomaly_pct_30d}%` : "CLEAR",
            ok: d.anomaly_pct_30d === 0,
          },
        ].map((s, i) => (
          <View
            key={s.k}
            style={{
              width: "50%",
              paddingRight: i % 2 === 0 ? 8 : 0,
              marginBottom: 6,
              flexDirection: "row",
              justifyContent: "space-between",
            }}
          >
            <Text
              style={{ fontFamily: "DM Mono", fontSize: 9.5, color: C.textDim }}
            >
              {s.k}
            </Text>
            <Text
              style={{
                fontFamily: "DM Mono",
                fontSize: 9.5,
                color: s.ok ? C.green : C.red,
              }}
            >
              {s.v}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function SkeletonBlock({
  w = "100%",
  h = 16,
  mt = 0,
}: {
  w?: string | number;
  h?: number;
  mt?: number;
}) {
  return (
    <View
      style={{
        width: w as any,
        height: h,
        marginTop: mt,
        backgroundColor: "#060E18",
        borderRadius: 3,
      }}
    />
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
        padding: 32,
      }}
    >
      <Text
        style={{
          fontFamily: "DM Mono",
          fontSize: 9,
          color: C.textDim,
          letterSpacing: 2,
          marginBottom: 12,
        }}
      >
        SCORE UNAVAILABLE
      </Text>
      <Text
        style={{
          fontFamily: "Cormorant Garamond",
          fontSize: 15,
          color: C.textMid,
          textAlign: "center",
          marginBottom: 24,
          lineHeight: 22,
        }}
      >
        {message}
      </Text>
      <TouchableOpacity
        onPress={onRetry}
        style={{
          borderWidth: 1,
          borderColor: C.borderMid,
          paddingHorizontal: 18,
          paddingVertical: 8,
          borderRadius: 3,
        }}
      >
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: 10,
            color: C.textMid,
            letterSpacing: 1.5,
          }}
        >
          RETRY
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function TrustDashboardScreen() {
  const insets = useSafeAreaInsets();
  const { organizationId } = useAuthStore();
  const router = useRouter();

  const { data, loading, error, refresh } = useTrustScore(
    organizationId ?? null,
  );

  // Fetch on mount
  useEffect(() => {
    refresh();
  }, [refresh]);

  const [tab, setTab] = useState<"score" | "metrics" | "reports">("score");
  const [expandedDim, setExpandedDim] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const cfg = data ? (TIERS[data.tier] ?? TIERS.unverified) : TIERS.unverified;

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingTop: insets.top }}>
      {/* HEADER */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 20,
          paddingBottom: 16,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "flex-end",
        }}
      >
        <View>
          <Text
            style={{
              fontFamily: "DM Mono",
              fontSize: 8.5,
              color: C.textGhost,
              letterSpacing: 4,
              marginBottom: 4,
            }}
          >
            ZAENA · TRUST
          </Text>
          <Text
            style={{
              fontFamily: "Cormorant Garamond",
              fontSize: 22,
              fontWeight: "500",
              color: C.textPrimary,
            }}
          >
            Business Score
          </Text>
        </View>
        {data && (
          <View
            style={{
              borderWidth: 1,
              borderColor: `${cfg.color}28`,
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 2,
              backgroundColor: `${cfg.color}08`,
            }}
          >
            <Text
              style={{
                fontFamily: "DM Mono",
                fontSize: 9,
                color: cfg.color,
                letterSpacing: 1.5,
              }}
            >
              {cfg.label}
            </Text>
          </View>
        )}
      </View>

      {/* BODY */}
      {loading && !data ? (
        // Initial skeleton
        <View style={{ padding: 24 }}>
          <View style={{ alignItems: "center", marginBottom: 24 }}>
            <SkeletonBlock w={220} h={220} />
          </View>
          <SkeletonBlock h={8} w="60%" mt={8} />
          <SkeletonBlock h={2} mt={16} />
          <SkeletonBlock h={14} mt={20} />
          <SkeletonBlock h={14} mt={10} />
          <SkeletonBlock h={14} mt={10} />
        </View>
      ) : error ? (
        <ErrorState message={error} onRetry={refresh} />
      ) : data ? (
        <>
          {/* TABS */}
          <View
            style={{
              flexDirection: "row",
              borderBottomWidth: 1,
              borderBottomColor: C.border,
            }}
          >
            {(["score", "metrics", "reports"] as const).map((t) => (
              <TouchableOpacity
                key={t}
                onPress={() => setTab(t)}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderBottomWidth: 2,
                  borderBottomColor: tab === t ? cfg.color : "transparent",
                }}
              >
                <Text
                  style={{
                    fontFamily: "DM Mono",
                    fontSize: 10,
                    color: tab === t ? cfg.color : C.textDim,
                    textAlign: "center",
                    letterSpacing: 2,
                    textTransform: "uppercase",
                  }}
                >
                  {t}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingBottom: 80 + insets.bottom,
            }}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={cfg.color}
                colors={[cfg.color]}
              />
            }
          >
            {/* HERO (always visible above tab content) */}
            <View
              style={{
                alignItems: "center",
                paddingTop: 28,
                paddingBottom: 20,
              }}
            >
              <ScoreHero score={data.overall_score} tier={data.tier} />

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  marginTop: 12,
                }}
              >
                <Text
                  style={{
                    fontFamily: "DM Mono",
                    fontSize: 8.5,
                    color: C.textGhost,
                    letterSpacing: 3,
                  }}
                >
                  TRAJECTORY
                </Text>
                <View
                  style={{
                    borderWidth: 1,
                    borderColor:
                      data.trajectory === "improving"
                        ? `${C.green}22`
                        : data.trajectory === "declining"
                          ? `${C.red}22`
                          : `${C.textDim}22`,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    borderRadius: 2,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "DM Mono",
                      fontSize: 8.5,
                      letterSpacing: 1.5,
                      color:
                        data.trajectory === "improving"
                          ? C.green
                          : data.trajectory === "declining"
                            ? C.red
                            : C.textDim,
                    }}
                  >
                    {data.trajectory === "insufficient_data"
                      ? "BUILDING HISTORY"
                      : data.trajectory.toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={{ width: "100%", marginTop: 22 }}>
                <TierTrack tier={data.tier} score={data.overall_score} />
              </View>
            </View>

            {/* ── SCORE TAB ── */}
            {tab === "score" && (
              <View>
                <Text
                  style={{
                    fontFamily: "DM Mono",
                    fontSize: 8.5,
                    color: C.textGhost,
                    letterSpacing: 3.5,
                    marginBottom: 6,
                  }}
                >
                  SCORE DIMENSIONS
                </Text>
                <View style={{ marginBottom: 18 }}>
                  {Object.entries(data.dimensions).map(([k, v]) => (
                    <DimRow
                      key={k}
                      dimKey={k}
                      value={v}
                      weight={DIMS[k]?.weight ?? 0}
                      expanded={expandedDim === k}
                      onToggle={() =>
                        setExpandedDim(expandedDim === k ? null : k)
                      }
                    />
                  ))}
                </View>

                <IntegrityPanel d={data.recording_integrity} />

                {/* Operating profile */}
                <View
                  style={{
                    marginTop: 12,
                    padding: 14,
                    backgroundColor: C.bgDeep,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 5,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "DM Mono",
                      fontSize: 8.5,
                      color: C.textGhost,
                      letterSpacing: 3.5,
                      marginBottom: 10,
                    }}
                  >
                    OPERATING PROFILE
                  </Text>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <View>
                      <Text
                        style={{
                          fontFamily: "DM Mono",
                          fontSize: 14,
                          color: C.textDim,
                        }}
                      >
                        {String(data.operating_profile.start_hour).padStart(
                          2,
                          "0",
                        )}
                        :00
                        {"  →  "}
                        {String(data.operating_profile.end_hour).padStart(
                          2,
                          "0",
                        )}
                        :00
                      </Text>
                      <Text
                        style={{
                          fontFamily: "DM Mono",
                          fontSize: 9,
                          color: C.textGhost,
                          marginTop: 4,
                          letterSpacing: 1.5,
                        }}
                      >
                        {data.operating_profile.profile_type
                          .replace(/_/g, " ")
                          .toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text
                        style={{
                          fontFamily: "DM Mono",
                          fontSize: 22,
                          color: C.border,
                        }}
                      >
                        {(data.operating_profile.confidence * 100).toFixed(0)}%
                      </Text>
                      <Text
                        style={{
                          fontFamily: "DM Mono",
                          fontSize: 8.5,
                          color: C.textGhost,
                          letterSpacing: 1,
                        }}
                      >
                        CONFIDENCE
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ── METRICS TAB ── */}
            {tab === "metrics" && (
              <View>
                <Text
                  style={{
                    fontFamily: "DM Mono",
                    fontSize: 8.5,
                    color: C.textGhost,
                    letterSpacing: 3.5,
                    marginBottom: 16,
                  }}
                >
                  RAW PERFORMANCE DATA
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 10,
                    marginBottom: 20,
                  }}
                >
                  {[
                    { l: "Total Sales", v: data.metrics.total_sales, u: "" },
                    { l: "Days Active", v: data.metrics.days_active, u: "" },
                    {
                      l: "Cash Collected",
                      v: data.metrics.cash_collection_pct,
                      u: "%",
                    },
                    {
                      l: "Recovery Rate",
                      v: data.metrics.recovery_rate_pct,
                      u: "%",
                    },
                    {
                      l: "Supplier Paid",
                      v: data.metrics.supplier_payment_pct,
                      u: "%",
                    },
                    {
                      l: "Avg Recovery",
                      v: data.metrics.avg_recovery_days,
                      u: "d",
                    },
                    {
                      l: "Repeat Customers",
                      v: data.metrics.repeat_customer_pct,
                      u: "%",
                    },
                    {
                      l: "WhatsApp Receipts",
                      v: data.metrics.whatsapp_receipt_pct,
                      u: "%",
                    },
                  ].map(({ l, v, u }) => (
                    <View
                      key={l}
                      style={{
                        width: "47%",
                        padding: 12,
                        backgroundColor: C.bgDeep,
                        borderWidth: 1,
                        borderColor: C.border,
                        borderRadius: 4,
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: "DM Mono",
                          fontSize: 20,
                          color: C.gold,
                          lineHeight: 24,
                        }}
                      >
                        {typeof v === "number"
                          ? v.toFixed(v % 1 === 0 ? 0 : 1)
                          : v}
                        {u}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "Cormorant Garamond",
                          fontSize: 11,
                          color: C.textDim,
                          marginTop: 5,
                        }}
                      >
                        {l}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Score composition breakdown */}
                <View
                  style={{
                    padding: 14,
                    backgroundColor: C.bgDeep,
                    borderWidth: 1,
                    borderColor: C.border,
                    borderRadius: 5,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "DM Mono",
                      fontSize: 8.5,
                      color: C.textGhost,
                      letterSpacing: 3.5,
                      marginBottom: 12,
                    }}
                  >
                    SCORE COMPOSITION
                  </Text>
                  {Object.entries(DIMS).map(([k, v]) => {
                    const ds = (data.dimensions as any)[k] ?? 0;
                    return (
                      <View
                        key={k}
                        style={{
                          flexDirection: "row",
                          justifyContent: "space-between",
                          paddingBottom: 7,
                          marginBottom: 7,
                          borderBottomWidth: 1,
                          borderBottomColor: "#06101A",
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: "DM Mono",
                            fontSize: 9.5,
                            color: C.textDim,
                            flex: 1,
                          }}
                        >
                          {v.label}
                        </Text>
                        <Text
                          style={{
                            fontFamily: "DM Mono",
                            fontSize: 9.5,
                            color: C.textGhost,
                            marginRight: 8,
                          }}
                        >
                          {ds.toFixed(1)}×{v.weight}%
                        </Text>
                        <Text
                          style={{
                            fontFamily: "DM Mono",
                            fontSize: 9.5,
                            color: C.gold,
                            minWidth: 24,
                            textAlign: "right",
                          }}
                        >
                          {((ds * v.weight) / 100).toFixed(1)}
                        </Text>
                      </View>
                    );
                  })}
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingTop: 4,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "DM Mono",
                        fontSize: 9.5,
                        color: C.textDim,
                      }}
                    >
                      × Recording Integrity
                    </Text>
                    <Text
                      style={{
                        fontFamily: "DM Mono",
                        fontSize: 9.5,
                        color: C.green,
                      }}
                    >
                      ×{data.recording_integrity.multiplier.toFixed(2)}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      paddingTop: 9,
                      marginTop: 7,
                      borderTopWidth: 1,
                      borderTopColor: C.border,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: "DM Mono",
                        fontSize: 10.5,
                        color: C.textDim,
                      }}
                    >
                      OVERALL SCORE
                    </Text>
                    <Text
                      style={{
                        fontFamily: "DM Mono",
                        fontSize: 10.5,
                        color: C.textPrimary,
                      }}
                    >
                      {data.overall_score.toFixed(1)}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── REPORTS TAB ── */}
            {tab === "reports" && (
              <View>
                <Text
                  style={{
                    fontFamily: "DM Mono",
                    fontSize: 8.5,
                    color: C.textGhost,
                    letterSpacing: 3.5,
                    marginBottom: 16,
                  }}
                >
                  GENERATE A REPORT
                </Text>
                {[
                  {
                    title: "Summary Report",
                    desc: "Score + dimensions + key metrics",
                    aud: "Personal",
                    exp: "90 days",
                  },
                  {
                    title: "Supplier Report",
                    desc: "Payment behaviour + settlement record",
                    aud: "Suppliers",
                    exp: "90 days",
                  },
                  {
                    title: "Institutional Report",
                    desc: "Full audit trail + score history",
                    aud: "Banks",
                    exp: "90 days",
                  },
                  {
                    title: "Public Badge",
                    desc: "Tier + score band · shareable",
                    aud: "Marketplace",
                    exp: "7 days",
                  },
                ].map((r) => (
                  <TouchableOpacity
                    key={r.title}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (r.title === "Institutional Report") {
                        router.push("/trust/institutionalReport" as any);
                      }
                      if (r.title === "Summary Report")
                        router.push("/trust/summary-report");
                      if (r.title === "Supplier Report")
                        router.push("/trust/supplier-report");
                      if (r.title === "Public Badge")
                        router.push("/trust/public-badge");
                    }}
                    style={{
                      marginBottom: 10,
                      padding: 14,
                      backgroundColor: C.bgDeep,
                      borderWidth: 1,
                      borderColor: C.border,
                      borderRadius: 5,
                      flexDirection: "row",
                      gap: 14,
                      alignItems: "center",
                    }}
                  >
                    <View
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 3,
                        backgroundColor: C.bgCard,
                        borderWidth: 1,
                        borderColor: C.border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Svg width={26} height={26} viewBox="42.33 85.84 128 128">
                        <Path d={Z} fill={C.gold} fillOpacity={0.45} />
                      </Svg>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontFamily: "Cormorant Garamond",
                          fontSize: 14.5,
                          color: C.textMid,
                          marginBottom: 3,
                        }}
                      >
                        {r.title}
                      </Text>
                      <Text
                        style={{
                          fontFamily: "DM Mono",
                          fontSize: 9.5,
                          color: C.textDim,
                          lineHeight: 16,
                        }}
                      >
                        {r.desc} · {r.aud} · Valid {r.exp}
                      </Text>
                    </View>
                    <Text style={{ color: C.border, fontSize: 14 }}>›</Text>
                  </TouchableOpacity>
                ))}
                <View
                  style={{
                    marginTop: 6,
                    paddingTop: 10,
                    borderTopWidth: 1,
                    borderTopColor: C.border,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: "DM Mono",
                      fontSize: 9.5,
                      color: C.textGhost,
                      lineHeight: 18,
                    }}
                  >
                    Reports carry a unique ZTR reference.{"\n"}
                    Verifiable at{" "}
                    <Text style={{ color: C.textDim }}>zaena.app/verify</Text>
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>
        </>
      ) : null}

      {/* FOOTER */}
      <View
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 24,
          paddingTop: 10,
          paddingBottom: 10 + insets.bottom,
          backgroundColor: C.bgDeep,
          borderTopWidth: 1,
          borderTopColor: C.border,
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: 8.5,
            color: C.border,
            letterSpacing: 1.5,
          }}
        >
          ZAENA TRUST INFRASTRUCTURE v2
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: data ? C.green : C.border,
            }}
          />
          <Text
            style={{
              fontFamily: "DM Mono",
              fontSize: 8.5,
              color: C.border,
              letterSpacing: 1.5,
            }}
          >
            {loading ? "SYNCING" : "LIVE"}
          </Text>
        </View>
      </View>
    </View>
  );
}
