<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# UI/UX rule (mandatory)

Any work that creates or modifies user-facing UI (pages, components, layout, styling) MUST invoke the `ui-ux-pro-max` skill via the Skill tool BEFORE writing UI code, and follow the design direction it produces. If `docs/design-system.md` exists, read it first and stay consistent with it — do not invent a new style per page. This is a hard requirement, not a suggestion.
