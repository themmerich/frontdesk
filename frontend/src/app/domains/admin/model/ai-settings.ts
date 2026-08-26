/**
 * The tenant's AI access as the settings page sees it. Only whether a key is stored, never the
 * key: once saved it leaves the server towards Anthropic and nowhere else.
 */
export type AiSettings = {
  ownKey: boolean;
};

/** The answer to trying a key out; a rejected key is a result, not an error. */
export type ApiKeyTestResult = {
  success: boolean;
  message: string;
};
