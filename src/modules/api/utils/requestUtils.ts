/**
 * Request helpers
 */

import { ApiConfig } from '../../shared/types/api';
import { BackgroundProxyResponse } from '../types';
import { adaptForOpenAIReasoningModel } from './openaiReasoning';

/**
 * Sends an API request.
 * Extension pages may run inside HTTPS page contexts, so every request goes through the background to avoid mixed-content and CORS divergence.
 */
export async function sendApiRequest(
  requestBody: any,
  apiConfig: ApiConfig,
  timeout: number = 0,
): Promise<Response> {
  return sendViaBackground(requestBody, apiConfig, timeout);
}

/**
 * Sends the request through the background proxy
 */
async function sendViaBackground(
  requestBody: any,
  apiConfig: ApiConfig,
  timeout: number,
): Promise<Response> {
  return new Promise((resolve) => {
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
          timeout: timeout,
        },
      },
      (response: BackgroundProxyResponse) => {
        if (response.success) {
          const mockResponse = {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => response.data,
          } as Response;
          resolve(mockResponse);
        } else {
          const mockResponse = {
            ok: false,
            status: response.error?.status || 500,
            statusText: response.error?.statusText || 'Internal Server Error',
            json: async () => ({ error: response.error }),
          } as Response;
          resolve(mockResponse);
        }
      },
    );
  });
}
