/**
 * General-purpose LLM API service
 * with a simple call interface for any feature
 */

import { StorageService } from '../../core/storage';
import { sendApiRequest } from '../utils/requestUtils';
import { mergeCustomParams } from '../utils/apiUtils';
import {
  ApiConfigItem,
  ApiConfig,
  ApiProtocolFamily,
} from '../../shared/types/api';
import { getApiTimeout } from '../../../utils';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  getProtocolFamilyLabel,
  isGeminiFamily,
} from '../../shared/ApiConfigHelpers';

/**
 * Request options
 */
export interface UniversalApiOptions {
  /** System prompt */
  systemPrompt?: string;
  /** Temperature (0-2, default 0.7) */
  temperature?: number;
  /** Maximum output tokens */
  maxTokens?: number;
  /** API configuration id to use */
  configId?: string;
  /** Force a protocol family */
  forceProvider?: ApiProtocolFamily;
  /** Request timeout (ms, default 0 = no limit) */
  timeout?: number;
  /** Custom request parameters as a JSON string */
  customParams?: string;
  /** Whether to return the raw response */
  rawResponse?: boolean;
}

/**
 * Result
 */
export interface UniversalApiResult {
  /** Whether the call succeeded */
  success: boolean;
  /** The prompt sent */
  prompt: string;
  /** The model's response */
  content: string;
  /** Model name */
  model?: string;
  /** Provider name */
  provider?: string;
  /** Token usage */
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  /** Raw API response (when rawResponse=true) */
  rawData?: any;
  /** Error message on failure */
  error?: string;
}

/**
 * General-purpose LLM API service
 */
export class UniversalApiService {
  private static instance: UniversalApiService | null = null;
  private storageService: StorageService;

  private constructor() {
    this.storageService = StorageService.getInstance();
  }

  /**
   * Returns the singleton instance
   */
  static getInstance(): UniversalApiService {
    if (!UniversalApiService.instance) {
      UniversalApiService.instance = new UniversalApiService();
    }
    return UniversalApiService.instance;
  }

  /**
   * Calls the model
   * @param prompt user prompt
   * @param options options
   * @returns result
   */
  async call(
    prompt: string,
    options: UniversalApiOptions = {},
  ): Promise<UniversalApiResult> {
    try {
      // Validate input
      if (!prompt?.trim()) {
        return {
          success: false,
          prompt: prompt || '',
          content: '',
          error: 'The prompt must not be empty',
        };
      }

      // Resolve the API configuration
      const apiConfig = await this.getApiConfig(
        options.configId,
        options.forceProvider,
      );
      if (!apiConfig) {
        return {
          success: false,
          prompt,
          content: '',
          error: 'No usable API configuration found',
        };
      }

      if (isGeminiFamily(apiConfig.protocolFamily)) {
        return await this.callGoogleGemini(prompt, apiConfig, options);
      } else {
        return await this.callHttpApi(prompt, apiConfig, options);
      }
    } catch (error: any) {
      console.error('UniversalApiService call failed:', error);
      return {
        success: false,
        prompt,
        content: '',
        error: error.message || 'Unknown error during the call',
      };
    }
  }

  /**
   * Calls the Google Gemini SDK
   */
  private async callGoogleGemini(
    prompt: string,
    apiConfig: ApiConfigItem,
    options: UniversalApiOptions,
  ): Promise<UniversalApiResult> {
    try {
      const config = apiConfig.config;
      const genAI = new GoogleGenerativeAI(config.apiKey);

      // Base generation config
      const baseGenerationConfig: any = {
        temperature: options.temperature ?? config.temperature ?? 0.7,
      };

      if (options.maxTokens) {
        baseGenerationConfig.maxOutputTokens = options.maxTokens;
      }

      // Merge extra parameters from customParams
      const generationConfig = mergeCustomParams(
        baseGenerationConfig,
        options.customParams || config.customParams,
      );

      // Request options such as timeout and proxy endpoint
      const requestOptions: { timeout?: number; baseUrl?: string } = {};
      const timeout = options.timeout ?? getApiTimeout(0);
      if (timeout && timeout > 0) {
        requestOptions.timeout = timeout;
      }
      if (config.apiEndpoint) {
        requestOptions.baseUrl = config.apiEndpoint;
      }

      const model = genAI.getGenerativeModel(
        {
          model: config.model,
          generationConfig,
        },
        requestOptions,
      );

      // Build the full prompt
      let fullPrompt = prompt;
      if (options.systemPrompt) {
        fullPrompt = `${options.systemPrompt}\n\n${prompt}`;
      }

      console.log('Google Gemini request:', {
        model: config.model,
        prompt: fullPrompt,
        config: generationConfig,
      });

      const result = await model.generateContent(fullPrompt);
      const response = result.response;
      const content = response.text();

      console.log('Google Gemini response:', content);

      // Build the result
      const apiResult: UniversalApiResult = {
        success: true,
        prompt,
        content,
        model: config.model,
        provider: getProtocolFamilyLabel(apiConfig.protocolFamily),
      };

      // Token usage, when available
      if (response.usageMetadata) {
        apiResult.usage = {
          promptTokens: response.usageMetadata.promptTokenCount,
          completionTokens: response.usageMetadata.candidatesTokenCount,
          totalTokens: response.usageMetadata.totalTokenCount,
        };
      }

      // Raw response, when requested
      if (options.rawResponse) {
        apiResult.rawData = {
          candidates: response.candidates,
          usageMetadata: response.usageMetadata,
        };
      }

      return apiResult;
    } catch (error: any) {
      console.error('Google Gemini call failed:', error);
      return {
        success: false,
        prompt,
        content: '',
        error: error.message || 'Google Gemini call failed',
      };
    }
  }

  /**
   * Calls an OpenAI-compatible HTTP API
   */
  private async callHttpApi(
    prompt: string,
    apiConfig: ApiConfigItem,
    options: UniversalApiOptions,
  ): Promise<UniversalApiResult> {
    try {
      // Build the request body
      const requestBody = this.buildRequestBody(
        prompt,
        apiConfig.config,
        options,
      );

      console.log('HTTP API request:', {
        protocolFamily: apiConfig.protocolFamily,
        endpoint: apiConfig.config.apiEndpoint,
        body: requestBody,
      });

      // Send the request
      const response = await this.sendRequest(
        requestBody,
        apiConfig.config,
        options.timeout,
      );

      if (!response.ok) {
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      console.log('HTTP API response:', data);

      // Parse the response
      return this.parseResponse(data, prompt, apiConfig, options.rawResponse);
    } catch (error: any) {
      console.error('HTTP API call failed:', error);
      return {
        success: false,
        prompt,
        content: '',
        error: error.message || 'HTTP API call failed',
      };
    }
  }

  /**
   * Quick call with default options
   * @param prompt prompt
   * @param systemPrompt system prompt (optional)
   * @returns result
   */
  async quickCall(
    prompt: string,
    systemPrompt?: string,
  ): Promise<UniversalApiResult> {
    return this.call(prompt, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 1000,
    });
  }

  /**
   * Chat call
   * @param messages message history
   * @param options options
   * @returns result
   */
  async chat(
    messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>,
    options: UniversalApiOptions = {},
  ): Promise<UniversalApiResult> {
    try {
      const apiConfig = await this.getApiConfig(
        options.configId,
        options.forceProvider,
      );
      if (!apiConfig) {
        return {
          success: false,
          prompt: messages.map((m) => m.content).join('\n'),
          content: '',
          error: 'No usable API configuration found',
        };
      }

      // Build the chat request
      let requestBody: any = {
        model: apiConfig.config.model,
        messages: messages,
        temperature: options.temperature ?? apiConfig.config.temperature ?? 0.7,
      };

      if (options.maxTokens) {
        requestBody.max_tokens = options.maxTokens;
      }

      // Merge custom parameters
      if (options.customParams) {
        requestBody = mergeCustomParams(requestBody, options.customParams);
      } else if (apiConfig.config.customParams) {
        requestBody = mergeCustomParams(
          requestBody,
          apiConfig.config.customParams,
        );
      }

      const response = await this.sendRequest(
        requestBody,
        apiConfig.config,
        options.timeout,
      );

      if (!response.ok) {
        throw new Error(
          `API request failed: ${response.status} ${response.statusText}`,
        );
      }

      const data = await response.json();

      return this.parseResponse(
        data,
        messages[messages.length - 1].content,
        apiConfig,
        options.rawResponse,
      );
    } catch (error: any) {
      return {
        success: false,
        prompt: messages.map((m) => m.content).join('\n'),
        content: '',
        error: error.message || 'Chat call failed',
      };
    }
  }

  /**
   * Whether the API is usable
   * @param configId optional configuration id
   * @returns whether it is usable
   */
  async isAvailable(configId?: string): Promise<boolean> {
    try {
      const apiConfig = await this.getApiConfig(configId);
      return !!apiConfig?.config?.apiKey;
    } catch {
      return false;
    }
  }

  /**
   * Available models
   * @returns model list
   */
  async getAvailableModels(): Promise<
    Array<{ provider: string; model: string }>
  > {
    try {
      const userSettings = await this.storageService.getUserSettings();
      return userSettings.apiConfigs.map((config) => ({
        provider: getProtocolFamilyLabel(config.protocolFamily),
        model: config.config.model,
      }));
    } catch {
      return [];
    }
  }

  /**
   * Resolves the API configuration
   */
  private async getApiConfig(
    configId?: string,
    forceProvider?: ApiProtocolFamily,
  ): Promise<ApiConfigItem | null> {
    const userSettings = await this.storageService.getUserSettings();

    if (configId) {
      return (
        userSettings.apiConfigs.find((config) => config.id === configId) || null
      );
    }

    if (forceProvider) {
      return (
        userSettings.apiConfigs.find(
          (config) => config.protocolFamily === forceProvider,
        ) || null
      );
    }

    // Use the active configuration
    return (
      userSettings.apiConfigs.find(
        (config) => config.id === userSettings.activeApiConfigId,
      ) || null
    );
  }

  /**
   * Builds the request body
   */
  private buildRequestBody(
    prompt: string,
    config: ApiConfig,
    options: UniversalApiOptions,
  ): any {
    const messages = [];

    // System prompt
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt });
    }

    // User prompt
    messages.push({ role: 'user', content: prompt });

    let requestBody: any = {
      model: config.model,
      messages: messages,
      temperature: options.temperature ?? config.temperature ?? 0.7,
    };

    if (options.maxTokens) {
      requestBody.max_tokens = options.maxTokens;
    }

    // Merge custom parameters
    if (options.customParams) {
      requestBody = mergeCustomParams(requestBody, options.customParams);
    } else if (config.customParams) {
      requestBody = mergeCustomParams(requestBody, config.customParams);
    }

    return requestBody;
  }

  /**
   * Sends the API request
   */
  private async sendRequest(
    requestBody: any,
    config: ApiConfig,
    timeout?: number,
  ): Promise<Response> {
    const timeoutMs = timeout ?? 0;
    return await sendApiRequest(requestBody, config, timeoutMs);
  }

  /**
   * Parses the API response
   */
  private parseResponse(
    data: any,
    prompt: string,
    apiConfig: ApiConfigItem,
    rawResponse?: boolean,
  ): UniversalApiResult {
    try {
      let content = '';
      let usage: any = undefined;

      if (isGeminiFamily(apiConfig.protocolFamily)) {
        content = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (data.usageMetadata) {
          usage = {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount,
          };
        }
      } else {
        // OpenAI-compatible format
        content = data.choices?.[0]?.message?.content || '';
        if (data.usage) {
          usage = {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          };
        }
      }

      const result: UniversalApiResult = {
        success: true,
        prompt,
        content,
        model: apiConfig.config.model,
        provider: getProtocolFamilyLabel(apiConfig.protocolFamily),
      };

      // Token usage
      if (usage) {
        result.usage = usage;
      }

      // Raw response, when requested
      if (rawResponse) {
        result.rawData = data;
      }

      return result;
    } catch (_) {
      return {
        success: false,
        prompt,
        content: '',
        error: 'Failed to parse the API response',
      };
    }
  }
}

// Convenience instance and functions
export const universalApi = UniversalApiService.getInstance();

/**
 * Calls the model (global convenience function)
 * @param prompt prompt
 * @param options options
 * @returns result
 */
export async function callAI(
  prompt: string,
  options?: UniversalApiOptions,
): Promise<UniversalApiResult> {
  return universalApi.call(prompt, options);
}

/**
 * Quick model call
 * @param prompt prompt
 * @param systemPrompt system prompt (optional)
 * @returns result
 */
export async function quickAI(
  prompt: string,
  systemPrompt?: string,
): Promise<UniversalApiResult> {
  return universalApi.quickCall(prompt, systemPrompt);
}
