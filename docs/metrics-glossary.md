# Metrics Glossary

Human source of truth for the business meaning of every column the text-to-SQL model may reference. Conventions: STR (comp-set benchmarking) and USALI (departmental P&L). The prompt vocabulary block in `supabase/functions/text-to-sql/schema_prompt.ts` is condensed from this file; `schema_prompt_test.ts` fails if a `METRIC_COLUMNS` entry is missing here (each column must appear in backticks).

Grain: one row per property per day in `daily_metrics`; currency USD; 90 days of history; no budget, forecast, prior-year (STLY) or pickup/pace data.

## Aggregation rules (apply to every period or group rollup)

| Class | Columns | Rule |
| --- | --- | --- |
| Additive | `rooms_sold`, `total_revenue`, `bookings`, `direct_bookings`, `ota_bookings`, `gds_bookings`, `group_bookings`, `cancellations`, all `*_cost`, `total_cost`, `gop`, `rooms_cleaned`, `housekeeping_hours` | `sum()` |
| Capacity | `total_rooms` (on `properties`) | Rooms per night. Available room-nights = `sum(total_rooms)` over the matching `daily_metrics` rows after joining `properties` (counts each property once per day in the window) |
| Ratio | `adr`, `occupancy_pct`, `revpar`, `cpor`, `mpi`, `ari`, `rgi`, GOP margin, channel shares, cancellation rate | Re-derive from summed components. Never `avg()` the stored ratio across days or properties |
| Weighted average | `avg_booking_window_days` (weight `bookings`); `nps`, `csat`, `repeat_guest_pct` (weight `rooms_sold`); `market_occupancy_pct`, `market_revpar` (weight `total_rooms`); `market_adr` (weight `rooms_sold`) | `sum(x * w) / nullif(sum(w), 0)` |

Integer columns (`rooms_sold`, `bookings`, channel counts, `cancellations`, `rooms_cleaned`, `total_rooms`) must be cast to numeric before division.

## properties

| Column | Meaning | Unit | Notes / synonyms |
| --- | --- | --- | --- |
| `name` | Hotel name | text | Property, hotel, asset, "which hotel". Use as the label dimension |
| `location` | City and state of the hotel | text | Address, city, "where". Not the comp-set market |
| `total_rooms` | Physical room inventory (available rooms per night) | rooms | Keys, inventory, capacity, hotel size, available rooms. Denominator for occupancy, RevPAR, GOPPAR. Lives on `properties`; any use requires a join |
| `segment` | STR chain scale / positioning class | one of `luxury`, `upper_upscale`, `upscale`, `upper_midscale`, `midscale` | Chain scale, class, tier, "luxury hotels". Ordered high to low rate. Grouping dimension |
| `base_adr` | Target rate used to seed the synthetic generator | USD | Not a realized rate; never report as ADR. Rack rate / BAR only as a loose reading |
| `market` | Comp-set market (city) | text | Submarket, destination, "in Denver". Grouping dimension |

## daily_metrics: keys

| Column | Meaning | Unit | Notes / synonyms |
| --- | --- | --- | --- |
| `property_id` | FK to `properties.id` | uuid | Join key for names and `total_rooms` |
| `metric_date` | Business (stay) date of the row | date | Night, stay date, day. Weekly buckets: ISO Mon-Sun. Period phrasing: MTD, WTD, "last 30 days" |

## daily_metrics: rooms performance

| Column | Meaning | Formula / aggregation | Unit | Better | Synonyms |
| --- | --- | --- | --- | --- | --- |
| `rooms_sold` | Occupied room-nights | `sum(rooms_sold)` | rooms | higher | Occupied rooms, room nights sold, roomnights, RNS, rooms occupied, volume |
| `total_revenue` | Total hotel revenue (rooms, F&B and other) | `sum(total_revenue)` | USD | higher | Revenue, sales, top line, total revenue (TRev) |
| `adr` | Average daily rate. Stored = `total_revenue / rooms_sold` | `sum(total_revenue) / nullif(sum(rooms_sold), 0)` | USD | higher | Average rate, rate, average daily rate, "pricing". Uses total revenue, so it equals revenue per occupied room (TRevPOR/RevPOR), not rooms-only ADR |
| `occupancy_pct` | Share of available rooms sold. Stored as a percent 0-100 | `sum(rooms_sold)::numeric / nullif(sum(total_rooms), 0) * 100` | % | higher | Occupancy, occ, OCC%, fill, utilisation, load. Stored value is the generator target; re-derive from components |
| `revpar` | Revenue per available room. Stored = `total_revenue / total_rooms` | `sum(total_revenue) / nullif(sum(total_rooms), 0)` | USD | higher | RevPAR, revenue per available room, yield, TRevPAR. Equals ADR x occupancy. Total-revenue basis, not rooms-only |

## daily_metrics: distribution and demand

| Column | Meaning | Formula / aggregation | Unit | Better | Synonyms |
| --- | --- | --- | --- | --- | --- |
| `bookings` | Reservations made that day, including those later cancelled. Equals the sum of the four channels | `sum(bookings)` | count | higher | Reservations, reservation volume, gross bookings, demand, new bookings |
| `direct_bookings` | Bookings via the hotel's own channels (brand.com, phone, walk-in) | `sum(direct_bookings)`; share = `sum(direct_bookings)::numeric / nullif(sum(bookings), 0) * 100` | count / % | higher share | Direct, direct share, direct mix, website bookings, own channels, direct ratio. Cheapest channel (no commission) |
| `ota_bookings` | Bookings via online travel agencies | share = `sum(ota_bookings)::numeric / nullif(sum(bookings), 0) * 100` | count / % | lower share (commission-heavy) | OTA, Expedia, Booking.com, online travel, third-party, indirect, channel dependence |
| `gds_bookings` | Bookings via global distribution systems (travel agents, corporate travel) | share = `sum(gds_bookings)::numeric / nullif(sum(bookings), 0) * 100` | count / % | neutral | GDS, Sabre, Amadeus, Travelport, corporate travel, travel agent |
| `group_bookings` | Group / meetings blocks | share = `sum(group_bookings)::numeric / nullif(sum(bookings), 0) * 100` | count / % | neutral | Group, groups, MICE, meetings and events, blocks, conference business |
| `cancellations` | Bookings cancelled; always <= `bookings` | rate = `sum(cancellations)::numeric / nullif(sum(bookings), 0) * 100` | count / % | lower | Cancels, cancellation rate, cancel %, attrition, drop-off |
| `avg_booking_window_days` | Mean days between booking and arrival | `sum(avg_booking_window_days * bookings) / nullif(sum(bookings), 0)` | days | context (longer = more forward visibility) | Lead time, booking lead, booking window, advance purchase, days out, how far ahead |

Channel mix = the four channel shares (they sum to 100%). Channel shares are additive composition: pie or stacked bar. Net of cancellations: net bookings = `bookings - cancellations`.

## daily_metrics: cost and profit (USALI departments)

`total_cost` is operating cost only (the six cost lines below); there is no payroll, management fee or fixed-charge breakdown.

| Column | Meaning | Formula / aggregation | Unit | Better | Synonyms |
| --- | --- | --- | --- | --- | --- |
| `rooms_cost` | Rooms department expense | `sum(rooms_cost)` | USD | lower | Rooms expense, rooms department cost, housekeeping and front office cost |
| `fnb_cost` | Food and beverage department expense | `sum(fnb_cost)` | USD | lower | F&B cost, F&B expense, food and beverage, outlets, banquet cost |
| `admin_cost` | Administrative and general expense | `sum(admin_cost)` | USD | lower | A&G, admin, G&A, overhead, administrative and general |
| `marketing_cost` | Sales and marketing expense | `sum(marketing_cost)` | USD | lower | S&M, sales and marketing, marketing spend, advertising, acquisition cost |
| `maintenance_cost` | Property operations and maintenance expense | `sum(maintenance_cost)` | USD | lower | POM, POMEC, repairs and maintenance, R&M, engineering, upkeep |
| `utilities_cost` | Utilities expense | `sum(utilities_cost)` | USD | lower | Utilities, energy, power, water, gas, energy cost |
| `total_cost` | Sum of the six cost columns | `sum(total_cost)` | USD | lower | Total operating cost, total expenses, opex, cost base, operating expenses |
| `gop` | Gross operating profit = `total_revenue - total_cost` | `sum(gop)` | USD | higher | GOP, gross operating profit, profit, operating profit, bottom line |
| `cpor` | Cost per occupied room = `total_cost / rooms_sold` | `sum(total_cost) / nullif(sum(rooms_sold), 0)` | USD | lower | CPOR, cost per occupied room, cost per room night, unit cost, cost to serve |

Derived (no stored column):

| Metric | Formula | Unit | Better | Synonyms |
| --- | --- | --- | --- | --- |
| GOP margin | `sum(gop) / nullif(sum(total_revenue), 0) * 100` | % | higher | GOP %, GOP margin, profit margin, operating margin, margin |
| GOPPAR | `sum(gop) / nullif(sum(total_rooms), 0)` | USD | higher | Gross operating profit per available room, profit per available room |
| Department cost ratio | `sum(<x>_cost) / nullif(sum(total_revenue), 0) * 100` | % | lower | Cost % of revenue, expense ratio |
| Flow-through | `(gop_current - gop_prior) / nullif(revenue_current - revenue_prior, 0) * 100` | % | higher | Flow-through, drop-through, incremental margin; needs two periods (CTE or conditional aggregation) |
| Cost mix | `sum(<x>_cost) / nullif(sum(total_cost), 0) * 100` | % | n/a | Cost breakdown, where the money goes; composition (pie / stacked bar) |

## daily_metrics: competitive benchmarks (STR-style comp set)

Market columns are the competitive-set values for that property and day (comp set, competitive set, market, compset).

| Column | Meaning | Formula / aggregation | Unit | Better | Synonyms |
| --- | --- | --- | --- | --- | --- |
| `market_occupancy_pct` | Comp-set occupancy, percent 0-100 | room-weighted: `sum(market_occupancy_pct * total_rooms) / nullif(sum(total_rooms), 0)` | % | context | Market occupancy, comp set occupancy, compset occ |
| `market_adr` | Comp-set average daily rate | `rooms_sold`-weighted: `sum(market_adr * rooms_sold) / nullif(sum(rooms_sold), 0)` | USD | context | Market ADR, comp set rate, competitor rate |
| `market_revpar` | Comp-set RevPAR | room-weighted: `sum(market_revpar * total_rooms) / nullif(sum(total_rooms), 0)` | USD | context | Market RevPAR, comp set RevPAR |
| `mpi` | Market penetration index = `occupancy_pct / market_occupancy_pct * 100` | `(sum(rooms_sold)::numeric / sum(total_rooms) * 100) / room-weighted market_occupancy_pct * 100` | index (100 = fair share) | higher | MPI, market penetration index, penetration, occupancy index, fair share (occupancy), share of demand |
| `ari` | Average rate index = `adr / market_adr * 100` | `sum(total_revenue) / nullif(sum(market_adr * rooms_sold), 0) * 100` | index | higher | ARI, average rate index, rate index, rate premium, pricing power |
| `rgi` | Revenue generation index = `revpar / market_revpar * 100` | `sum(total_revenue) / nullif(sum(market_revpar * total_rooms), 0) * 100` | index | higher | RGI, revenue generation index, RevPAR index, REVPAR index, yield index, fair share (revenue), "beating the comp set" |

Index reading: above 100 = outperforming the comp set, below 100 = losing share. RGI is approximately MPI x ARI / 100. Per property over a period, `sum(revpar) / sum(market_revpar) * 100` is equivalent to the RGI formula (constant `total_rooms`). Acceptable simplification at portfolio level: `rooms_sold`-weighted average of stored indexes; never a plain average.

## daily_metrics: guest experience

| Column | Meaning | Formula / aggregation | Unit | Better | Synonyms |
| --- | --- | --- | --- | --- | --- |
| `nps` | Net promoter score, range -100 to 100 | `sum(nps * rooms_sold) / nullif(sum(rooms_sold), 0)` | points | higher | NPS, net promoter, promoter score, loyalty score, recommend |
| `csat` | Customer satisfaction, 0-5 scale | `sum(csat * rooms_sold) / nullif(sum(rooms_sold), 0)` | score (not %) | higher | CSAT, satisfaction, guest satisfaction, GSS, review score, rating |
| `repeat_guest_pct` | Share of guests who are returning, 0-100 | `sum(repeat_guest_pct * rooms_sold) / nullif(sum(rooms_sold), 0)` | % | higher | Repeat guests, returning guests, repeat rate, loyalty, retention, repeat stays |

## daily_metrics: housekeeping

| Column | Meaning | Formula / aggregation | Unit | Better | Synonyms |
| --- | --- | --- | --- | --- | --- |
| `rooms_cleaned` | Rooms cleaned that day (about equal to `rooms_sold`) | `sum(rooms_cleaned)` | rooms | n/a | Rooms serviced, rooms made up, rooms turned, clean count |
| `housekeeping_hours` | Housekeeping labor hours worked | `sum(housekeeping_hours)` | hours | lower for the same output | Labor hours, HK hours, housekeeping labor, housekeeping productivity input |

Derived: housekeeping efficiency (rooms per labor hour) = `sum(rooms_cleaned)::numeric / nullif(sum(housekeeping_hours), 0)`, higher is better (synonyms: rooms per hour, rooms per labor hour, RPH, productivity, housekeeping productivity). Minutes per room = `60 / rooms_per_hour` (lower is better; synonyms: minutes per room, MPR, clean time, time per room). Labor hours per occupied room = `sum(housekeeping_hours) / nullif(sum(rooms_sold), 0)`.

## Natural pairings

| Question focus | Metrics together | Why |
| --- | --- | --- |
| Rate vs volume | `adr` + `rooms_sold` | Rate gains that cost volume; price/volume trade-off |
| Rate vs occupancy | `adr` + `occupancy_pct` (RevPAR = both) | Decomposes RevPAR movement |
| Cost vs fill | `cpor` + `occupancy_pct` | Fixed-cost absorption: higher occupancy normally lowers CPOR |
| Cost vs rate | `cpor` + `adr` | Unit margin per occupied room (ADR minus CPOR) |
| Profitability vs top line | GOP margin + `revpar` | Revenue quality; does RevPAR growth reach the bottom line |
| Channel economics | direct share + `total_revenue`, or channel mix + `adr` | Direct dependence vs OTA commission drag |
| Benchmarking | `mpi` + `ari` (and `rgi`) | Whether a RevPAR gap is occupancy (MPI) or rate (ARI) driven |
| Demand quality | `bookings` + `cancellations` (cancellation rate) | Gross vs net demand |
| Guest vs yield | `nps` + `csat`, or `nps` + `rgi` | Satisfaction against commercial performance |
| Labor | rooms per hour + `occupancy_pct` | Housekeeping productivity at differing load |

## Unsupported terms (answer with a proxy and a caveat)

| Term | Status |
| --- | --- |
| Budget, forecast, variance to budget, STLY / prior year, pace, pickup | Not tracked; 90 days of actuals only. Prior period within the window is possible |
| Rooms-only ADR / RevPAR, F&B or ancillary revenue split, TRevPAR vs RevPAR | Not tracked; `adr` and `revpar` are on total revenue |
| Labor cost, payroll, management fees, fixed charges, EBITDA, NOI | Not tracked; `gop` is revenue minus the six cost lines |
| Length of stay, guest nationality, loyalty tier, room type, rate plan, walk-ins, no-shows | Not tracked |
