/**
 * Phonetic provider factory.
 *
 * Only creates providers that actually return phonetics. AI definitions belong
 * to the translation module and no longer pose as an IPhoneticProvider.
 */

import { IPhoneticProvider } from './IPhoneticProvider';
import { DictionaryApiProvider } from './DictionaryApiProvider';

export class PhoneticProviderFactory {
  private static defaultProvider: IPhoneticProvider | null = null;

  static createProvider(): IPhoneticProvider {
    if (!this.defaultProvider) {
      this.defaultProvider = new DictionaryApiProvider();
    }

    return this.defaultProvider;
  }

  static getDefaultProvider(): IPhoneticProvider {
    return this.createProvider();
  }

  static clearInstances(): void {
    this.defaultProvider = null;
  }
}
