import type { LocaleCode } from '@shared/types.js';

type FeatureTranslationMap = Record<string, { ru: string }>;

const FEATURE_TRANSLATIONS: FeatureTranslationMap = {
  'the task is important today': {
    ru: 'задача сегодня особенно важна'
  },
  'the task can be more relaxed today': {
    ru: 'эту задачу можно сделать более спокойно'
  },
  'it matches your usual routine': {
    ru: 'это соответствует твоему привычному расписанию'
  },
  'it changes the usual routine': {
    ru: 'это немного меняет привычный распорядок'
  },
  'it fits your energy level at that time': {
    ru: 'это подходило под твой уровень энергии в это время'
  },
  'you might feel sleepy at that time': {
    ru: 'в это время ты можешь чувствовать сонливость'
  },
  'a deadline is getting closer': {
    ru: 'срок выполнения уже близко'
  },
  'there is no rush from deadlines': {
    ru: 'пока нет спешки из-за дедлайнов'
  },
  'it follows a similar activity': {
    ru: 'оно идёт вслед за похожим занятием'
  },
  'switching from another activity may be harder': {
    ru: 'переключаться с другого занятия может быть сложнее'
  },
  'it keeps the rest of the day lighter': {
    ru: 'так остальная часть дня будет легче'
  },
  'other parts of the day are already busy': {
    ru: 'другие части дня уже заняты делами'
  },
  'it lines up with meal time': {
    ru: 'это совпадает со временем приёма пищи'
  },
  'it keeps time free for meals': {
    ru: 'это оставляет достаточно времени на еду'
  },
  'it fits around the school day': {
    ru: 'это удобно вписывалось в школьный день'
  },
  'it avoids school lesson time': {
    ru: 'это не мешает школьным урокам'
  },
  'it respects your sleep schedule': {
    ru: 'это не нарушает твой режим сна'
  },
  'it would interrupt your sleep time': {
    ru: 'это может помешать твоему сну'
  },
  'it helps hit your activity goal': {
    ru: 'это помогает выполнить твою цель по активности'
  },
  'you already met the activity goal': {
    ru: 'цель по активности уже выполнена'
  },
  'it keeps the plan balanced': {
    ru: 'сохранить сбалансированный день'
  }
};

export function translateFeatureSummary(summary: string, locale: LocaleCode): string {
  const translation = FEATURE_TRANSLATIONS[summary];
  if (!translation) return summary;
  return translation[locale] ?? summary;
}

export { FEATURE_TRANSLATIONS };
