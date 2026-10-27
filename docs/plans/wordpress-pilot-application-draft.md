# Simpler application: reusable authoring increment

Owner direction, 2026-10-10: keep `/apply-2/`, redesign the experience. The legacy application is reference material, not a parity target. Initial contact, selected institution/program and preferred intake suffice; document uploads and further steps can follow later.

## Implemented boundary

The existing Form component accepts optional strict `publicFormDraft` v1 configuration. The existing Form property panel offers **Use public form draft** and an editable field list: title/button label, field labels/types, required switches, add/remove. **Return to database form** preserves the existing database properties. No separate admin or renderer was introduced. Five generic defaults contain name, email, optional phone, preferred intake and message. Consent is an available field type; consumer-approved wording is still required before collecting data.

The engine renders these configurations through its existing data-component dispatch. Labels and titles are escaped, input names bounded and unique, unknown properties refused, maximum 24 fields. Invalid configuration produces a bounded review notice. Types are text, email, phone, long text and consent; no uploads, arbitrary endpoints, hidden authority, destination credentials or canonical-table writes are accepted by this draft contract.

This increment is **authoring presentation**, not a working public submission flow. Inputs/fieldset and the button are disabled; there is no form action, enabled submit or React hydration marker. Copy explicitly says applications are not collected. Temporarily incomplete labels remain editable in the admin without silently resetting the configuration. Legacy database forms and AuthForm are unaffected.

## Next executable work

1. Review and save the simpler layout at the original path through the existing admin. Associate selected institution/program using trusted record context rather than trusting browser-supplied IDs or fees.
2. Implement the existing [D2/D3 recording and submission contract](wordpress-pilot-inquiry-production-contract.md): durable owner-scoped storage, exact-payload retry identity, validation/consent, stale-context refusal and abuse limits. Only then enable visitor input/submission.
3. Connect delivery and prove recorded-versus-delivered states. Real outgoing tests require their existing explicit destination authorization. Keep uploads deferred.

This does not close D1–D5, full-catalog serving, original-route acceptance or cutover. It is generic core authoring machinery; actual field choice, labels, layout, branding and original URL belong to consumer/template configuration. Final packaging review remains pending.

## Source treatment evidence

Protected incident-time export: Explore 133 has empty body but stored `/explore/`, already configured as the directory route. Apply 2495 contains `[fluentform id="3"]` at `/apply-2/`; recovered form 3 is “USA Application”. Jobs 3811 embeds an external careers iframe; Blog 134 references Elementor template 3601. Jobs, Blog and two articles still lack stored paths; slugs/GUIDs are candidates, not accepted original-URL proof. Pathway 2606 still has anomalous `published` source status. No exclusions, source path invention or publication inferred from these facts.

The recovered form has 31 named nodes including a composite name wrapper, eight upload fields and two required declarations. One declaration links to the UK site's terms/privacy. Exact attributes, conditions and source digest are retained outside Git in `remaining-page-form-evidence.json`; no historical applicant data was read or migrated. The saved local state has eight pages and configuration routes `/explore/` and `/blog/`; an existing `/inquiry` review page does not establish `/apply-2/` or submission parity.

## Verification

Final workspace build/check pass. Focused no-code editor tests 2/2 pass. Renderer/schema gate passes (bounds, strict unknown-property refusal, unique names, unsafe names, literal escaping, consent, inert rendering and legacy isolation). Three independent compiling mutations each turn the final gate RED, with restored GREEN after each: remove label escaping, enable the fieldset, change the button to submit. Engine regression suite passes; backend security, strict conformance257/77 across334 operations with zero violations/unreachable and tenant175/175 pass. No-leak built-host check reports zero prohibited symbols. See the audit for warnings and timing/worker limits.

Normal admin creation/save produced `apply-2` draft `bada7b47-783b-41fa-aa90-913d324aa9f2`, with five editable fields and no collection. A fresh private SQLite backup precedes creation; exact comparison proves all eight prior pages and all datasource/settings rows unchanged, new page unpublished. Save and reload show the form; mobile-mode screenshot visually fits, frame body width/scrollWidth418/418. Desktop authoring restored. This does not prove public routing at `/apply-2/`, trusted record context, operational submissions or intended-host parity. Screenshots and state proof remain outside Git.
