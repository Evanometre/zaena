// FILE: app/trust/supplier-report.tsx
// Supplier-facing — payment behaviour focus, settlement record, credit signal

import { supabase } from "@/lib/supabase";
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
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import { useAuthStore } from "../../stores/authStore";

const Z =
  "m 103.29513,210.17948 c -0.36381,-0.20797 -1.33149,-0.38234 -2.15042,-0.3875 -0.99138,-0.006 -1.599028,-0.142 -1.818338,-0.40625 -0.18115,-0.21828 -0.73525,-0.39688 -1.23132,-0.39688 -0.55766,0 -0.96008,-0.15149 -1.05425,-0.39687 -0.0838,-0.21828 -0.42263,-0.39688 -0.75304,-0.39688 -0.33042,0 -0.74515,-0.17398 -0.92163,-0.38663 -0.17648,-0.21264 -0.57801,-0.46817 -0.89229,-0.56784 -1.29167,-0.40962 -4.684242,-3.32237 -5.757754,-4.94341 -0.598339,-0.90351 -1.253768,-1.73795 -1.456508,-1.85433 -0.202741,-0.11637 -0.36862,-0.36305 -0.36862,-0.54818 0,-0.18512 -0.353875,-0.80428 -0.786389,-1.37591 -0.432514,-0.57163 -0.789701,-1.18931 -0.79375,-1.37264 -0.004,-0.18332 -0.245486,-0.53721 -0.536527,-0.78641 -0.291042,-0.24919 -0.529167,-0.71836 -0.529167,-1.04259 0,-0.32423 -0.148828,-0.68472 -0.330729,-0.8011 -0.315041,-0.20154 -0.625392,-0.71979 -1.869598,-3.122 -0.301486,-0.58208 -0.703654,-1.15354 -0.893706,-1.26992 -0.190053,-0.11637 -0.34555,-0.43765 -0.34555,-0.71397 0,-0.27631 -0.281544,-0.80618 -0.625652,-1.17748 -0.612008,-0.66036 -0.705777,-0.67527 -4.299479,-0.6835 -2.810515,-0.006 -3.794515,-0.0997 -4.187417,-0.39688 -0.282475,-0.21365 -1.013877,-0.38846 -1.625339,-0.38846 -0.744144,0 -1.162104,-0.13122 -1.264043,-0.39687 -0.08791,-0.22909 -0.483388,-0.39688 -0.93545,-0.39688 -0.430735,0 -0.940488,-0.14882 -1.132783,-0.33072 -0.192295,-0.18191 -0.903381,-0.60109 -1.580191,-0.93152 -0.67681,-0.33043 -1.298152,-0.77692 -1.380759,-0.99219 -0.08261,-0.21527 -0.3867,-0.3914 -0.675762,-0.3914 -0.57835,0 -5.311874,-4.46916 -5.311874,-5.01521 0,-0.18293 -0.357187,-0.78358 -0.79375,-1.33479 -0.436562,-0.5512 -0.79375,-1.14528 -0.79375,-1.32017 0,-0.3152 -0.177693,-0.71062 -1.261866,-2.80798 -0.318996,-0.61711 -0.497577,-1.32833 -0.413888,-1.64835 0.08377,-0.32033 -0.09354,-1.02478 -0.411438,-1.63468 -0.492972,-0.94579 -0.558641,-1.51958 -0.558641,-4.88119 0,-3.19175 0.07099,-3.8804 0.437834,-4.24725 0.240808,-0.2408 0.493872,-1.02104 0.562363,-1.73384 0.06849,-0.71281 0.288186,-1.43183 0.488209,-1.59784 0.200022,-0.166 0.363677,-0.57032 0.363677,-0.89849 0,-0.32816 0.178594,-0.74488 0.396875,-0.92604 0.218282,-0.18116 0.396875,-0.53835 0.396875,-0.79375 0,-0.25541 0.178594,-0.61259 0.396875,-0.79375 0.218282,-0.18116 0.396875,-0.53447 0.396875,-0.78514 0,-0.25067 0.238125,-0.67126 0.529167,-0.93465 0.751761,-0.68034 0.751761,-2.89921 0,-3.3687 -0.291042,-0.18175 -0.529167,-0.56034 -0.529167,-0.8413 0,-0.28096 -0.165069,-0.6988 -0.36682,-0.92854 -0.659243,-0.7507 -2.01443,-3.52112 -2.01443,-4.11812 0,-0.32076 -0.238125,-0.7987 -0.529166,-1.06209 -0.394407,-0.35693 -0.53131,-0.82219 -0.537582,-1.82695 -0.0048,-0.76334 -0.176907,-1.57082 -0.396874,-1.86164 -0.564861,-0.74681 -0.557903,-6.55703 0.0084,-7.02704 0.260071,-0.21584 0.396875,-0.80569 0.396875,-1.71118 0,-1.04578 0.12868,-1.49825 0.529167,-1.86069 0.291041,-0.26339 0.529166,-0.74133 0.529166,-1.0621 0,-0.55183 1.303656,-3.27324 1.949512,-4.06965 0.164696,-0.20309 0.418509,-0.65076 0.56403,-0.99483 0.374153,-0.88466 4.373468,-4.85363 4.890731,-4.85363 0.236182,0 0.833322,-0.41672 1.326977,-0.92604 0.493655,-0.50932 1.159117,-0.92604 1.478803,-0.92604 0.319687,0 0.649781,-0.1786 0.733544,-0.39688 0.08376,-0.21828 0.439109,-0.39687 0.78966,-0.39687 0.350551,0 0.785585,-0.1786 0.966743,-0.39688 0.181157,-0.21828 0.683381,-0.39687 1.116053,-0.39687 0.432671,0 1.102702,-0.17958 1.488957,-0.39907 0.516965,-0.29377 2.028006,-0.45086 5.726292,-0.59531 4.738449,-0.18509 5.029213,-0.22632 5.115549,-0.72541 0.05035,-0.29104 0.240169,-0.64823 0.421828,-0.79375 0.329066,-0.26361 0.486564,-0.53092 1.741489,-2.95572 0.363665,-0.70269 0.81015,-1.37283 0.992187,-1.4892 0.182037,-0.11637 0.330977,-0.50333 0.330977,-0.8599 0,-0.35657 0.121615,-0.64831 0.270256,-0.64831 0.14864,0 0.414198,-0.32742 0.590128,-0.7276 0.17593,-0.40018 0.649627,-1.19195 1.052661,-1.75949 0.403033,-0.56754 0.732788,-1.19635 0.732788,-1.39737 0,-0.20101 0.178594,-0.43401 0.396875,-0.51777 0.218282,-0.0838 0.398262,-0.407454 0.399957,-0.719308 0.0046,-0.842744 5.610724,-6.515396 6.817554,-6.898427 0.29695,-0.09425 0.6843,-0.345345 0.86078,-0.557991 0.17648,-0.212645 0.59122,-0.386628 0.92163,-0.386628 0.33042,0 0.66929,-0.178594 0.75305,-0.396875 0.0871,-0.22692 0.48189,-0.396875 0.92195,-0.396875 0.42331,0 0.91788,-0.178594 1.09904,-0.396875 0.18378,-0.22144 0.76053,-0.396875 1.304738,-0.396875 0.53645,0 1.20648,-0.174807 1.48895,-0.388461 0.76108,-0.575646 9.16487,-0.582981 9.64172,-0.0084 0.18116,0.218281 0.76128,0.400661 1.28917,0.405289 0.52788,0.0046 1.1909,0.183222 1.47338,0.396875 0.28247,0.213654 0.85176,0.388461 1.26507,0.388461 0.42391,0 0.81787,0.172999 0.90378,0.396875 0.0838,0.218281 0.37665,0.396875 0.65087,0.396875 0.27421,0 1.0445,0.416718 1.71175,0.926041 0.66725,0.509323 1.31687,0.926042 1.44361,0.926042 0.29218,0 4.75612,4.44092 4.75612,4.7316 0,0.118848 0.36256,0.716593 0.8057,1.328323 0.44313,0.611734 0.9191,1.373734 1.0577,1.693344 0.1386,0.31961 0.37135,0.78947 0.51722,1.04413 0.43815,0.76493 0.74395,1.33048 1.37673,2.54608 0.33125,0.63635 0.75245,1.21464 0.936,1.28507 0.18355,0.0704 0.33373,0.4088 0.33373,0.75191 0,0.35305 0.22969,0.74677 0.52917,0.90704 0.29104,0.15576 0.52916,0.52977 0.52916,0.83113 0,0.30136 0.35719,0.99892 0.79375,1.55012 0.43657,0.55121 0.79375,1.12686 0.79375,1.27923 0,0.4943 0.38641,0.55154 4.75593,0.70451 3.1594,0.11061 4.45601,0.25428 4.86215,0.53876 0.30461,0.21335 0.9478,0.38792 1.42931,0.38792 0.53412,0 0.93485,0.15474 1.02777,0.39687 0.0838,0.21828 0.42263,0.39688 0.75305,0.39688 0.33041,0 0.74897,0.17859 0.93013,0.39687 0.18115,0.21828 0.53834,0.39688 0.79375,0.39688 0.2554,0 0.61259,0.17859 0.79375,0.39687 0.18115,0.21828 0.4742,0.39688 0.65122,0.39688 0.78647,0 5.88105,5.03183 6.67111,6.58893 0.26558,0.52343 0.6317,1.04691 0.8136,1.16328 0.1819,0.11637 0.33073,0.50706 0.33073,0.8682 0,0.36114 0.1786,0.72515 0.39688,0.80891 0.21828,0.0838 0.39687,0.41876 0.39687,0.74444 0,0.32568 0.23813,0.80764 0.52917,1.07103 0.33772,0.30564 0.53221,0.82301 0.53758,1.43007 0.005,0.52315 0.18322,1.1823 0.39688,1.46477 0.56563,0.74783 0.56563,9.33749 0,10.08532 -0.21366,0.28247 -0.39225,0.94162 -0.39688,1.46477 -0.005,0.60706 -0.19986,1.12443 -0.53758,1.43007 -0.29104,0.26339 -0.52917,0.74535 -0.52917,1.07103 0,0.32568 -0.17859,0.66068 -0.39687,0.74444 -0.21828,0.0838 -0.39688,0.45743 -0.39688,0.83036 0,0.37294 -0.17859,0.7466 -0.39687,0.83036 -0.21828,0.0838 -0.39688,0.34152 -0.39688,0.57279 0,0.23127 -0.32039,0.88282 -0.71199,1.4479 -0.59465,0.85808 -0.66006,1.11055 -0.39687,1.53198 0.17331,0.27752 0.31511,0.73159 0.31511,1.00903 0,0.27745 0.14883,0.56365 0.33073,0.636 0.1819,0.0723 0.56439,0.5911 0.84998,1.15278 0.28559,0.56169 0.72801,1.23046 0.98316,1.48616 0.25515,0.2557 0.40424,0.6204 0.33131,0.81044 -0.0729,0.19004 0.10973,0.56483 0.40591,0.83287 0.29617,0.26803 0.54228,0.73677 0.54691,1.04164 0.005,0.30486 0.18322,0.78542 0.39688,1.06789 0.21365,0.28248 0.38846,0.94433 0.38846,1.47079 0,0.52645 0.1748,1.18831 0.38846,1.47078 0.56274,0.74401 0.57671,7.99102 0.0168,8.73125 -0.21366,0.28247 -0.39225,1.08287 -0.39688,1.77867 -0.006,0.87462 -0.13091,1.31207 -0.40529,1.41737 -0.21828,0.0838 -0.39687,0.37401 -0.39687,0.645 0,0.62771 -1.45901,3.31136 -3.03831,5.58855 -0.93449,1.34745 -3.34278,3.90693 -3.68132,3.91243 -0.13053,0.002 -0.74588,0.42058 -1.36744,0.9299 -0.62157,0.50933 -1.31844,0.92604 -1.54861,0.92604 -0.23017,0 -0.41849,0.1168 -0.41849,0.25955 0,0.14275 -0.29277,0.33302 -0.65061,0.42283 -0.35783,0.0898 -0.78913,0.33021 -0.95843,0.53421 -0.16931,0.204 -0.63771,0.37091 -1.04088,0.37091 -0.40752,0 -0.80068,0.17625 -0.88534,0.39688 -0.10277,0.26781 -0.52305,0.39687 -1.29236,0.39687 -0.62703,0 -1.39093,0.17573 -1.69757,0.3905 -0.42848,0.30012 -1.62083,0.40728 -5.1521,0.46302 l -4.59458,0.0725 -0.0849,0.66145 c -0.0467,0.36381 -0.2441,0.78566 -0.43874,0.93746 -0.19463,0.1518 -0.61072,0.76877 -0.92464,1.37104 -0.31392,0.60227 -0.74157,1.23679 -0.95033,1.41005 -0.20875,0.17325 -0.37955,0.58534 -0.37955,0.91575 0,0.33042 -0.17859,0.66929 -0.39687,0.75305 -0.21829,0.0838 -0.39688,0.32866 -0.39688,0.54421 0,0.21555 -0.32742,0.9039 -0.7276,1.52966 -1.2068,1.88705 -1.36551,2.16129 -1.76849,3.05597 -0.21303,0.47294 -0.4834,0.8599 -0.60082,0.8599 -0.11742,0 -0.38111,0.38695 -0.58597,0.85989 -0.4381,1.01143 -4.97957,5.75469 -5.50986,5.75469 -0.2002,0 -0.90976,0.41672 -1.5768,0.92604 -0.66704,0.50932 -1.41923,0.92604 -1.67153,0.92604 -0.25229,0 -0.60694,0.1786 -0.7881,0.39688 -0.18115,0.21828 -0.67572,0.39687 -1.09903,0.39687 -0.44006,0 -0.83487,0.16996 -0.92195,0.39688 -0.11074,0.28857 -0.564,0.39687 -1.66092,0.39687 -0.91688,0 -1.71007,0.15237 -2.02221,0.38846 -0.70606,0.53404 -5.27182,0.54024 -6.20213,0.008 z";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SupplierData {
  report_ref: string;
  generated_at: string;
  expires_at: string;
  organization_name: string;
  zaena_id: string;
  overall_score: number;
  tier: string;
  score_confidence: number;
  trajectory: string;
  dimensions: Record<string, number>;
  recording_integrity: { multiplier: number; live_rate_1h: number };
  metrics: {
    total_sales: number;
    days_active: number;
    recovery_rate_pct: number;
    avg_recovery_days: number;
    cash_collection_pct: number;
    supplier_payment_pct: number;
    void_rate_pct: number;
    whatsapp_receipt_pct: number;
  };
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const D = {
  paper: "#F5F0E8",
  paperDeep: "#EDE7D9",
  ink: "#1A1008",
  inkMid: "#3D2E1A",
  inkDim: "#7A6A52",
  inkGhost: "#B8A98C",
  teal: "#0E2931",
  gold: "#C9922A",
  green: "#1A6B4A",
  red: "#8B2020",
  rule: "#D4C9B0",
  ruleDark: "#B8A98C",
};
const TIER_COLORS: Record<string, string> = {
  unverified: "#7A6A52",
  bronze: "#8B5E2A",
  silver: "#5A6070",
  gold: D.gold,
  zaena_verified: D.green,
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
function scoreColor(v: number) {
  return v >= 75 ? D.green : v >= 50 ? D.gold : D.red;
}

// ─── Signal bar — key visual for supplier report ──────────────────────────────
function SignalBar({
  label,
  value,
  max = 100,
  highlight = false,
}: {
  label: string;
  value: number;
  max?: number;
  highlight?: boolean;
}) {
  const pct = Math.min(100, (value / max) * 100);
  const c = scoreColor(value);
  return (
    <View style={{ marginBottom: 14 }}>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginBottom: 5,
        }}
      >
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: highlight ? 10 : 9.5,
            color: highlight ? D.inkMid : D.inkDim,
            fontWeight: highlight ? "600" : ("400" as any),
          }}
        >
          {label}
        </Text>
        <Text
          style={{
            fontFamily: "DM Mono",
            fontSize: highlight ? 11 : 10,
            color: c,
            fontWeight: "600" as any,
          }}
        >
          {value.toFixed(1)}%
        </Text>
      </View>
      <View
        style={{
          height: highlight ? 5 : 3,
          backgroundColor: D.paperDeep,
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <View
          style={{
            width: `${pct}%`,
            height: "100%",
            backgroundColor: c,
            borderRadius: 3,
          }}
        />
      </View>
    </View>
  );
}

function DocRow({
  label,
  value,
  valueColor,
  last = false,
}: {
  label: string;
  value: string;
  valueColor?: string;
  last?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
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
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontFamily: "DM Mono",
          fontSize: 10,
          color: valueColor ?? D.inkMid,
          textAlign: "right",
        }}
      >
        {value}
      </Text>
    </View>
  );
}

function SectionHeader({ num, label }: { num: string; label: string }) {
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        marginTop: 22,
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
        {num}
      </Text>
      <Text
        style={{
          fontFamily: "DM Mono",
          fontSize: 8.5,
          color: D.inkDim,
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        {label}
      </Text>
    </View>
  );
}

// ─── PDF builder ──────────────────────────────────────────────────────────────
function buildSupplierHTML(r: SupplierData): string {
  const tc = TIER_COLORS[r.tier] ?? D.gold;
  const payScore = r.dimensions.payment_behaviour ?? 0;
  const sc = scoreColor(payScore);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
<style>
  * { margin:0;padding:0;box-sizing:border-box }
  body { font-family:Georgia,serif;background:#F5F0E8;color:#1A1008 }
  .page { max-width:680px;margin:0 auto;padding:44px 36px;background:#F5F0E8 }
  .top { display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px }
  .brand { font-size:9px;letter-spacing:3px;color:#B8A98C;font-family:monospace;margin-bottom:6px }
  .title { font-size:24px;color:#0E2931;line-height:1.3 }
  .dot { width:60px;height:60px;border-radius:50%;background:${tc};
    display:flex;align-items:center;justify-content:center;color:white;
    font-size:8px;letter-spacing:1px;font-family:monospace;text-align:center;line-height:1.5 }
  hr { border:none;border-top:1px solid #D4C9B0;margin:14px 0 }
  .hr-accent { border-top:2px solid ${tc};margin-bottom:0 }
  .meta { font-size:9px;color:#B8A98C;letter-spacing:2px;font-family:monospace;margin-bottom:3px }
  .org { font-size:20px;font-weight:600;color:#1A1008;margin-bottom:2px }
  .zid { font-size:9px;color:#7A6A52;font-family:monospace;letter-spacing:1.5px }
  .ref-grid { display:flex;justify-content:space-between;margin-top:14px;padding:12px 14px;background:#EDE7D9;border-radius:3px }
  .ref-item label { font-size:8px;color:#B8A98C;font-family:monospace;letter-spacing:1px;display:block;margin-bottom:2px }
  .ref-item span { font-size:9.5px;color:#3D2E1A;font-family:monospace }
  .section { background:white;margin-top:8px;padding:18px 22px;border-radius:3px }
  .sh { display:flex;align-items:center;margin-bottom:12px;padding-bottom:7px;border-bottom:1px solid #B8A98C }
  .sn { font-size:8px;color:#B8A98C;font-family:monospace;letter-spacing:1px;margin-right:10px }
  .sl { font-size:8.5px;color:#7A6A52;font-family:monospace;letter-spacing:2px;text-transform:uppercase }
  .hero { display:flex;justify-content:space-between;align-items:center;
    padding:16px;background:#EDE7D9;border-radius:4px;margin-bottom:14px }
  .pay-big { font-size:52px;font-weight:300;color:#1A1008;line-height:1 }
  .pay-lbl { font-size:8px;color:#B8A98C;font-family:monospace;letter-spacing:2px }
  .pay-sub { font-size:8px;color:#B8A98C;font-family:monospace;margin-top:4px }
  .pill { padding:4px 9px;border:1px solid ${tc}40;border-radius:2px;background:${tc}15;
    font-size:9px;color:${tc};font-family:monospace;letter-spacing:1.5px;display:inline-block;margin-bottom:6px }
  .rating { font-size:18px;font-weight:600;color:${sc} }
  .bar-row { margin-bottom:10px }
  .bar-labels { display:flex;justify-content:space-between;margin-bottom:4px }
  .bar-lbl { font-size:9.5px;color:#7A6A52;font-family:monospace }
  .bar-val { font-size:10px;font-weight:600 }
  .bar-track { height:4px;background:#E8E0D0;border-radius:2px }
  table { width:100%;border-collapse:collapse }
  td { padding:7px 0;font-size:11px;border-bottom:1px solid #EDE7D9;color:#3D2E1A }
  td:first-child { color:#7A6A52;font-family:monospace;font-size:9.5px }
  tr:last-child td { border-bottom:none }
  .disclaimer { margin-top:8px;padding:14px;background:#EDE7D9;border-top:2px solid ${tc};border-radius:3px }
  .db { font-size:8.5px;color:#7A6A52;font-family:monospace;letter-spacing:1.5px;margin-bottom:6px }
  .dt { font-size:8.5px;color:#B8A98C;font-family:monospace;line-height:1.7 }
  .dr { margin-top:8px;padding-top:8px;border-top:1px solid #D4C9B0;font-size:7.5px;color:#B8A98C;font-family:monospace;line-height:1.8 }
</style></head><body><div class="page">
  <div class="top">
    <div>
      <div class="brand">ZAENA TRUST INFRASTRUCTURE</div>
      <div class="title">Supplier Report</div>
    </div>
    <div class="dot">${r.tier.replace("_", " ").toUpperCase()}</div>
  </div>
  <hr class="hr-accent"/>
  <div style="padding:18px 0 0">
    <div class="meta">MERCHANT</div>
    <div class="org">${r.organization_name}</div>
    <div class="zid">${r.zaena_id}</div>
  </div>
  <div class="ref-grid">
    <div class="ref-item"><label>ISSUED</label><span>${fmtDate(r.generated_at)}</span></div>
    <div class="ref-item" style="text-align:center"><label>VALID UNTIL</label><span>${fmtDate(r.expires_at)}</span></div>
    <div class="ref-item" style="text-align:right"><label>AUDIENCE</label><span>SUPPLIERS</span></div>
  </div>

  <div class="section">
    <div class="sh"><span class="sn">01</span><span class="sl">Payment Behaviour Score</span></div>
    <div class="hero">
      <div>
        <div class="pay-lbl">PAYMENT BEHAVIOUR</div>
        <div class="pay-big">${payScore.toFixed(1)}</div>
        <div class="pay-sub">OUT OF 100</div>
      </div>
      <div style="text-align:right">
        <div class="pill">${r.tier.replace("_", " ").toUpperCase()}</div><br/>
        <div class="rating">${payScore >= 75 ? "RELIABLE" : payScore >= 50 ? "DEVELOPING" : "CAUTION"}</div>
        <div style="font-size:8px;color:#B8A98C;font-family:monospace;margin-top:3px">
          DATA CONFIDENCE: ${Math.min(100, Math.round(r.score_confidence * 100))}%
        </div>
      </div>
    </div>
  </div>

  <div class="section">
    <div class="sh"><span class="sn">02</span><span class="sl">Payment Signals</span></div>
    ${[
      { label: "Supplier Payment Rate", value: r.metrics.supplier_payment_pct },
      { label: "Cash Collection Rate", value: r.metrics.cash_collection_pct },
      { label: "Credit Recovery Rate", value: r.metrics.recovery_rate_pct },
    ]
      .map(({ label, value }) => {
        const c = scoreColor(value);
        return `<div class="bar-row">
        <div class="bar-labels">
          <span class="bar-lbl">${label}</span>
          <span class="bar-val" style="color:${c}">${value.toFixed(1)}%</span>
        </div>
        <div class="bar-track">
          <div style="width:${Math.min(100, value)}%;height:4px;background:${c};border-radius:2px"></div>
        </div>
      </div>`;
      })
      .join("")}
  </div>

  <div class="section">
    <div class="sh"><span class="sn">03</span><span class="sl">Settlement Details</span></div>
    <table>
      <tr><td>Avg. Credit Recovery Time</td><td style="text-align:right">${r.metrics.avg_recovery_days.toFixed(0)} days</td></tr>
      <tr><td>Total Transactions on Record</td><td style="text-align:right">${r.metrics.total_sales}</td></tr>
      <tr><td>Operational Days</td><td style="text-align:right">${r.metrics.days_active}</td></tr>
      <tr><td>Recording Integrity</td><td style="text-align:right">×${r.recording_integrity.multiplier.toFixed(2)}</td></tr>
      <tr><td>Live Recording Rate (1hr)</td><td style="text-align:right">${r.recording_integrity.live_rate_1h}%</td></tr>
    </table>
  </div>

  <div class="disclaimer">
    <div class="db">ZAENA TRUST INFRASTRUCTURE</div>
    <div class="dt">This report reflects recorded payment behaviour in the ZAENA ERP system and does not constitute a financial guarantee.</div>
    <div class="dr">REF: ${r.report_ref}<br/>VERIFY: zaena.app/verify/${r.report_ref}</div>
  </div>
</div></body></html>`;
}

// ─── States ───────────────────────────────────────────────────────────────────
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
      <Text
        style={{
          fontFamily: "DM Mono",
          fontSize: 9,
          color: D.inkGhost,
          letterSpacing: 2,
        }}
      >
        GENERATING REPORT…
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

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function SupplierReportScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { organizationId } = useAuthStore();

  const [report, setReport] = useState<SupplierData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const generate = useCallback(async () => {
    if (!organizationId) return;
    setLoading(true);
    setError(null);
    try {
      const { data, error: rpcErr } = await supabase.rpc(
        "generate_trust_report",
        {
          p_org_id: organizationId,
          p_report_type: "supplier",
          p_requester_type: "owner",
          p_requester_identifier: null,
        },
      );
      if (rpcErr) throw rpcErr;
      const raw = Array.isArray(data) ? data[0] : data;
      if (!raw) throw new Error("Empty response");
      setReport(raw as SupplierData);
    } catch (e: any) {
      setError(e?.message ?? "Failed to generate report");
    } finally {
      setLoading(false);
    }
  }, [organizationId]);

  useEffect(() => {
    generate();
  }, [generate]);

  const handleExport = useCallback(async () => {
    if (!report) return;
    setExporting(true);
    try {
      const html = buildSupplierHTML(report);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `Supplier Report — ${report.organization_name}`,
        UTI: "com.adobe.pdf",
      });
    } catch (e: any) {
      Alert.alert("Export Failed", e?.message ?? "Could not generate PDF");
    } finally {
      setExporting(false);
    }
  }, [report]);

  if (loading) return <LoadingState />;
  if (error || !report)
    return <ErrorState message={error ?? "Unknown error"} onRetry={generate} />;

  const tierColor = TIER_COLORS[report.tier] ?? D.gold;
  const payScore = report.dimensions.payment_behaviour ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: D.paperDeep }}>
      {/* Top bar */}
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
          SUPPLIER REPORT
        </Text>
        <TouchableOpacity
          onPress={handleExport}
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
            {exporting ? "…" : "EXPORT"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
      >
        {/* Document header */}
        <View
          style={{
            backgroundColor: D.paper,
            paddingHorizontal: 24,
            paddingTop: 24,
            paddingBottom: 18,
            borderBottomWidth: 2,
            borderBottomColor: tierColor,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              marginBottom: 16,
            }}
          >
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 9,
                  color: D.inkGhost,
                  letterSpacing: 3,
                  marginBottom: 4,
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
                }}
              >
                Supplier Report
              </Text>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8.5,
                  color: D.inkGhost,
                  marginTop: 3,
                  letterSpacing: 1,
                }}
              >
                PAYMENT BEHAVIOUR · SETTLEMENT RECORD
              </Text>
            </View>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: tierColor,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Svg width={30} height={30} viewBox="42.33 85.84 128 128">
                <Path d={Z} fill="#F5F0E8" fillOpacity={0.9} />
              </Svg>
            </View>
          </View>
          <View
            style={{
              height: StyleSheet.hairlineWidth,
              backgroundColor: D.ruleDark,
              marginBottom: 14,
            }}
          />
          <Text
            style={{
              fontFamily: "DM Mono",
              fontSize: 8,
              color: D.inkGhost,
              letterSpacing: 2,
              marginBottom: 3,
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
              fontSize: 9,
              color: D.inkDim,
              letterSpacing: 1.5,
            }}
          >
            {report.zaena_id}
          </Text>
          <View
            style={{
              marginTop: 12,
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
                  fontSize: 7.5,
                  color: D.inkGhost,
                  letterSpacing: 1,
                  marginBottom: 2,
                }}
              >
                ISSUED
              </Text>
              <Text
                style={{ fontFamily: "DM Mono", fontSize: 9, color: D.inkMid }}
              >
                {fmtDate(report.generated_at)}
              </Text>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 7.5,
                  color: D.inkGhost,
                  letterSpacing: 1,
                  marginBottom: 2,
                }}
              >
                VALID UNTIL
              </Text>
              <Text
                style={{ fontFamily: "DM Mono", fontSize: 9, color: D.inkMid }}
              >
                {fmtDate(report.expires_at)}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 7.5,
                  color: D.inkGhost,
                  letterSpacing: 1,
                  marginBottom: 2,
                }}
              >
                AUDIENCE
              </Text>
              <Text
                style={{ fontFamily: "DM Mono", fontSize: 9, color: tierColor }}
              >
                SUPPLIERS
              </Text>
            </View>
          </View>
        </View>

        {/* 01 Payment behaviour hero */}
        <View
          style={{
            backgroundColor: D.paper,
            marginTop: 6,
            paddingHorizontal: 24,
            paddingBottom: 18,
          }}
        >
          <SectionHeader num="01" label="Payment Behaviour Score" />
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              padding: 14,
              backgroundColor: D.paperDeep,
              borderRadius: 4,
              marginBottom: 4,
            }}
          >
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8,
                  color: D.inkGhost,
                  letterSpacing: 2,
                  marginBottom: 2,
                }}
              >
                PAYMENT BEHAVIOUR
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
                {payScore.toFixed(1)}
              </Text>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 7.5,
                  color: D.inkGhost,
                }}
              >
                OUT OF 100
              </Text>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <View
                style={{
                  paddingHorizontal: 9,
                  paddingVertical: 4,
                  backgroundColor: `${tierColor}15`,
                  borderWidth: 1,
                  borderColor: `${tierColor}40`,
                  borderRadius: 2,
                  marginBottom: 6,
                }}
              >
                <Text
                  style={{
                    fontFamily: "DM Mono",
                    fontSize: 8.5,
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
                  fontSize: 18,
                  fontWeight: "600",
                  color: scoreColor(payScore),
                }}
              >
                {payScore >= 75
                  ? "RELIABLE"
                  : payScore >= 50
                    ? "DEVELOPING"
                    : "CAUTION"}
              </Text>
              <Text
                style={{
                  fontFamily: "DM Mono",
                  fontSize: 8,
                  color: D.inkGhost,
                  marginTop: 4,
                }}
              >
                CONFIDENCE:{" "}
                {Math.min(100, Math.round(report.score_confidence * 100))}%
              </Text>
            </View>
          </View>
        </View>

        {/* 02 Payment signals */}
        <View
          style={{
            backgroundColor: D.paper,
            marginTop: 6,
            paddingHorizontal: 24,
            paddingBottom: 18,
          }}
        >
          <SectionHeader num="02" label="Payment Signals" />
          <SignalBar
            label="Supplier Payment Rate"
            value={report.metrics.supplier_payment_pct}
            highlight
          />
          <SignalBar
            label="Cash Collection Rate"
            value={report.metrics.cash_collection_pct}
          />
          <SignalBar
            label="Credit Recovery Rate"
            value={report.metrics.recovery_rate_pct}
          />
        </View>

        {/* 03 Settlement details */}
        <View
          style={{
            backgroundColor: D.paper,
            marginTop: 6,
            paddingHorizontal: 24,
            paddingBottom: 18,
          }}
        >
          <SectionHeader num="03" label="Settlement Details" />
          <DocRow
            label="Avg. Credit Recovery Time"
            value={`${report.metrics.avg_recovery_days.toFixed(0)} days`}
          />
          <DocRow
            label="Total Transactions on Record"
            value={String(report.metrics.total_sales)}
          />
          <DocRow
            label="Operational Days"
            value={String(report.metrics.days_active)}
          />
          <DocRow
            label="Recording Integrity"
            value={`×${report.recording_integrity.multiplier.toFixed(2)}`}
          />
          <DocRow
            label="Live Recording Rate (1hr)"
            value={`${report.recording_integrity.live_rate_1h}%`}
            last
          />
        </View>

        {/* Disclaimer */}
        <View
          style={{
            marginTop: 6,
            marginHorizontal: 24,
            padding: 14,
            backgroundColor: D.paperDeep,
            borderTopWidth: 2,
            borderTopColor: tierColor,
            borderRadius: 3,
          }}
        >
          <Text
            style={{
              fontFamily: "DM Mono",
              fontSize: 8,
              color: D.inkDim,
              letterSpacing: 1.5,
              marginBottom: 6,
            }}
          >
            ZAENA TRUST INFRASTRUCTURE
          </Text>
          <Text
            style={{
              fontFamily: "DM Mono",
              fontSize: 8,
              color: D.inkGhost,
              lineHeight: 15,
            }}
          >
            This report reflects recorded payment behaviour in the ZAENA ERP
            system and does not constitute a financial guarantee.
          </Text>
          <View
            style={{
              marginTop: 8,
              paddingTop: 8,
              borderTopWidth: StyleSheet.hairlineWidth,
              borderTopColor: D.rule,
            }}
          >
            <Text
              style={{
                fontFamily: "DM Mono",
                fontSize: 7.5,
                color: D.inkGhost,
              }}
            >
              REF: {report.report_ref}
            </Text>
            <Text
              style={{
                fontFamily: "DM Mono",
                fontSize: 7.5,
                color: D.inkGhost,
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
