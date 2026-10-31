Projects Preparing · Modern UI Refresh (based on supplied supabase--main-126.zip)

What changed
- Stage timeline index markers are solid dark (#141b2b) with white numbers and a matching dark connecting line.
- Percentage gauges keep the real saved progress values but use calm matte tones, without sheen or animated waves.
- All native <select> fields under components/preparing were migrated to the shared PreparingSelect accessible dropdown, with responsive popover, keyboard navigation, disabled items and the same onChange(event.target.value) interface. Existing custom Production/Box status filters were retained.
- Testing, Warehouse and Production export dialogs use matching modern layout with grouped checkbox cards, summary and responsive export actions.
- Kit-group toggles in Testing, Warehouse, Production, Box and Master BOM use consistent SVG chevrons and clear expanded states.
- CSS cache version bumped on the Projects Preparing route.

Scope: All screens within Projects Preparing, not all modules throughout the ERP. Changes to unrelated ERP screens are intentionally avoided for Production safety.

Deployment
1. Apply the files in this ZIP preserving the original directory paths.
2. Deploy through your usual production process, without SQL changes.
3. Check mobile and desktop: Project Steps, Testing filter, Export Testing, Kit Groups, Warehouse/Production filters, Boxes, and proposal selectors.
4. Pay particular attention to dropdowns within bottom sheets on Android.

Checks
- All 193 Projects Preparing automated tests passed (including six UI-refresh regression tests).
- All 15 Preparing JSX files parsed without syntax diagnostics.
- Full Next.js production build / live browser acceptance was not run in this environment; verify after deployment.
