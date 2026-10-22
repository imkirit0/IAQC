"use client";
import { Icon } from "./Icon";

export const PrintButton = ({ label = "Print" }: { label?: string }) =>
  <button type="button" className="btn no-print" onClick={() => window.print()}><Icon name="print" />{label}</button>;
