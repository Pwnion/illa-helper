<template>
  <div class="space-y-6">
    <!-- Selection -->
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 class="text-2xl font-bold text-foreground">
            {{ $t('sentenceMode.title') }}
          </h2>
        </CardTitle>
        <p class="text-sm text-muted-foreground">
          {{ $t('sentenceMode.description') }}
        </p>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="space-y-2">
          <Label for="max-new-words">
            {{ $t('sentenceMode.maxNewWords') }}
          </Label>
          <p class="text-xs text-muted-foreground">
            {{ $t('sentenceMode.maxNewWordsHint') }}
          </p>
          <Input
            id="max-new-words"
            type="number"
            min="0"
            max="10"
            class="max-w-[8rem]"
            :model-value="config.maxNewWords"
            @update:model-value="config.maxNewWords = Number($event)"
          />
        </div>

        <div class="space-y-2 border-t border-border pt-6">
          <Label for="cold-start">
            {{ $t('sentenceMode.coldStartLevel') }}
          </Label>
          <p class="text-xs text-muted-foreground">
            {{ $t('sentenceMode.coldStartLevelHint') }}
          </p>
          <Select
            :model-value="String(config.coldStartLevel)"
            @update:model-value="config.coldStartLevel = Number($event)"
          >
            <SelectTrigger id="cold-start" class="max-w-[16rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="0">
                {{ $t('sentenceMode.noColdStart') }}
              </SelectItem>
              <SelectItem
                v-for="(label, index) in CEFR_LEVELS"
                :key="label"
                :value="String(index + 1)"
              >
                {{ label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div class="space-y-2 border-t border-border pt-6">
          <Label for="page-cap">
            {{ $t('sentenceMode.pageCap') }} ({{
              config.pageCap >= 1
                ? $t('sentenceMode.noCap')
                : `${Math.round(config.pageCap * 100)}%`
            }})
          </Label>
          <p class="text-xs text-muted-foreground">
            {{ $t('sentenceMode.pageCapHint') }}
          </p>
          <Slider
            id="page-cap"
            :model-value="[config.pageCap]"
            @update:model-value="config.pageCap = ($event || [1])[0]"
            :min="0"
            :max="1"
            :step="0.05"
            class="max-w-[50%]"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Grammar -->
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 class="text-xl font-bold text-foreground">
            {{ $t('sentenceMode.grammarTitle') }}
          </h2>
        </CardTitle>
        <p class="text-sm text-muted-foreground">
          {{ $t('sentenceMode.grammarHint') }}
        </p>
      </CardHeader>
      <CardContent class="space-y-4">
        <div class="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" @click="setGrammar(BEGINNER)">
            {{ $t('sentenceMode.beginnerDefaults') }}
          </Button>
          <Button variant="outline" size="sm" @click="setGrammar(ALL_TAGS)">
            {{ $t('sentenceMode.unlockAll') }}
          </Button>
          <Button variant="outline" size="sm" @click="setGrammar([])">
            {{ $t('sentenceMode.lockAll') }}
          </Button>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <label
            v-for="tag in GRAMMAR_TAGS"
            :key="tag.id"
            class="flex items-start gap-2 rounded-md border border-border p-2 text-sm cursor-pointer hover:bg-muted/50"
          >
            <input
              type="checkbox"
              class="mt-1"
              :checked="config.unlockedGrammar.includes(tag.id)"
              @change="
                toggleTag(tag.id, ($event.target as HTMLInputElement).checked)
              "
            />
            <span>
              <span class="font-medium">{{ tag.label }}</span>
              <span class="block text-xs text-muted-foreground">
                {{ tag.example }}
              </span>
            </span>
          </label>
        </div>
      </CardContent>
    </Card>

    <!-- Learning -->
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 class="text-xl font-bold text-foreground">
            {{ $t('sentenceMode.learningTitle') }}
          </h2>
        </CardTitle>
        <p class="text-sm text-muted-foreground">
          {{ $t('sentenceMode.learningHint') }}
        </p>
      </CardHeader>
      <CardContent class="grid gap-6 sm:grid-cols-3">
        <div class="space-y-2">
          <Label for="exposures">
            {{ $t('sentenceMode.exposuresToKnow') }}
          </Label>
          <Input
            id="exposures"
            type="number"
            min="1"
            max="100"
            :model-value="config.exposuresToKnow"
            @update:model-value="config.exposuresToKnow = Number($event)"
          />
        </div>
        <div class="space-y-2">
          <Label for="min-dwell">{{ $t('sentenceMode.minDwellMs') }}</Label>
          <Input
            id="min-dwell"
            type="number"
            min="0"
            step="100"
            :model-value="config.minDwellMs"
            @update:model-value="config.minDwellMs = Number($event)"
          />
        </div>
        <div class="space-y-2">
          <Label for="dwell-per-word">
            {{ $t('sentenceMode.dwellMsPerWord') }}
          </Label>
          <Input
            id="dwell-per-word"
            type="number"
            min="0"
            step="50"
            :model-value="config.dwellMsPerWord"
            @update:model-value="config.dwellMsPerWord = Number($event)"
          />
        </div>
      </CardContent>
    </Card>

    <!-- Requests and cache -->
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 class="text-xl font-bold text-foreground">
            {{ $t('sentenceMode.requestsTitle') }}
          </h2>
        </CardTitle>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="space-y-2">
          <Label for="batch-chars">{{ $t('sentenceMode.batchChars') }}</Label>
          <p class="text-xs text-muted-foreground">
            {{ $t('sentenceMode.batchCharsHint') }}
          </p>
          <Input
            id="batch-chars"
            type="number"
            min="200"
            max="8000"
            step="100"
            class="max-w-[10rem]"
            :model-value="config.batchChars"
            @update:model-value="config.batchChars = Number($event)"
          />
        </div>
        <div
          class="flex flex-wrap items-center gap-3 border-t border-border pt-6"
        >
          <span class="text-sm text-muted-foreground">
            {{ $t('sentenceMode.cachedAnalyses', { count: cachedCount }) }}
          </span>
          <Button variant="outline" size="sm" @click="clearCache">
            {{ $t('sentenceMode.clearCache') }}
          </Button>
        </div>
      </CardContent>
    </Card>

    <!-- Known words -->
    <Card>
      <CardHeader>
        <CardTitle>
          <h2 class="text-xl font-bold text-foreground">
            {{ $t('sentenceMode.knownWordsTitle', { language: targetName }) }}
          </h2>
        </CardTitle>
        <p class="text-sm text-muted-foreground">
          {{ $t('sentenceMode.knownWordsHint') }}
        </p>
      </CardHeader>
      <CardContent class="space-y-6">
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div
            v-for="status in LEMMA_STATUSES"
            :key="status"
            class="rounded-md border border-border p-3"
          >
            <div class="text-2xl font-semibold">{{ counts[status] }}</div>
            <div class="text-xs text-muted-foreground">
              {{ $t(`sentenceMode.status.${status}`) }}
            </div>
          </div>
        </div>

        <div class="space-y-2 border-t border-border pt-6">
          <Label for="import-words">{{ $t('sentenceMode.import') }}</Label>
          <p class="text-xs text-muted-foreground">
            {{ $t('sentenceMode.importHint') }}
          </p>
          <Textarea
            id="import-words"
            rows="5"
            class="font-mono text-sm"
            :placeholder="'katt\nhund\tlearning\ntycka om\tunknown'"
            :model-value="importText"
            @update:model-value="importText = $event as string"
          />
          <div class="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              :disabled="!importText.trim()"
              @click="importWords"
            >
              {{ $t('sentenceMode.importButton') }}
            </Button>
            <input
              ref="fileInput"
              type="file"
              accept=".txt,.csv,.json,.tsv,text/plain,text/csv,application/json"
              class="hidden"
              @change="readImportFile"
            />
            <Button variant="outline" size="sm" @click="fileInput?.click()">
              {{ $t('sentenceMode.importFile') }}
            </Button>
          </div>
        </div>

        <div
          class="flex flex-wrap items-center gap-2 border-t border-border pt-6"
        >
          <Button variant="outline" size="sm" @click="exportWords('csv')">
            {{ $t('sentenceMode.exportCsv') }}
          </Button>
          <Button variant="outline" size="sm" @click="exportWords('json')">
            {{ $t('sentenceMode.exportJson') }}
          </Button>
          <Button variant="destructive" size="sm" @click="resetWords">
            {{ $t('sentenceMode.reset') }}
          </Button>
        </div>
      </CardContent>
    </Card>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { StorageService } from '@/src/modules/core/storage';
import { languageService } from '@/src/modules/core/translation/LanguageService';
import { UserSettings } from '@/src/modules/shared/types/storage';
import { DEFAULT_SETTINGS } from '@/src/modules/shared/constants/defaults';
import {
  BEGINNER_GRAMMAR,
  GRAMMAR_TAG_IDS,
  GRAMMAR_TAGS,
  type GrammarTagId,
} from '@/src/modules/sentence/grammar';
import { normalizeSentenceModeConfig } from '@/src/modules/sentence/config';
import { LEMMA_STATUSES, type LemmaRecord } from '@/src/modules/sentence/types';
import {
  countByStatus,
  parseVocabularyImport,
  vocabularyToCsv,
  vocabularyToJson,
} from '@/src/modules/sentence/vocabulary';
import { SentenceStore } from '@/src/modules/sentence/store/SentenceStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CEFR_LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const BEGINNER = [...BEGINNER_GRAMMAR];
const ALL_TAGS = [...GRAMMAR_TAG_IDS];

const { t } = useI18n();
const emit = defineEmits<{ saveMessage: [message: string] }>();

const storageService = StorageService.getInstance();
const store = new SentenceStore();

const settings = ref<UserSettings>({
  ...DEFAULT_SETTINGS,
  sentenceMode: normalizeSentenceModeConfig(undefined),
});
const loaded = ref(false);
const records = ref<LemmaRecord[]>([]);
const cachedCount = ref(0);
const importText = ref('');
const fileInput = ref<HTMLInputElement | null>(null);

const config = computed(() => settings.value.sentenceMode);
const targetLanguage = computed(
  () => settings.value.multilingualConfig.targetLanguage,
);
const targetName = computed(
  () =>
    languageService.getLanguage(targetLanguage.value)?.name ??
    targetLanguage.value,
);
const counts = computed(() => countByStatus(records.value));

onMounted(async () => {
  settings.value = await storageService.getUserSettings();
  loaded.value = true;
  await refresh();
});

watch(
  settings,
  async (newSettings) => {
    if (!loaded.value) return;
    newSettings.sentenceMode = normalizeSentenceModeConfig(
      newSettings.sentenceMode,
    );
    await storageService.saveUserSettings(newSettings);
    emit('saveMessage', t('settings.save'));
    browser.runtime.sendMessage({
      type: 'settings_updated',
      settings: newSettings,
    });
  },
  { deep: true },
);

async function refresh(): Promise<void> {
  records.value = await store.listLemmas(targetLanguage.value);
  cachedCount.value = await store.countAnalyses();
}

function setGrammar(tags: GrammarTagId[]): void {
  config.value.unlockedGrammar = [...tags];
}

function toggleTag(tag: GrammarTagId, enabled: boolean): void {
  const tags = new Set(config.value.unlockedGrammar);
  if (enabled) tags.add(tag);
  else tags.delete(tag);
  config.value.unlockedGrammar = GRAMMAR_TAG_IDS.filter((id) => tags.has(id));
}

async function clearCache(): Promise<void> {
  await store.clearAnalyses();
  await refresh();
  emit('saveMessage', t('sentenceMode.cacheCleared'));
}

async function importWords(): Promise<void> {
  const items = parseVocabularyImport(importText.value);
  const count = await store.importLemmas(targetLanguage.value, items);
  importText.value = '';
  await refresh();
  emit('saveMessage', t('sentenceMode.imported', { count }));
}

async function readImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  importText.value = await file.text();
  input.value = '';
}

function exportWords(format: 'csv' | 'json'): void {
  const content =
    format === 'csv'
      ? vocabularyToCsv(records.value)
      : vocabularyToJson(records.value);
  const blob = new Blob([content], {
    type: format === 'csv' ? 'text/csv' : 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `known-words-${targetLanguage.value}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}

async function resetWords(): Promise<void> {
  if (
    !confirm(t('sentenceMode.resetConfirm', { language: targetName.value }))
  ) {
    return;
  }
  await store.resetLemmas(targetLanguage.value);
  await refresh();
}
</script>
