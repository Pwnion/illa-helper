/**
 * Shared utilities:
 * UserLevel helpers, API testing and response parsing
 */

import {
  UserLevel,
  USER_LEVEL_OPTIONS,
  ApiConfig,
  ApiConfigItem,
  ApiProtocolFamily,
} from '../modules/shared/types';
import { adaptForOpenAIReasoningModel } from '../modules/api/utils/openaiReasoning';
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Merges custom parameters into the base parameter object
 * @param baseParams base parameters
 * @param customParamsJson custom parameters as a JSON string
 * @returns merged parameters
 */
function mergeCustomParams(baseParams: any, customParamsJson?: string): any {
  const merged = { ...baseParams };

  // Protected system parameters that may not be overridden
  const protectedKeys = ['model', 'messages', 'apiKey'];

  if (!customParamsJson?.trim()) {
    return merged;
  }

  try {
    const customParams = JSON.parse(customParamsJson);

    // Merge custom parameters, protecting system parameters
    Object.entries(customParams).forEach(([key, value]) => {
      if (!protectedKeys.includes(key)) {
        merged[key] = value;
      } else {
        console.warn(`Ignoring protected parameter: ${key}`);
      }
    });
  } catch (error) {
    console.warn('Failed to parse custom parameter JSON:', error);
  }

  return merged;
}

/**
 * Display name for a UserLevel
 * @param level UserLevel value
 * @returns display name
 */
export function getUserLevelLabel(level: UserLevel): string {
  const option = USER_LEVEL_OPTIONS.find((opt) => opt.value === level);
  return option?.label || 'Unknown';
}

/**
 * Every UserLevel option, for dropdowns and similar
 * @returns UserLevel options
 */
export function getUserLevelOptions() {
  return USER_LEVEL_OPTIONS;
}

/**
 * API test result
 */
export interface ApiTestResult {
  success: boolean;
  message?: string;
  model?: string;
}

/**
 * Returns the API timeout
 * @param baseTimeout base timeout (ms)
 * @returns timeout in ms, or undefined for no timeout when 0
 */
export function getApiTimeout(baseTimeout: number): number | undefined {
  return baseTimeout === 0 ? undefined : baseTimeout;
}

export async function testGeminiConnection(
  apiConfig: ApiConfig,
  baseTimeout?: number,
): Promise<ApiTestResult> {
  if (!apiConfig.apiKey) {
    return { success: false, message: 'API Key is not configured.' };
  }

  try {
    const genAI = new GoogleGenerativeAI(apiConfig.apiKey);

    const baseGenerationConfig: any = {
      temperature: apiConfig.temperature,
    };

    let generationConfig = mergeCustomParams(
      baseGenerationConfig,
      apiConfig.customParams,
    );

    // Adapt parameters
    generationConfig = mapParamsForProvider(generationConfig, 'gemini');

    const requestOptions: { timeout?: number; baseUrl?: string } = {};
    const timeout = getApiTimeout(baseTimeout || 0);
    if (timeout) {
      requestOptions.timeout = timeout;
    }
    if (apiConfig.apiEndpoint) {
      requestOptions.baseUrl = apiConfig.apiEndpoint;
    }

    const model = genAI.getGenerativeModel(
      {
        model: apiConfig.model,
        generationConfig,
      },
      requestOptions,
    );

    const result = await model.generateContent(
      'Hello, this is a connection test. Please respond with "OK".',
    );
    const response = result.response;
    const text = response.text();

    if (text.includes('OK')) {
      return {
        success: true,
        message: 'Connection successful.',
        model: apiConfig.model,
      };
    } else {
      return { success: false, message: 'Received an unexpected response.' };
    }
  } catch (error: any) {
    console.error('Gemini connection test failed:', error);
    return {
      success: false,
      message: error.message || 'An unknown error occurred.',
    };
  }
}

/**
 * API connection test entry point.
 * Picks the right test for the protocol family.
 * @param userConfig the user's API configuration
 * @param baseTimeout timeout (ms)
 * @returns Promise<ApiTestResult> test result
 */
export async function testApiConnection(
  userConfig: ApiConfigItem,
  baseTimeout?: number,
): Promise<ApiTestResult> {
  const { protocolFamily, config } = userConfig;

  switch (protocolFamily) {
    case ApiProtocolFamily.GEMINI:
      return testGeminiConnection(config, baseTimeout);
    case ApiProtocolFamily.OPENAI_COMPATIBLE:
      return testOpenAICompatibleConnection(config, baseTimeout);
    default:
      return {
        success: false,
        message: `Unsupported API protocol family: ${protocolFamily}`,
      };
  }
}

/**
 * Tests an OpenAI-compatible API connection
 * @param apiConfig API configuration
 * @param baseTimeout timeout (ms)
 * @returns Promise<ApiTestResult> test result
 */
export async function testOpenAICompatibleConnection(
  apiConfig: ApiConfig,
  baseTimeout?: number,
): Promise<ApiTestResult> {
  if (!apiConfig.apiKey || !apiConfig.apiEndpoint) {
    return {
      success: false,
      message: 'API Key or Endpoint is not configured.',
    };
  }

  try {
    let requestBody: any = {
      model: apiConfig.model,
      temperature: apiConfig.temperature,
      messages: [
        {
          role: 'user',
          content:
            'Hello, this is a connection test. Please respond with "OK" and output JSON format.',
        },
      ],
      max_tokens: 10,
    };

    // Only send enable_thinking when the configuration allows it
    if (apiConfig.includeThinkingParam) {
      requestBody.enable_thinking = apiConfig.enable_thinking;
    }

    // Merge custom parameters
    requestBody = mergeCustomParams(requestBody, apiConfig.customParams);

    const response = await sendOpenAICompatibleTestRequest(
      requestBody,
      apiConfig,
      getApiTimeout(baseTimeout || 0) || 0,
    );

    if (response.ok) {
      const data = await response.json();

      return {
        success: true,
        message: `status: ${response.status}`,
        model: data.model || apiConfig.model,
      };
    } else {
      const errorData = await response.json().catch(() => null);
      let errorMessage = `HTTP ${response.status}: ${response.statusText}`;

      if (errorData?.error?.message) {
        errorMessage = errorData.error.message;
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      }

      return {
        success: false,
        message: errorMessage,
      };
    }
  } catch (error: any) {
    return {
      success: false,
      message: error.message || 'Network error',
    };
  }
}

function sendOpenAICompatibleTestRequest(
  requestBody: any,
  apiConfig: ApiConfig,
  timeout: number,
): Promise<Response> {
  return new Promise<Response>((resolve) => {
    browser.runtime.sendMessage(
      {
        type: 'api-request',
        data: {
          url: apiConfig.apiEndpoint,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiConfig.apiKey}`,
          },
          body: JSON.stringify(
            adaptForOpenAIReasoningModel(requestBody, apiConfig.apiEndpoint),
          ),
          timeout,
        },
      },
      (response) => {
        if (response.success) {
          resolve({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => response.data,
          } as Response);
          return;
        }

        resolve({
          ok: false,
          status: response.error?.status || 500,
          statusText: response.error?.statusText || 'Internal Server Error',
          json: async () => ({ error: response.error }),
        } as Response);
      },
    );
  });
}

/**
 * Strips Markdown formatting from an AI response
 * @param content raw AI output
 * @returns cleaned string
 */
export function cleanMarkdownFromResponse(content: string): string {
  if (!content || typeof content !== 'string') {
    return content;
  }

  // Remove Markdown code fences
  let cleaned = content.trim();

  // Leading ```json or ```
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');

  // Trailing ```
  cleaned = cleaned.replace(/\n?\s*```\s*$/i, '');

  // Other possible fence forms
  cleaned = cleaned.replace(/^\s*```[\s\S]*?\n/, ''); // leading fence
  cleaned = cleaned.replace(/\n```\s*$/, ''); // trailing fence

  // Trim surrounding whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

/**
 * Sets an element's HTML safely, avoiding Firefox's innerHTML warning,
 * by parsing with DOMParser instead of assigning innerHTML
 * @param element target element
 * @param htmlContent HTML string
 * @returns whether it succeeded
 */
export function safeSetInnerHTML(
  element: HTMLElement,
  htmlContent: string,
): boolean {
  if (!element || htmlContent == null) {
    return false;
  }

  try {
    const parser = new DOMParser();
    const parsed = parser.parseFromString(htmlContent, 'text/html');

    // Empty the target element
    element.textContent = '';

    // Move the parsed content into the target element
    const bodyContent = parsed.body;
    if (bodyContent) {
      // Move every child of the parsed body
      while (bodyContent.firstChild) {
        element.appendChild(bodyContent.firstChild);
      }
    }

    return true;
  } catch (error) {
    console.error('Failed to set HTML content:', error);
    return false;
  }
}

/**
 * Extracts and parses JSON from a string that may contain a Markdown code block.
 * @param text raw string containing JSON
 * @returns the parsed object
 * @throws if no valid JSON can be extracted
 */
export function extractAndParseJson(text: string): any {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: text must be a non-empty string.');
  }

  // Match a JSON code block
  const jsonBlockMatch = text.match(/```(json)?\s*([\s\S]+?)\s*```/);

  let jsonString;
  if (jsonBlockMatch && jsonBlockMatch[2]) {
    // Take the JSON from the code block
    jsonString = jsonBlockMatch[2];
  } else {
    // Without a code block, assume the whole string is JSON:
    // try the content between the first '{' and the last '}'
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      jsonString = text.substring(firstBrace, lastBrace + 1);
    } else {
      jsonString = text; // last resort
    }
  }

  try {
    // Clean and parse
    return JSON.parse(jsonString.trim());
  } catch (error) {
    console.error('Failed to parse JSON:', error);
    console.error('Original text:', text);
    console.error('Extracted JSON string:', jsonString);
    throw new Error('The response does not contain valid JSON.');
  }
}

/**
 * Maps OpenAI-style parameters to a specific provider's format (e.g. Google Gemini).
 * @param params OpenAI-style parameters
 * @param provider target provider identifier ('gemini', ...)
 * @returns parameters for the target provider
 */
export function mapParamsForProvider(params: any, provider: 'gemini'): any {
  if (provider !== 'gemini') {
    return params; // only Gemini is mapped for now
  }

  const mapping: { [key: string]: string } = {
    max_tokens: 'maxOutputTokens',
    top_p: 'topP',
    stop: 'stopSequences',
    frequency_penalty: 'frequencyPenalty',
    presence_penalty: 'presencePenalty',
  };

  const mappedParams: { [key: string]: any } = {};

  for (const key in params) {
    if (Object.prototype.hasOwnProperty.call(params, key)) {
      const mappedKey = mapping[key] || key;
      mappedParams[mappedKey] = params[key];
    }
  }

  // stopSequences must be an array of strings
  if (
    mappedParams.stopSequences &&
    !Array.isArray(mappedParams.stopSequences)
  ) {
    mappedParams.stopSequences = [String(mappedParams.stopSequences)];
  }

  return mappedParams;
}
