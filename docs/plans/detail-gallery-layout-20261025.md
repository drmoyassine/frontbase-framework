# Gallery and detail layout refinement

Status: implementation and verification in progress. Supersedes presentation choices in the first detail starter, preserving its functional acceptance history.

Owner requests a normal Gallery element that becomes a cover for one media item and a tiled layout for multiple images/videos. The screenshot places program tuition/duration and Apply beside identity, with an institution consultation action in the corresponding header area. Institution navigation becomes a desktop sidebar with categories/subsections; program navigation stays horizontal. All surrounding layout, texts, bindings and Actions remain ordinary editable nodes.

Use existing media upload/selection and safe source URL rendering; no new provider. Current inspected source contains institutions.gallery_images and video_url, and programs.video_highlights. ELS has a YouTube video; inspected sample gallery arrays are empty. No ranking column was found in the inspected institution/program schemas, so rankings are optional mappings only.

Acceptance: shared SSR/canvas Gallery single/multiple/video/bound/fallback and malformed-input tests; explicit template upgrade preserves IDs/bindings and remains idempotent; existing route/save/localization conformance; English/Arabic desktop/mobile native layout and Actions. Publish reviewed staging templates and locale updates, preserve all captured routes and source record values. Commit/push/deploy with exact source receipt. Broader release gates remain separate.
