# Heater calculations

The heater is an inline heat source for a single fluid stream. It accepts inlet temperature (°C), mass flow (kg/s), specific heat (kJ/(kg K)), and power delivered to the fluid (kW). It uses a steady energy balance with constant fluid properties:

```text
Q = power                          [kW, when running with positive flow]
Tout = Tin + Q / (massFlow Cp)      [°C]
```

This is delivered thermal power; electrical consumption and efficiency are not modeled. With a stopped heater or zero mass flow, Q is zero and Tout equals Tin. This preserves the plant's pass-through behavior. Zero-flow calculations do not simulate stagnant-fluid heating, accumulation or thermal protection. The heater does not model boiling or steam; temperatures are single-phase estimates and are not clamped at a boiling point.

Defaults: 25 °C inlet, 1 kg/s flow, 4.18 kJ/(kg K) water Cp, 100 kW power, stopped. Switching on produces approximately 48.923 °C at the default flow. An independent reference is 41.8 kW heating 1 kg/s water by 10 K.

The inlet (`hot-in`) is on the left and outlet (`hot-out`) on the right. A heater has one stream; `hot` is its port identifier, not a constraint on inlet temperature. Its outlet can feed either side of a heat exchanger or another heater. Connected inlet temperature, mass flow and Cp are calculated from the upstream outlet and connecting pipe; saved standalone values are restored after disconnection. The connected fluid's Cp overrides the heater's local Cp while the connection exists. Equipment temperatures are solved simultaneously, including closed return paths, regardless of node or edge array order.

Connecting pipes retain the [existing ambient heat-transfer model](heat-exchanger-calculations.md#series-connections-and-connecting-pipes). Their heat loss/gain is applied between heater outlet and destination inlet. Each port permits one pipe. Closed circulation loops are supported; splitting and mixing remain unsupported.

`tests/heater.test.mjs` covers an independent water-heating reference, power/flow/Cp sensitivity, stopped and zero-flow cases, invalid inputs, heater-to-exchanger heat loss and energy balance, exchanger-to-heater fluid inheritance, multiple heaters in series, downstream updates, disconnection restoration and heater port validation. Run `npm test`.

## Heater–exchanger circulation

Connect heater outlet → exchanger heating inlet, and exchanger heating outlet → heater inlet. Either pipe can be added first or dragged in reverse. The heater supplies loop mass flow and Cp; these controls remain editable even though inlet temperature follows the return. Multiple-heater loops use the lowest-ID heater as the flow/Cp source; each heater still supplies its own power. Removing a return or supply pipe restores the resulting open feed's saved inputs.

For one heater and exchanger with insulated pipes, constant properties and nonzero flow:

```text
Cloop = massFlow Cp
K = exchanger effectiveness × min(Cloop, Cother)
Tsupply = Tother,in + heaterPower / K
Treturn = Tsupply - heaterPower / Cloop
Qexchanger = heaterPower
```

This requires K > 0. With pipe losses, total heater duty equals exchanger duty plus both pipes' heat losses. The implementation builds the affine outlet relations for all units and pipes and solves their simultaneous inlet-temperature equations using pivoted elimination. It does not iteratively recycle guessed temperatures.

If the heater is on but the exchanger cannot remove heat and the pipes are insulated, no finite steady-state solution exists. Connections are kept so users can change running states, circulation flow or pipe settings; numeric operating readouts are suppressed and `calculationError` is returned. Such a loop would accumulate heat over time, which this steady model does not simulate. A passive, unanchored loop uses saved inlet temperatures as reference values for free temperatures; it does not infer equilibrium from fluid inventory or stored energy.

`tests/circulation.test.mjs` verifies connection and drag order, the independent analytical temperature balance above, return-line continuity, pipe losses, multi-heater/exchanger rings, flow/Cp control ownership, power and coolant changes, zero/stopped flow, missing heat sinks, disconnection and coupled open material streams.
