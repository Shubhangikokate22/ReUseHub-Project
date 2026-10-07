# ReUseHub environmental estimate methodology

ReUseHub reports **estimated avoided emissions** in **kg CO2e**. It does not report measured or certified carbon reductions and does not perform a full product life-cycle assessment.

## Calculation

For a completed exchange, sale, or donation with a supported reference factor:

```text
Baseline scenario emissions = reference lifecycle factor x displacement factor
Estimated net avoided emissions = baseline scenario emissions
                                - reuse scenario emissions
                                - transport emissions
```

The default displacement factor is `0.5` and can be changed with `SUSTAINABILITY_DISPLACEMENT_FACTOR` (0 through 1). It is an assumption: ReUseHub does not measure whether a recipient would otherwise buy a new item. Historical calculation rows store the factor value, source record ID, component values, confidence, and assumptions so later source edits do not rewrite old calculations.

The app matches factors using the listing category and title keywords. A match identifies a reference product scenario; it does not verify that the listed item has the same materials, size, age, or production history.

Reuse-scenario emissions are currently recorded as zero because the app does not collect refurbishment or cleaning activity. Transport emissions are currently recorded as zero and omitted because the app does not collect distance or transport mode. In this calculation, zero means **not included**, not measured zero. Pickup locations and mode-specific transport estimation remain future work.

No matching factor means the CO2e estimate is unavailable; the app does not substitute an arbitrary per-kilogram multiplier. An item weight is shown as estimated waste avoided only when the listing owner supplies a positive weight. This is a user-provided estimate, not a measured waste reduction. Missing weight remains unavailable.

## Reference factors

Factors are stored in the `EmissionFactor` table with source, year, lifecycle boundary, unit, confidence, and notes.

| Item | Reference factor | Source and boundary |
|---|---:|---|
| Paperback book | 2.46 kg CO2e/book | Wells et al. (2012), cradle-to-grave paperback scenario. [DOI](https://doi.org/10.1111/j.1530-9290.2011.00414.x) |
| Laptop | 169 kg CO2e/laptop | ADEME 2018 product LCA, cradle-to-grave, 2 kg laptop reference. [ADEME Base Empreinte](https://prod-basecarbonesolo.ademe-dri.fr/documentation/UPLOAD_DOC_FR/ordinateurs_et_equuipements_pe_2.htm) |
| Cotton T-shirt | 7 kg CO2e/item | ADEME 2018, cradle-to-grave. [ADEME Base Empreinte](https://prod-basecarbonesolo.ademe-dri.fr/documentation/UPLOAD_DOC_FR/coton_-synthetique_-autre_2.htm) |
| Cotton shirt | 13 kg CO2e/item | ADEME 2018, cradle-to-grave. Same source as above. |
| Cotton jeans | 25 kg CO2e/item | ADEME 2018, cradle-to-grave. Same source as above. |
| Cotton sweatshirt | 31 kg CO2e/item | ADEME 2018, cradle-to-grave. Same source as above. |
| Wool sweater | 56 kg CO2e/item | ADEME 2018, cradle-to-grave. Same source as above. |
| Coat | 89 kg CO2e/item | ADEME 2018 average-composition coat, cradle-to-grave. Same source as above. |
| Backpack | 17.5 kg CO2e/item | Secondary illustrative estimate; not a formal LCA. [Arbor estimate](https://www.arbor.eco/carbon-footprint/backpack) |
| Chair | 30 kg CO2e/item | One product-specific chair summary, A1-C4 stages; not universal to all chairs. [BCI Furniture summary](https://bcifurniture.com/wp-content/uploads/Modus-Quiet-Product-Card.pdf) |
| Calculator | unavailable | No verified product-specific factor is seeded. |

The factor is a reference for a source product. It is **not** automatically the impact avoided by one reuse event. The displacement assumption reduces the baseline estimate, and confidence is downgraded because displacement is not measured. Category, condition, supply chain, product size, region, and end-of-life can differ from each reference product.

## Confidence and score

Confidence is stored per calculation. Source confidence is reduced one level for the unmeasured displacement assumption. Missing factors receive LOW confidence and no numerical net estimate.

The 0-100 item sustainability score is a rule-based reuse-potential indicator based on category, listed condition, and transaction type. It is calculated when item details are returned and is not stored as an environmental measurement. It is not an emissions result, measured performance, certified rating, or professional LCA.

## What is measured

- Listing and completed transaction counts are database counts.
- Uploaded item-image byte counts are recorded when available. The app does not retain original image byte counts, so it cannot calculate a measured compression or storage-reduction percentage.
- Campus activity totals count each completed item event once. Individual participant metrics can contain a row for each participant in an exchange or sale; campus totals deduplicate those rows by item and event type.
- The admin efficiency view reports database listing-status counts, image-storage metadata, and in-memory API request, paginated-response, and response-content-length counters. API counters begin at backend process start and reset when it restarts. A response without a `Content-Length` header is not included in measured response bytes.

## What is estimated or assumed

- Waste avoided uses only a user-entered item weight.
- Net avoided CO2e uses the reference factor and displacement assumption above.
- Displacement factor is an assumption and configurable on the backend.
- Missing refurbishment and transportation data is omitted, not measured as zero.
- Sustainability score is a rule-based indicator.

ReUseHub does not measure server/data-center energy, PUE, electricity savings, actual lifecycle impacts, or IEEE 802.3az operation. Pagination and client-side image resizing/compression demonstrate software efficiency practices, not quantified energy reductions.
