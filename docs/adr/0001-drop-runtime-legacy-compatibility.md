# Drop Runtime Legacy Compatibility

Refactors no longer keep permanent runtime compatibility branches for old configuration versions, old storage structures or deprecated interfaces. We accept removing such code outright and treat the current data structures and behaviour as the single source of truth; if data ever needs preserving, use a one-off migration script or import tool instead of putting compatibility logic back into the main path.
