import JSZip from 'jszip';

export type GenerationSettings = {
  prompt: string;
  negativePrompt: string;
  characterPrompt?: string;
  width: number;
  height: number;
  steps: number;
  seed: number;
  spendAnlas: boolean;
};

const endpoint = 'https://image.novelai.net/ai/generate-image';
const freeWidth = 832;
const freeHeight = 1216;

function assertSettings(settings: GenerationSettings) {
  const maxSteps = settings.spendAnlas ? 50 : 28;
  if (!Number.isInteger(settings.steps) || settings.steps < 1 || settings.steps > maxSteps) {
    throw new Error(`Допустимо от 1 до ${maxSteps} шагов.`);
  }
  if (!settings.spendAnlas && (settings.width !== freeWidth || settings.height !== freeHeight)) {
    throw new Error('Бесплатный Opus: только Normal 832×1216.');
  }
  if (!Number.isInteger(settings.width) || !Number.isInteger(settings.height) || settings.width < 64 || settings.height < 64) {
    throw new Error('Укажите корректный Normal-размер изображения.');
  }
}

export async function generateImage(token: string, settings: GenerationSettings) {
  assertSettings(settings);
  const seed = settings.seed === -1 ? Math.floor(Math.random() * 4294967295) : settings.seed;
  const charCaptions = settings.characterPrompt?.trim()
    ? [{ char_caption: settings.characterPrompt.trim(), centers: [{ x: 0.5, y: 0.5 }] }]
    : [];
  const body = {
    input: settings.prompt,
    model: 'nai-diffusion-4-5-full',
    action: 'generate',
    parameters: {
      width: settings.width, height: settings.height, scale: 7, sampler: 'k_dpmpp_sde',
      steps: settings.steps, n_samples: 1, ucPreset: 3, qualityToggle: true, cfg_rescale: 0.18,
      noise_schedule: 'karras', skip_cfg_above_sigma: 58, seed, params_version: 3,
      negative_prompt: settings.negativePrompt,
      v4_prompt: { caption: { base_caption: settings.prompt, char_captions: charCaptions }, use_coords: false, use_order: true },
      v4_negative_prompt: { caption: { base_caption: settings.negativePrompt, char_captions: [] }, use_coords: false, use_order: true },
    },
  };
  const response = await fetch(endpoint, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!response.ok) {
    const messages: Record<number, string> = {
      401: 'Токен NovelAI недействителен или истёк (401).', 402: 'Недостаточно Anlas или доступ к Opus недоступен (402).', 429: 'Слишком много запросов. Подождите и повторите (429).',
    };
    throw new Error(messages[response.status] || `NovelAI вернул ${response.status}.`);
  }
  const zip = await JSZip.loadAsync(await response.arrayBuffer());
  const file = Object.values(zip.files).find((entry) => /\.(png|webp)$/i.test(entry.name));
  if (!file) throw new Error('NovelAI вернул ZIP без изображения.');
  return { base64: await file.async('base64'), seed, model: 'nai-diffusion-4-5-full', extension: file.name.split('.').pop()?.toLowerCase() === 'webp' ? 'webp' : 'png' };
}
