# Simplify API Config Model

The API configuration storage model keeps only the fields the runtime needs; it no longer stores a brand-name provider, `isDefault`, `createdAt`, `updatedAt` or other historical metadata. The OpenAI and Anthropic options in the UI are presets used when creating a configuration; the runtime and storage only know protocol families. Deletion now follows "keep at least one configuration" rather than a special default flag. All API requests go through the extension background, and `useBackgroundProxy` is no longer a user setting or a runtime branch.
