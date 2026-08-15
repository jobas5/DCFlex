# DCFlex Shadow Validation — UI Design Prompt

## Overview

Design a high-fidelity **enterprise data-center digital twin dashboard** for **DCFlex — Cooling Optimizer Digital Twin**.

The page is called **Shadow Validation**.

Its purpose is to validate an optimized cooling scenario against live digital-twin telemetry **before enabling closed-loop control on the real cooling engine**.

The interface represents a controlled operational workflow:

**Analyze → Shadow → Validate → Closed-loop**

The user must be able to:

- Select a data-center zone
- Run a virtual simulation
- Compare actual PUE/WUE against target values
- Monitor simulation progress
- Review latest telemetry readings
- Adjust cooling setpoints
- Verify system constraints
- Confirm stability
- Pass a validation gate
- Enable closed-loop control only after all criteria pass

The experience should feel like a **mission-critical industrial control system**, combining:

- Data-center infrastructure monitoring
- Digital twin simulation
- AI optimization
- Cooling control
- Real-time telemetry
- Safety validation
- Closed-loop automation

The design must strongly communicate **risk-free testing before real-world execution**.

---

# Visual Design

## Overall Style

Use a premium dark-mode enterprise interface consistent with the existing DCFlex Optimization dashboard.

Visual characteristics:

- Deep navy / near-black background
- Slightly lighter navy cards
- Thin blue-gray borders
- Cyan as the primary interaction color
- Green for healthy / passed / target states
- Red only for critical or failed states
- Yellow/orange for attention states
- White and cool-gray typography
- Subtle cyan technical glow
- Dense but organized information
- Precise technical layout
- Minimal decorative elements

Visual references:

- Data-center control room
- SCADA interface
- Digital twin platform
- Industrial automation system
- Cooling plant control interface
- Mission-critical infrastructure dashboard

Avoid:

- Consumer dashboard aesthetics
- Large decorative graphics
- Excessive gradients
- Excessive rounded cards
- Unnecessary animations
- Overly colorful UI

The interface should feel **safe, precise, technical, trustworthy, and operationally mature**.

---

# Layout

Use a **16:9 desktop dashboard layout**.

Overall structure:

1. Fixed left sidebar
2. Top system status bar
3. Page header
4. Validation workflow indicator
5. Zone selector
6. Simulation mode selector
7. Virtual Simulation panel
8. PUE/WUE trend charts
9. Latest readings table
10. Setpoint Control panel
11. Validation Gate
12. Closed-loop Real Engine panel
13. Bottom safety statement

Use a vertically scrolling main content area if required, while keeping the left sidebar fixed.

---

# 1. Left Navigation Sidebar

Create a fixed vertical sidebar approximately **150–175 px wide**.

## Brand

At the top:

**DCFlex**

Subtitle:

**Cooling Optimizer**  
**Digital Twin**

Add a small cyan snowflake / cooling-system icon.

---

## Navigation

Display:

- Overview
- Optimization
- **Shadow Validation** — active
- Cooling Transfer
- Surrogate Model
- Master Data

Use compact technical line icons.

### Active State

Shadow Validation should have:

- Cyan shield icon
- Cyan text
- Dark cyan-blue background
- Rounded rectangular highlight
- Subtle cyan glow

---

## Sidebar Bottom Status

Create a compact status card at the bottom.

Title:

**Simulated telemetry**

Description:

**Digital twin stands in for physical BMS/DCU hardware  
(BACnet • Modbus • MQTT).**

Status:

**● Live**

Use green for Live.

---

# 2. Top Status Bar

Create a thin horizontal status bar.

## Left Side

Primary control button:

**◫ Pause**

The button indicates that the simulation is currently running.

Next:

**Sim 02:20:00 WIB**

Then:

**updated 0s ago**

Then:

**4 zones**

Then:

**● all nominal**

Use green for the all-nominal indicator.

---

## Right Side

Add:

- Settings / brightness icon
- Theme icon
- Time-range selector

Time selector:

**▣ Last 1 hour ▾**

Use compact dark controls with subtle borders.

---

# 3. Page Header

Main title:

## Shadow Validation

Subtitle:

**Validate a recommended scenario before enabling closed-loop control**

Keep the subtitle small and muted.

---

# 4. Validation Workflow Indicator

Directly below the page header, create a horizontal workflow stepper:

**✓ Analyze → ✓ Shadow → Validate → ✓ Closed-loop**

The current step should be:

**Validate**

Highlight it with a cyan background/border.

Completed steps:

- Green check
- Green text

Future / inactive steps:

- Muted gray

The workflow should clearly communicate that the system is currently between simulation and real closed-loop control.

---

# 5. Zone Selector

Below the workflow, create a horizontal zone selector:

- **Zone A** — selected
- Zone B
- Zone C
- Zone D

Selected state:

- Cyan border
- Cyan text
- Dark cyan background

Unselected zones:

- Dark navy
- Gray border
- White/gray text

---

# 6. Simulation Mode Selector

On the right side of the zone selector, create a two-option segmented control:

### Virtual Simulation

Selected.

### Closed-loop (Real)

Not selected.

The selected **Virtual Simulation** mode should use:

- Cyan border
- Cyan text
- Dark cyan background

The Closed-loop option should remain visually secondary because validation has not yet passed.

---

# 7. Virtual Simulation Panel

Create a large primary panel titled:

## 1 — VIRTUAL SIMULATION

Supporting label:

**(Shadow Mode)**

Add a small information icon.

The panel should represent a simulation running in parallel with the real system without affecting production.

---

# 8. Simulation Status Row

At the top of the Virtual Simulation panel, create a compact status row.

Status badge:

**Running**

Use green.

Next information:

**Started 02:00:00 WIB**

Then:

**Duration 00:20:00**

Then:

**55 samples · 7-day window**

On the far right:

### Speed

Create a segmented control:

- 0.5x
- **1x** — selected
- 2x
- 5x
- 10x

The 1x button should have a cyan selected state.

---

# 9. PUE Trend Chart

Create a large chart on the left side titled:

## PUE — Current vs Target

Unit context:

PUE

Legend:

- Cyan line — **Actual PUE**
- Green dashed line — **Target PUE**

### Chart

Display a time-series line chart.

X-axis:

**01:40 → 01:50 → 02:00 → 02:10 → 02:20**

Y-axis:

- 0.80
- 0.90
- 1.00
- 1.10
- 1.20
- 1.30

Actual PUE should be represented by a cyan line.

The line should begin around:

**1.20**

Then gradually decline, with a noticeable step down around 01:55–02:00, followed by small oscillations and stabilization around 1.11–1.12.

Target PUE should be a horizontal green dashed line around:

**1.072**

At the right side of the chart, show:

**Current**  
**1.116**

and:

**Target**  
**1.072**

Use cyan for Current and green for Target.

---

# 10. WUE Trend Chart

Create a matching chart on the right titled:

## WUE — Current vs Target (L/kWh)

Legend:

- Green/cyan line — **Actual WUE**
- Green dashed line — **Target WUE**

X-axis:

**01:40 → 01:50 → 02:00 → 02:10 → 02:20**

Y-axis:

- 0.00
- 0.05
- 0.10
- 0.15
- 0.20
- 0.25
- 0.30

Actual WUE should gradually increase from approximately:

**0.145**

toward:

**0.213**

Target WUE:

**0.231**

At the right side:

**Current**  
**0.213**

**Target**  
**0.231**

Use the same semantic visual treatment as the PUE chart.

---

# 11. PUE / WUE Summary Metrics

Below the charts, create two compact metric groups.

## PUE

Three columns:

### Feasible

**100%**

### Meet target ±0.02

**92%**

### Avg PUE gap

**−0.007**

---

## WUE

Three columns:

### In budget

**55 / 55**

### Avg WUE gap

**−0.018 L/kWh**

### Water budget

**100%**

Use green for successful / feasible values.

---

# 12. Latest Readings Table

Below the summary metrics, create a table titled:

## LATEST READINGS

Columns:

- TIME
- PRED PUE
- ACTUAL PUE
- PRED WUE
- ACTUAL WUE
- CHIP
- STATUS

Create four visible rows.

### Row 1

Time:

**02:20:00**

Pred PUE:

**1.0740**

Actual PUE:

**1.0768**

Pred WUE:

**0.213**

Actual WUE:

**0.214**

Chip:

**70.6°C**

Status:

**feasible · on target**

---

### Row 2

**02:19:00**

Pred PUE:

**1.0753**

Actual PUE:

**1.0781**

Pred WUE:

**0.214**

Actual WUE:

**0.215**

Chip:

**71.1°C**

Status:

**feasible · on target**

---

### Row 3

**02:18:00**

Pred PUE:

**1.0765**

Actual PUE:

**1.0792**

Pred WUE:

**0.215**

Actual WUE:

**0.216**

Chip:

**71.1°C**

Status:

**feasible · on target**

---

### Row 4

**02:17:00**

Pred PUE:

**1.0778**

Actual PUE:

**1.0804**

Pred WUE:

**0.217**

Actual WUE:

**0.218**

Chip:

**71.4°C**

Status:

**feasible · on target**

---

Use:

- Cyan for predicted PUE
- Green for predicted WUE
- White/gray for actual readings
- Green status badges
- Very subtle row separators

At the bottom center:

**View full data ↓**

---

# 13. Setpoint Control Panel

Below Virtual Simulation, create a large panel titled:

## 2 — SETPOINT CONTROL

Supporting label:

**(Slew Limited)**

Add an information icon.

On the right side create:

### Control Mode

Two-option segmented control:

- **Auto (Recommended)** — selected
- Manual

Auto mode should use cyan.

---

# 14. Setpoint Cards

Create four equal-width control cards.

Each card should display:

1. Parameter name
2. Unit
3. Current value
4. Target value
5. Slider
6. Minimum / maximum range
7. Rate limit
8. Status

Use a technical instrumentation / control-system aesthetic.

---

# 15. Coolant Supply Temperature

Title:

**Coolant Supply Temp**

Unit:

**°C**

Current:

**18.2**

Target:

**16.0**

Use cyan for Current and white for Target.

Slider range:

**14.0 — 22.0**

Show the target point around 16.0.

Below:

**Rate limit**  
**0.3 °C / min**

Status:

**Tracking**

Use green.

---

# 16. Pump Speed

Title:

**Pump Speed**

Unit:

**%**

Current:

**78**

Target:

**62**

Slider range:

**30 — 100**

Target around 62.

Below:

**Rate limit**  
**2 % / min**

Status:

**Tracking**

Use green.

---

# 17. Bypass Valve Position

Title:

**Bypass Valve Position**

Unit:

**%**

Current:

**35**

Target:

**18**

Slider range:

**0 — 100**

Target around 18.

Below:

**Rate limit**  
**1 % / min**

Status:

**Tracking**

Use green.

---

# 18. CDU Supply Temperature

Title:

**CDU Supply Temp**

Unit:

**°C**

Current:

**17.6**

Target:

**15.5**

Slider range:

**12.0 — 22.0**

Target around 15.5.

Below:

**Rate limit**  
**0.2 °C / min**

Status:

**Tracking**

Use green.

---

# 19. Setpoint Legend

At the bottom of the Setpoint Control panel:

**Blue = Current**

**Green = Target**

**Dotted line = Auto trajectory (slew limited)**

Use small visual indicators matching each color.

---

# 20. Validation Gate

Create a large panel titled:

## VALIDATION GATE

Add a shield/check icon.

Description:

**Validation ensures the scenario is safe and effective before enabling closed-loop.**

At the upper-right:

**All criteria**

Badge:

**Passed**

Use a green status badge.

---

# 21. Validation Criteria

Create four horizontally aligned validation checks.

---

## PUE Target

Green check icon.

Title:

**PUE Target**

Description:

**Within ±0.02**

---

## WUE Target

Green check icon.

Title:

**WUE Target**

Description:

**Within budget**

---

## System Constraints

Green check icon.

Title:

**System Constraints**

Description:

**All within limits**

---

## Stability

Green check icon.

Title:

**Stability**

Description:

**No oscillation detected**

All four should visibly communicate a passed state.

---

# 22. Proceed Button

At the right side of the Validation Gate, create a secondary action:

**Proceed to Closed-loop**

The button should be enabled because all criteria have passed.

Use a subtle cyan/blue outline.

Do not make this visually stronger than the final Closed-loop activation button.

---

# 23. Closed-loop Real Engine Panel

Below Validation Gate, create a final large panel titled:

## 3 — CLOSED-LOOP

Supporting label:

**(Real Engine)**

Information icon.

Description:

**Apply validated setpoints to the real engine.**

This section represents the final transition from simulation to real-world control.

---

# 24. Closed-loop Safety Features

Create three horizontally aligned feature blocks.

---

## Safe Apply

Icon:

Shield / protected execution

Title:

**Safe Apply**

Description:

**Gradual execution with protection rules.**

Use cyan.

---

## Continuous Monitor

Icon:

Real-time waveform / monitoring

Title:

**Continuous Monitor**

Description:

**Real-time monitoring & auto rollback.**

Use cyan.

---

## Auto Rollback

Icon:

Circular rollback arrow

Title:

**Auto Rollback**

Description:

**Revert if any constraint is violated.**

Use cyan.

---

# 25. Enable Closed-loop Button

On the right side of the Closed-loop panel, create the primary action:

**▷ Enable Closed-loop**

Use:

- Cyan border
- Cyan text
- Dark navy interior
- Large button size
- Shield/play icon

This should be the strongest action on the page, but still visually controlled rather than aggressive.

---

# 26. Readiness Indicator

Below the button, create a small readiness card.

Title:

**Readiness**

Status:

**● System ready to enable**

Use green.

The readiness state should only appear when all validation criteria have passed.

---

# 27. Safety / Constraint Footer

At the very bottom of the page, center:

**All simulations respect guardrails, capacity limits, and slew-rate constraints.**

Use small muted-gray typography.

---

# Interaction Logic

The Shadow Validation page represents a gated operational workflow.

## Step 1 — Analyze

The recommendation comes from the Optimization engine.

The user reviews:

- Best objective
- PUE improvement
- WUE improvement
- Resource rebalance
- Zone targets

---

## Step 2 — Shadow

Run the recommendation against the digital twin without affecting production.

Show:

- Simulation status
- Historical trend
- Current vs target
- Predicted vs actual
- Feasibility
- Budget compliance

---

## Step 3 — Validate

Check:

- PUE target
- WUE target
- System constraints
- Stability

All criteria must pass before closed-loop activation.

---

## Step 4 — Closed-loop

Only after validation succeeds:

- Enable the real engine
- Apply setpoints gradually
- Monitor continuously
- Automatically rollback if constraints are violated

---

# Dynamic Simulation Behavior

## Simulation Status

The interface should support:

- Running
- Paused
- Completed
- Failed

The current example is:

**Running**

---

## Simulation Speed

Allow:

- 0.5x
- 1x
- 2x
- 5x
- 10x

Changing speed should affect only the simulation playback speed, not the underlying scenario results.

---

# Chart Behavior

The PUE and WUE charts should update continuously during simulation.

The user should be able to visually compare:

**Actual → Target**

and understand whether the system is converging toward the recommended scenario.

If the actual value deviates significantly from target:

- Highlight the deviation
- Update feasibility
- Update validation status
- Potentially prevent closed-loop activation

---

# Setpoint Behavior

When Auto mode is selected:

- Target values come from the optimized scenario
- Current values update from telemetry
- Dotted trajectory represents the slew-limited path
- Controls should visually show whether the system is Tracking

When Manual mode is selected:

- User can adjust target values
- Slew-rate limits must still apply
- Safety constraints must remain active
- Validation must rerun after manual changes

---

# Validation Logic

The Validation Gate should dynamically evaluate:

### PUE Target

Pass if actual PUE is within:

**±0.02**

of target.

### WUE Target

Pass if WUE remains:

**Within budget**

### System Constraints

Pass only if:

- Power limits are respected
- Water limits are respected
- Temperature limits are respected
- Slew-rate limits are respected

### Stability

Pass only if:

- No oscillation is detected
- Setpoints converge
- System remains within safe operating range

---

# Closed-loop Safety Logic

The system must not allow uncontrolled activation.

Before enabling closed-loop:

1. Shadow simulation must complete sufficiently.
2. PUE target must pass.
3. WUE target must pass.
4. System constraints must pass.
5. Stability must pass.
6. Readiness must become **System ready to enable**.

After activation:

- Apply changes gradually
- Monitor continuously
- Detect constraint violations
- Trigger automatic rollback when necessary

---

# Design System

## Typography

Use a modern technical sans-serif:

- Inter
- Geist
- IBM Plex Sans

Prioritize numerical readability.

### Hierarchy

Page title:
Large / bold

Section title:
Medium / semibold

Metric values:
Large / bold

Labels:
Small / medium

Supporting text:
Small / muted

Table values:
Compact / monospaced or highly legible

---

# Semantic Colors

## Primary

Cyan / electric blue

Used for:

- Active controls
- Primary buttons
- Current values
- Simulation indicators
- Selected zones
- Technical highlights

## Success

Green

Used for:

- Passed criteria
- Target values
- Tracking state
- Feasible state
- Readiness
- Safe-to-enable status

## Negative

Red

Reserved for:

- Failed validation
- Constraint violations
- Critical conditions
- Unsafe state

## Warning

Yellow / amber

Used for:

- Attention states
- Approaching limits
- Marginal validation

## Neutral

Cool gray

Used for:

- Secondary information
- Disabled controls
- Axis labels
- Supporting descriptions

---

# Card Design

Use:

- Deep navy backgrounds
- 1 px subtle blue-gray borders
- 8–12 px corner radius
- Consistent padding
- Minimal shadows
- Very subtle technical glow

Keep cards visually connected so the page feels like one integrated operational system.

---

# Information Hierarchy

The user should understand the page in this sequence:

**1. What scenario is being validated?**  
↓  
**2. Is the virtual simulation running correctly?**  
↓  
**3. Are PUE and WUE converging toward target?**  
↓  
**4. What are the latest real vs predicted readings?**  
↓  
**5. Are the control setpoints tracking safely?**  
↓  
**6. Did every validation criterion pass?**  
↓  
**7. Is the real engine ready?**  
↓  
**8. Enable closed-loop with protection and rollback.**

The most visually important elements should be:

1. **Current vs Target PUE/WUE**
2. **Validation Gate**
3. **Setpoint Control**
4. **All Criteria Passed**
5. **System Ready to Enable**
6. **Enable Closed-loop**

---

# Overall UX Principle

The page must communicate a strong operational safety principle:

**Never apply an optimization directly to the real infrastructure.**

Instead:

**Simulate → Compare → Verify → Validate → Apply Gradually → Monitor → Roll Back if Necessary**

The final visual impression should be:

**Digital twin + real-time telemetry + controlled simulation + explainable validation + safe automation + enterprise-grade reliability.**