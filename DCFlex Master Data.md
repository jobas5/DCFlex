# DCFlex Master Data — UI Design Prompt

## Overview

Design a high-fidelity **enterprise data-center configuration dashboard** for **DCFlex — Cooling Optimizer · Digital Twin**.

The page is called **Master Data**.

Its purpose is to provide engineers and administrators with a simple interface to configure the operational targets and resource budgets used by the DCFlex optimization, cooling transfer, and validation engines.

The page should allow users to maintain:

- Zone-level PUE targets
- Zone-level WUE targets
- Zone-level water budgets
- Zone-level power budgets
- Facility-wide water budget
- Facility-wide power budget

The interface should be simple and operationally focused. Unlike the Optimization and Shadow Validation pages, this screen is primarily a **configuration / administration interface**.

The visual language must remain consistent with the rest of DCFlex.

---

# Visual Design

## Overall Style

Use a premium dark-mode enterprise dashboard.

Characteristics:

- Deep navy / near-black background
- Dark navy configuration panels
- Thin blue-gray borders
- Cyan as the primary interaction color
- White and cool-gray typography
- Green for healthy system status
- Minimal visual decoration
- Compact enterprise form layout
- Clear input hierarchy
- Technical and operational appearance

The page should feel like a:

**Data-center infrastructure configuration console**

rather than a generic web form.

Avoid:

- Large illustrations
- Excessive charts
- Decorative dashboard widgets
- Bright backgrounds
- Excessive animations
- Unnecessary complexity

---

# Layout

Use a **16:9 desktop dashboard layout**.

Structure:

1. Fixed left navigation sidebar
2. Top system status bar
3. Page header
4. Zone Targets & Budgets panel
5. Facility Budgets panel
6. Large clean empty space below the configuration panels

The page intentionally contains fewer elements than the Optimization and Shadow Validation screens.

---

# 1. Left Navigation Sidebar

Create a fixed vertical sidebar approximately **210–225 px wide**.

## Brand

At the top:

**DCFlex**

Subtitle:

**Cooling Optimizer · Digital Twin**

Add a small cyan snowflake / cooling-system icon.

---

## Navigation Items

Display:

- Overview
- Optimization
- Shadow Validation
- Cooling Transfer
- Surrogate Model
- **Master Data** — active

Use simple technical line icons.

### Active State

Master Data should have:

- Cyan database icon
- Cyan text
- Dark cyan-blue background
- Rounded rectangular highlight
- Subtle cyan glow

---

# 2. Sidebar Bottom Status

At the bottom-left, add a compact status card.

Title:

**Simulated telemetry**

Description:

**Digital twin stands in for physical BMS/DCU hardware  
(BACnet · Modbus · MQTT).**

Status:

**● Live**

Use green for the Live indicator.

The card should be visually consistent with the other DCFlex pages.

---

# 3. Top Status Bar

Create a thin horizontal top status bar across the main content.

## Left Side

Primary outlined control:

**▷ Play**

Next:

**Sim 02:40:00 WIB**

Then:

**updated 0s ago**

Then:

**4 zones**

Then:

**● all nominal**

Use green for the all-nominal indicator.

---

# 4. Page Header

Main title:

## Master Data

Subtitle:

**Zone targets & budgets, plus facility-wide water and power budgets**

Keep the subtitle small and muted.

The header should have generous spacing before the first configuration panel.

---

# 5. Zone Targets & Budgets Panel

Create the first large configuration card.

Title:

## ZONE TARGETS & BUDGETS

Use uppercase section styling.

The panel should contain:

1. Zone selector
2. Target PUE input
3. Target WUE input
4. Water budget input
5. Power budget input
6. Save zone button

---

# 6. Zone Selector

At the top of the panel, create a horizontal segmented selector:

- **Zone A** — selected
- Zone B
- Zone C
- Zone D

The selected zone should use:

- Cyan border
- Cyan text
- Dark cyan background
- Subtle glow

Unselected zones should use:

- Dark navy background
- Thin blue-gray border
- White / muted text

When a zone is selected, its corresponding target and budget values should populate the input fields.

---

# 7. Zone Configuration Fields

Create four horizontally aligned input fields.

Use consistent input heights and spacing.

---

## Target PUE

Label:

**Target PUE**

Input value:

**1.13**

Use a dark navy input background with a subtle border.

Allow numeric decimal input.

---

## Target WUE

Label:

**Target WUE**

Input value:

**0.115**

Use the same input styling.

Allow numeric decimal input.

---

## Water Budget

Label:

**Water budget (L/min)**

Input value:

**1400**

Allow numeric input.

The unit should remain visible in the field label.

---

## Power Budget

Label:

**Power budget (MW)**

Input value:

**1.2**

Allow numeric input.

---

# 8. Save Zone Button

Below the zone input fields, aligned to the left, create a primary button:

**Save zone**

Use:

- Cyan background
- Dark text
- Compact size
- Rounded corners
- Subtle hover glow

The button should clearly indicate that the four zone-level values are saved together.

---

# 9. Facility Budgets Panel

Below the Zone Targets & Budgets panel, create a second large configuration card.

Title:

## FACILITY BUDGETS

This section controls facility-wide resource limits.

Create two horizontally aligned input fields.

---

# 10. Total Water Budget

Label:

**Total water (L/min)**

Input value:

**4400**

Use the same dark input styling as the zone configuration.

---

# 11. Total Power Budget

Label:

**Total power (MW)**

Input value:

**3.6**

Use the same styling.

---

# 12. Save Facility Button

Below the inputs, aligned to the left:

**Save facility**

Use the same primary cyan button style as **Save zone**.

---

# Configuration Logic

The Master Data screen should function as the centralized configuration source for DCFlex.

## Zone-Level Configuration

Each zone maintains:

- Target PUE
- Target WUE
- Water budget
- Power budget

Zones:

- Zone A
- Zone B
- Zone C
- Zone D

Selecting a zone should load its stored configuration.

---

## Facility-Level Configuration

The facility maintains:

- Total water budget
- Total power budget

These values represent the overall resource constraints for the complete facility.

---

# Validation Rules

The interface should validate all entered values before saving.

## Target PUE

Must be:

- Numeric
- Positive
- Within a reasonable operational range

Reject invalid or negative values.

---

## Target WUE

Must be:

- Numeric
- Positive
- Within a reasonable operational range

Reject invalid or negative values.

---

## Water Budget

Must be:

- Numeric
- Positive
- Greater than or equal to the zone's required minimum flow

---

## Power Budget

Must be:

- Numeric
- Positive
- Within facility capacity

---

## Facility Budget

The sum of zone budgets should not exceed the facility-wide budget.

For example:

**Σ Zone Water Budgets ≤ Total Water Budget**

**Σ Zone Power Budgets ≤ Total Power Budget**

If a zone configuration causes the total to exceed the facility budget, display a clear validation warning and prevent saving.

---

# Interaction Behavior

## Zone Selection

When the user clicks:

**Zone A / Zone B / Zone C / Zone D**

Load that zone's current configuration.

The selected zone should remain highlighted.

---

## Save Zone

When **Save zone** is clicked:

1. Validate all four fields.
2. Check against facility-level constraints.
3. Save the configuration.
4. Show a subtle success confirmation.
5. Keep the user on the same page.

Example success state:

**✓ Zone configuration saved**

Use green.

---

## Save Facility

When **Save facility** is clicked:

1. Validate total water budget.
2. Validate total power budget.
3. Compare facility budgets against zone allocations.
4. Save if valid.
5. Show confirmation.

Example:

**✓ Facility budget saved**

---

# Input Design

Inputs should have:

- Dark navy background
- Thin blue-gray border
- Small corner radius
- White numeric values
- Muted labels
- Cyan focus state
- Clear keyboard/numeric input behavior

On focus:

- Border changes to cyan
- Subtle cyan glow
- Preserve dark background

Avoid oversized input fields.

---

# Responsive Behavior

The primary target is desktop / control-room use.

At smaller widths:

- Sidebar becomes collapsible
- Zone selector remains horizontally scrollable if necessary
- Zone input fields should transition from four columns to a 2×2 grid
- Facility inputs should stack vertically
- Save buttons remain directly beneath their corresponding section

Maintain clear grouping between zone-level and facility-level configuration.

---

# Design System

## Typography

Use:

- Inter
- Geist
- IBM Plex Sans

Recommended hierarchy:

Page title:
Large / bold

Section title:
Medium / semibold / uppercase

Field label:
Small / medium

Input value:
Medium / regular

Supporting text:
Small / muted

---

# Semantic Colors

## Primary

Cyan / electric blue

Used for:

- Active navigation
- Selected zone
- Focused input
- Primary buttons
- Technical highlights

## Success

Green

Used for:

- Live status
- Saved confirmation
- Valid configuration

## Warning

Amber / yellow

Used for:

- Budget conflicts
- Validation warnings
- Approaching limits

## Error

Red

Used for:

- Invalid input
- Exceeded facility budget
- Unsafe configuration

## Neutral

Cool gray

Used for:

- Supporting labels
- Disabled states
- Secondary information

---

# Card Design

Use:

- Dark navy background
- 1 px subtle border
- 10–14 px corner radius
- Consistent internal padding
- Minimal shadow
- Very subtle technical glow

The two configuration cards should feel like part of the same system.

---

# Information Hierarchy

The page should communicate the following structure immediately:

**Master Data**

↓

**Zone Targets & Budgets**

Configure the operational target and resource limits for each zone.

↓

**Facility Budgets**

Configure the total resource limits for the entire facility.

The user should immediately understand:

**What each zone is allowed to consume → What the entire facility is allowed to consume → What limits the optimization engine must respect.**

---

# Integration With DCFlex

Master Data values should become the source of truth for:

### Optimization

Used to constrain the What-If Engine.

### Cooling Transfer

Used to enforce power and water transfer limits.

### Shadow Validation

Used to validate whether recommended setpoints remain within approved budgets.

### Surrogate Model

Used as physical / operational guardrails.

### Closed-loop Control

Used as hard limits that cannot be exceeded during automated control.

---

# Overall UX Principle

The Master Data screen should be intentionally simple.

Its purpose is not to provide analytics.

Its purpose is to provide a **single, reliable source of operational targets and resource constraints** for the entire DCFlex system.

The core story should be:

**Configure zone targets → Configure zone budgets → Configure facility budgets → Save → DCFlex uses these values as operational guardrails.**

The final visual impression should be:

**Simple + controlled + centralized + reliable + enterprise-grade configuration.**