# Heat exchanger calculations

Reference: the supplied `mod1.pdf`, NPTEL Chemical Engineering Design II, Module 1, single-phase shell-and-tube section, particularly pages 14-24. The [public NPTEL copy](https://archive.nptel.ac.in/content/storage2/courses/103103027/pdf/mod1.pdf) has the same title and pagination.

## Scope and inputs

The hot stream is on the shell side and the cold stream is in the tubes. The model predicts outlet temperatures for known inlet temperatures, flows, geometry and film coefficients. It assumes steady single-phase operation, constant properties at each stream's mean/caloric temperature, and no heat loss from the exchanger itself to the surroundings. Connecting pipes can separately exchange heat with ambient, as described below. It supports one tube pass (counter/parallel) and one shell pass with two tube passes. It does not implement the PDF's six-tube-pass revision, pressure-drop design, mechanical sizing, condensers or reboilers.

`HeatExchangerDesign.thermal` is optional; partial overrides preserve the remaining defaults. These are illustrative inputs, not temperature-dependent water-property correlations:

| Property | Default | Unit |
| --- | ---: | --- |
| Hot / cold specific heat | 4.18 / 4.18 | kJ/(kg K) |
| Tube outside / inside diameter | 0.01905 / 0.01575 | m |
| Tube wall conductivity | 16 | W/(m K) |
| Shell / tube film coefficient | 1000 / 3000 | W/(m² K) |
| Shell / tube fouling resistance | 0.0002 / 0.0002 | m² K/W |

The faceplate displays diameters in mm and stores them in m. Inlet/outlet temperatures are °C, mass flows are kg/s, duty is kW, and area is m². Fouling resistances refer to their respective side's heat-transfer surface.

Film coefficients must be evaluated for the actual fluid, flow and geometry. The supplied PDF uses external heat-transfer-factor charts, which are not included in the PDF. The model therefore accepts coefficients explicitly rather than inventing chart values or varying h with baffle geometry alone. Re-evaluate them after changing flow, tube passes, tube count, length, or baffles.

## Equations

With total tube count N, length L, outside/inside diameters do/di:

```text
Ao = N pi do L
1/Uo = 1/ho + Rfo + do ln(do/di)/(2 kw) + (do/di)(1/hi + Rfi)
Ch = mh cph                         [kW/K]
Cc = mc cpc                         [kW/K]
Cr = min(Ch,Cc)/max(Ch,Cc)
NTU = Uo Ao / (1000 min(Ch,Cc))
Q = effectiveness min(Ch,Cc) (Thi - Tci)   [kW]
Tho = Thi - Q/Ch
Tco = Tci + Q/Cc
```

The outside/inside **heat-transfer** area ratio is `do/di`, not `(do/di)^2`. The cylindrical conduction term is exact; it replaces the PDF's thin-wall approximation.

The existing effectiveness/NTU approach is retained because both outlet temperatures are unknown. Its three arrangement-specific relations are evaluated using `expm1` and `tanh` to avoid cancellation at very small NTU. Equal capacity rates and infinite-NTU limits are handled explicitly.

For a given pair of terminal differences, `LMTD = (dT1-dT2)/ln(dT1/dT2)`. Equal differences use the analytic limit. Counterflow uses `Thi-Tco` and `Tho-Tci`; parallel flow uses `Thi-Tci` and `Tho-Tco`. The one-shell/two-tube-pass correction FT refers to counterflow LMTD. The `lmtdCorrectionFactor` helper inverts the one-shell effectiveness relation and handles equal capacity rates without an R=1 singularity.

```text
Q = Uo Ao FT LMTD / 1000            [kW]
Arequired = 1000 Q / (Uo FT LMTD)    [m²]
```

Single-pass FT is 1 with that arrangement's LMTD. The rating function evaluates single-pass LMTD using `Q/(Uo Ao)` to preserve the driving force when rounded outlet temperatures appear to meet at high NTU. For two tube passes it reports counterflow LMTD and the ratio of the effective mean temperature difference to that LMTD. FT below 0.75 produces a design-review message.

The exported helpers also implement:

```text
AtubeFlow = (N/tubePasses) pi di² / 4
velocity = massFlow / (density AtubeFlow)
Re = density velocity di / viscosity
h = jH (k/D) Pr^(1/3) (viscosity/wallViscosity)^0.14
Pr = (1000 cp) viscosity / k
```

Here density is kg/m³, viscosity is Pa s, k is W/(m K), cp is kJ/(kg K), and D is tube ID or shell equivalent diameter in m. `jH` is the PDF's chart heat-transfer factor, **not** the Colburn j factor. The helper's output may be assigned to either film-coefficient input; it does not select a chart value or calculate shell geometry automatically.

Zero flow on either side or a stopped unit gives zero duty and unchanged outlet temperatures. LMTD/FT operating readouts are then unavailable (`null`). NTU/effectiveness still describe the configured rating when stopped with nonzero flows. Equal inlet temperatures give zero duty and zero driving force. Reversed inlet temperatures produce a signed negative duty, conserving energy. Invalid geometry, nonfinite inputs, negative flows and impossible target terminal temperatures raise `RangeError`.

## Verification cases and source corrections

Tests are in `tests/heat-exchanger.test.mjs`; run `npm test`.

| Case | Expected result |
| --- | --- |
| PDF kerosene energy balance: 150,000 lb/h, cp 0.48 Btu/(lb °F), 75 → 120 °F | 3,240,000 Btu/h = 949.550267358 kW |
| PDF terminal temperatures: hot 160 → 120 °F; cold 75 → 120 °F | LMTD 42.450935079 °F; FT 0.802364528 |
| Required area using those terminals and Uo 45 Btu/(h ft² °F) | 2113.846829 ft² |
| PDF first-iteration tubes: 518 tubes, 1 in OD, 16 ft long | 2169.793326 ft² outside area |
| First-iteration tube flow: 2 passes, 0.834 in ID, 1.6 mPa s kerosene | Re 2741.23; close to rounded PDF value 2740.2 |
| PDF jH values 42 tube / 110 shell | Approximately 141.3 / 155.3 Btu/(h ft² °F) |
| PDF film coefficients, fouling factors and brass conductivity, with corrected outside-area resistance | Uo 59.765647254 Btu/(h ft² °F) = 339.365083862 W/(m² K) |
| NTU 1, capacity ratio 0.5: counter / parallel / one-shell-two-tube | Effectiveness 0.564733402 / 0.517913227 / 0.539939556 |
| Equal-capacity counterflow at NTU 2 | Effectiveness 2/3 |
| Independent complete rating: 100 tubes, 5 m length, 20/16 mm OD/ID; input values in test | Duty 562.694589020 kW; outlets 79.663176373 / 120.336823627 °C |

The PDF prints LMTD 42.75 °F and approximately 2100 ft². Its stated terminal temperatures give the more precise values above. Its page-24 substitution uses a squared diameter ratio for heat-transfer areas and prints Uo 53.5 Btu/(h ft² °F). Tests intentionally use the linear ratio and exact cylindrical conduction instead of reproducing that mistake. The page-24 film coefficients come from the revised geometry; the tests check that resistance calculation separately from first-iteration geometry.

Further tests cover heat lost = heat gained, `Q=Uo Ao FT LMTD`, outlet-temperature bounds, sensitivity to fouling and wall conductivity, two-pass independence from the single-pass selector, zero/stopped/reversed flows, equal and nearly equal terminal differences, tiny/large NTU, a 100-point low-flow sweep, default compatibility, and invalid inputs.

## Series connections and connecting pipes

`src/plant/network.ts` solves constant-property equipment and pipe temperature equations simultaneously, supporting open paths and closed circulation loops. A connected inlet inherits the upstream outlet temperature (after the pipe), mass flow and specific heat. The other inlet remains independent unless it is also connected. Changes to inlet conditions, geometry, thermal inputs or running state recalculate all downstream units. Saved manual inputs are retained and restored on disconnection. Stopped exchangers remain zero-duty pass-through units, consistent with the standalone model; stopping a unit does not close a valve.

Pipes use constant mass flow, specific heat, ambient temperature and total conductance UA. The steady plug-flow energy balance integrates to:

```text
Tdownstream = Tambient + (Tupstream - Tambient) exp(-UA / (1000 massFlow cp))
Qpipe = massFlow cp (Tupstream - Tdownstream)    [kW]
```

UA is W/K, mass flow is kg/s, cp is kJ/(kg K), and temperatures are °C. The implementation uses `expm1` for small UA. Positive Qpipe means heat loss; negative means heat gain. Temperatures approach ambient without crossing it. With zero mass flow, transported duty is zero and the inlet temperature is retained as a display convention; stagnant-fluid transients are not modeled.

This is the constant-ambient, constant-conductance simplification of the exponential pipe temperature relation described in [MathWorks' thermal-liquid pipe documentation](https://www.mathworks.com/help/simscape/ref/pipetl.html). UA combines fluid films, pipe wall and insulation into one user-supplied value. It is not inferred from drawing length. Defaults are UA = 0 W/K and ambient = 25 °C; existing pipes therefore transfer the upstream outlet temperature unchanged.

Only outlet-to-inlet connections and one pipe per port are supported; circulation loops are allowed. Connections may cross between shell and tube sides; fluid cp follows the stream. Splitting, mixing, pressure drop, phase change and transport delays are outside this model. See [closed-loop flow/Cp controls, energy balance and unavailable steady states](heater-calculations.md#heaterexchanger-circulation). Film coefficients remain user inputs and should be reviewed when inherited flow changes.

`tests/plant-network.test.mjs` verifies multi-unit propagation on both sides, updates and disconnections, reverse dragging, cross-side feeds, mass/energy consistency, stopped/zero-flow behavior, pipe heat loss and gain, an independent half-temperature-difference reference, and invalid graph/input rejection.
