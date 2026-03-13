// FILE: components/ReceiptImageCapture.tsx

import React, {
  forwardRef,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { StyleSheet, View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { InvoiceData } from "../lib/invoices/core";
import ReceiptCard from "./ReceiptCard";

export interface OrgDetails {
  name: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface ReceiptImageCaptureHandle {
  capture: (data: InvoiceData, org: OrgDetails) => Promise<string | null>;
}

export const ReceiptImageCapture = forwardRef<ReceiptImageCaptureHandle>(
  function ReceiptImageCapture(_props, ref) {
    const viewRef = useRef<View>(null);
    const [invoiceData, setInvoiceData] = useState<InvoiceData | null>(null);
    const [org, setOrg] = useState<OrgDetails>({ name: "" });
    const resolversRef = useRef<((uri: string | null) => void)[]>([]);

    useImperativeHandle(ref, () => ({
      capture: (data: InvoiceData, orgDetails: OrgDetails) => {
        return new Promise<string | null>((resolve) => {
          resolversRef.current.push(resolve);
          setInvoiceData(data);
          setOrg(orgDetails);
        });
      },
    }));

    async function handleLayout() {
      if (resolversRef.current.length === 0) return;
      if (!viewRef.current) {
        resolversRef.current.splice(0).forEach((r) => r(null));
        return;
      }

      // Wait for RN to finish painting all children
      await new Promise((r) => setTimeout(r, 300));

      try {
        const uri = await captureRef(viewRef, {
          format: "jpg",
          quality: 0.95,
          result: "tmpfile",
        });
        resolversRef.current.splice(0).forEach((r) => r(uri));
      } catch (err) {
        console.error("ReceiptImageCapture: snapshot failed:", err);
        resolversRef.current.splice(0).forEach((r) => r(null));
      }
    }

    if (!invoiceData) return null;

    return (
      <View style={styles.offscreen} pointerEvents="none">
        <View
          ref={viewRef}
          collapsable={false}
          onLayout={handleLayout}
          style={styles.cardWrapper}
        >
          <ReceiptCard
            data={invoiceData}
            orgName={org.name}
            orgPhone={org.phone}
            orgEmail={org.email}
            orgAddress={org.address}
          />
        </View>
      </View>
    );
  },
);

const styles = StyleSheet.create({
  offscreen: {
    position: "absolute",
    left: -9999,
    top: 0,
    width: 380,
    zIndex: -1,
    overflow: "visible",
  },
  cardWrapper: {
    width: 380,
    backgroundColor: "#ffffff",
  },
});
