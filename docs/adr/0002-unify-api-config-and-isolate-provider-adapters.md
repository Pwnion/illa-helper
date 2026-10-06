# Unify API Config And Isolate Provider Adapters

The project keeps a single user-level API configuration model; the settings page, storage layer and runtime configuration all work with that one model. The runtime only recognises two protocol families, `openai-compatible` and `gemini`. OpenAI and Anthropic are UI presets for OpenAI-compatible endpoints, and ProxyGemini was folded back into Gemini. Protocol differences live only in the adapter layer and must not spread into the UI, storage fix-ups, connection tests or the main business path.
