# End-to-end demo testing

## What the app recommends

SunSum produces a preliminary site recommendation from the combined evidence snapshot:

- `viable`: required screening evidence is present and no review risks or hard blockers are identified.
- `potentially_viable`: the site has enough core evidence to screen, but a risk or unresolved item requires review.
- `not_viable`: an approved hard blocker is explicitly human-confirmed. An image alone cannot produce this result.
- `insufficient_information`: location, usable surface, site control, or other critical evidence is missing.

The uploaded image contributes only visible observations. It cannot establish ownership, legal restrictions, structural capacity, exact area, permitting approval, or utility capacity. Uploads trigger a revised screening snapshot, while the original recommendation remains preserved. Reviewer corrections become effective evidence with `human_review` provenance.

## Fastest complete test

1. Start the app and open <http://127.0.0.1:8000>.
2. In **Simulated test data**, click **Viable rooftop**.
3. The browser automatically selects `01_viable_rooftop.png`, creates the assessment, and uploads the image through the normal multipart image endpoint.
4. Confirm the result shows **Viable**, simulated provider statuses, a financial schedule, and **Uploaded image observations** with a **Simulated** tag.
5. Confirm audit history contains `Assessment Created`, `Image Uploaded And Analyzed`, and `Assessment Rescreened`.
6. Record an operator disposition and rationale. Confirm `Human Review Recorded` appears while the original preliminary recommendation remains unchanged.
7. Choose **Request more information**, then upload evidence. Confirm the assessment returns to **Awaiting review**.
8. Repeat with the remaining scenarios.

## Expected results

| Scenario | Image | Recommendation | What demonstrates the outcome |
| --- | --- | --- | --- |
| Viable rooftop | `01_viable_rooftop.png` | Viable | Complete simulated evidence, low shading, verified control, no identified concern |
| Potentially viable canopy | `02_shaded_canopy.png` | Potentially viable | Moderate shading requires layout and production review |
| Not viable: confirmed prohibition | `03_open_land_prohibition.png` | Not viable | Explicit simulated human-confirmed legal prohibition; not inferred from pixels |
| Insufficient information | `04_low_quality_unknown.png` | Insufficient information | Unresolved location, surface, control, and low-quality visual evidence |

## Manual file-input test

The files are in `data/sample/site_images/`. Use **Synthetic upload dataset** below the site-image input to place one into the file control, complete the form, and click **Run preliminary assessment**.

A manually uploaded sample image does not fill missing address, surface, control, financial, or policy fields. If those fields remain blank, **Insufficient information** is the expected and correct result.

## API test

```bash
curl http://127.0.0.1:8000/api/demo-images
curl -o /tmp/viable.png http://127.0.0.1:8000/api/demo-images/viable-rooftop
curl -X POST http://127.0.0.1:8000/api/demo-scenarios/viable-rooftop/assessments
```

Use the returned assessment ID to upload the image:

```bash
curl -X POST \
  -F 'file=@/tmp/viable.png;type=image/png' \
  http://127.0.0.1:8000/api/assessments/ASSESSMENT_ID/images
```

The image response should report `provider_status: simulated`, observations with `source: simulated_demo`, and a `revised_assessment` containing the current recommendation evidence.
