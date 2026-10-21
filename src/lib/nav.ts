import {
  ArrowLeftRight,
  Box,
  BrainCircuit,
  Database,
  FlaskConical,
  LayoutDashboard,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  to: "/" | "/facility" | "/optimize" | "/shadow" | "/transfer" | "/model" | "/master";
  label: string;
  /** Label for the mobile bottom bar. */
  short: string;
  icon: LucideIcon;
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Monitor",
    items: [
      { to: "/", label: "Overview", short: "Overview", icon: LayoutDashboard },
      { to: "/facility", label: "Facility 3D", short: "3D", icon: Box },
    ],
  },
  {
    label: "Optimize",
    items: [
      { to: "/optimize", label: "Optimization", short: "Optimize", icon: FlaskConical },
      { to: "/shadow", label: "Shadow Validation", short: "Shadow", icon: ShieldCheck },
      { to: "/transfer", label: "Cooling Transfer", short: "Transfer", icon: ArrowLeftRight },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/model", label: "Surrogate Model", short: "Model", icon: BrainCircuit },
      { to: "/master", label: "Master Data", short: "Config", icon: Database },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);
