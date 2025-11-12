import type { TaskCategory } from '@shared/types.js';

// RU-only паттерны (окончательная модель)
const SPORT_TERMS =
  /\b(велоспорт|велотренаж|бег|трениров|спортзал|футбол|баскетбол|волейбол|плавани|теннис|бокс|карате|велосипед|кардио)\b/i;
const WALK_TERMS = /прогул|гуля|парк|сквер|на улице|во дворе/i;
const WORKOUT_GUARD = /\b(кардио|силов|тренажёр|интервал|спринт|зал)\b/i;
const GAMES_TERMS = /игра?(ть)?|cs\b|дота|майнкрафт|роблокс|консоль/i;
const RELAX_TERMS = /расслаб|медитац|дыхани|йога|растяж|отдых|сон(?!ц)/i;
const OUTDOOR_TERMS = /парк|сквер|велопрогул|поход|на улице|площадк|на свеж/i;

interface TaskLike {
  title: string;
  description?: string;
}

interface CategoryRule {
  category: TaskCategory;
  patterns: RegExp[];
  excludes?: RegExp[];
  confidence: number;
}

function normalizeTaskText(task: TaskLike): string {
  return `${task.title ?? ''} ${task.description ?? ''}`
    .replace(/[ёЁ]/g, 'е')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function matchRules(text: string, rules: CategoryRule[]): { label: TaskCategory; confidence: number } | null {
  for (const rule of rules) {
    const matches = rule.patterns.some((pattern) => pattern.test(text));
    if (!matches) continue;
    if (rule.excludes && rule.excludes.some((pattern) => pattern.test(text))) {
      continue;
    }
    return { label: rule.category, confidence: rule.confidence };
  }
  return null;
}

const STRONG_RULES: CategoryRule[] = [
  {
    category: 'Learning',
    confidence: 0.95,
    patterns: [
      /домашн(яя|ее|ие)\s*(работа|задани)/i,
      /дз\b/i,
      /урок/i,
      /учеб/i,
      /школ/i,
      /матем/i,
      /экзам/i,
      /подготовк[аи]/i,
      /англ/i,
      /язык/i,
      /грамматика/i,
      /подготовка к школе/i,
      /учить/i
    ]
  },
  {
    category: 'Sport activity',
    confidence: 0.92,
    patterns: [
      /фитнес/i,
      /трениров/i,
      /кардио/i,
      /бег/i,
      /плав/i,
      /футбол/i,
      /теннис/i,
      /баскетбол/i,
      /велотренаж/i,
      /отрезк/i,
      /зарядк/i,
      /спорт/i,
      /секц/i,
      /зал\b/i
    ],
    excludes: [/растяж/i, /йог/i]
  },
  {
    category: 'Outdoor Play',
    confidence: 0.9,
    patterns: [
      /прогул/i,
      /гуля/i,
      /парк/i,
      /детск.+площад/i,
      /велосипед/i,
      /самокат/i,
      /скейт/i,
      /поход/i,
      /катани[ея]/i,
      /пикник/i,
      /на свежем воздухе/i,
      /на улице/i,
      /качел/i
    ]
  },
  {
    category: 'Creative',
    confidence: 0.88,
    patterns: [
      /музык/i,
      /пианино|фортепиано/i,
      /гитар/i,
      /скрип/i,
      /рисов/i,
      /дизайн/i,
      /поделк/i,
      /творч/i,
      /поэз|стих/i,
      /сочин/i,
      /петь|хор/i,
      /оркестр/i,
      /фото/i,
      /анимац/i,
      /кружок/i
    ]
  },
  {
    category: 'Relaxing',
    confidence: 0.9,
    patterns: [
      /отдых/i,
      /медитац/i,
      /дыхани/i,
      /растяж/i,
      /йог(?!а для соревн)/i,
      /читать(?! отч[её]т|доклад|учеб)/i,
      /книга(?! по учебе)/i,
      /кино/i,
      /сериал/i,
      /сон/i,
      /релакс/i
    ],
    excludes: [/учеб|курс|матем/i]
  },
  {
    category: 'Games',
    confidence: 0.92,
    patterns: [GAMES_TERMS, /консоль/i, /компьютер.*игр/i]
  },
  {
    category: 'Healthcare',
    confidence: 0.9,
    patterns: [
      /завтрак|обед|ужин|полдник/i,
      /поесть|еда|при[её]м пищи/i,
      /врач|педиатр/i,
      /стоматолог/i,
      /клиник/i,
      /больниц/i,
      /терап/i,
      /здоров/i,
      /витамин/i,
      /привив/i,
      /массаж/i,
      /сон\b/i,
      /приём у/i,
      /готовить/i,
      /пообедать|поужинать/i
    ]
  },
  {
    category: 'Household',
    confidence: 0.88,
    patterns: [
      /убор/i,
      /пылесос/i,
      /посуд/i,
      /стирк/i,
      /организ|гардер/i,
      /домашн(ие)? дела/i,
      /готовк(?! урок)/i,
      /по дому/i,
      /кормить питомцев/i,
      /полить цветы/i,
      /починить/i,
      /ремонт/i
    ]
  },
  {
    category: 'Admin/Errands',
    confidence: 0.88,
    patterns: [
      /магазин|закуп/i,
      /купить/i,
      /поручени/i,
      /банк/i,
      /оплат/i,
      /счет|налог/i,
      /документ/i,
      /паспорт/i,
      /почт[аы]/i,
      /мфц/i,
      /собес|госусл/i,
      /страхов/i,
      /запись в/i,
      /дела\b/i
    ]
  },
  {
    category: 'Social',
    confidence: 0.85,
    patterns: [
      /встре?ч/i,
      /друз/i,
      /звон/i,
      /вечерин/i,
      /сем(ья|ей)/i,
      /родител/i,
      /общен/i,
      /чат/i,
      /свидан/i,
      /командный/i,
      /кофе/i
    ]
  },
  {
    category: 'Deep work',
    confidence: 0.84,
    patterns: [
      /проект/i,
      /исслед/i,
      /анализ/i,
      /разработ|программ/i,
      /сконцентр/i,
      /отчёт/i,
      /презентац/i,
      /стратег/i,
      /планирован/i,
      /доклад/i,
      /диплом/i,
      /архитект/i
    ]
  },
  {
    category: 'Commute',
    confidence: 0.85,
    patterns: [
      /дорог[ае]/i,
      /поездк/i,
      /ехать/i,
      /поезд/i,
      /автобус/i,
      /метро/i,
      /перел[её]т/i,
      /трасс/i,
      /пробк/i,
      /велопоездка/i,
      /дорога в школу|дорога на работу/i,
      /транспорт/i
    ]
  }
];

const SUPPORT_RULES: CategoryRule[] = [
  {
    category: 'Learning',
    confidence: 0.78,
    patterns: [/учеб/i, /курс/i, /подготовк/i, /матем/i, /заняти/i]
  },
  {
    category: 'Sport activity',
    confidence: 0.76,
    patterns: [/спорт/i, /трен/i, /зарядк/i, /упражн/i, /физкультур/i]
  },
  {
    category: 'Relaxing',
    confidence: 0.74,
    patterns: [/отдых/i, /сон/i, /почитать/i, /телевизор/i],
    excludes: [/учеб|курс/i]
  },
  {
    category: 'Games',
    confidence: 0.75,
    patterns: [GAMES_TERMS, /компьютер/i]
  },
  {
    category: 'Healthcare',
    confidence: 0.76,
    patterns: [/здоров/i, /самочувств/i, /сон/i, /еда|питани/i, /витамин/i]
  },
  {
    category: 'Household',
    confidence: 0.72,
    patterns: [/домов/i, /дела по дому/i, /порядок/i, /организ/i]
  },
  {
    category: 'Admin/Errands',
    confidence: 0.72,
    patterns: [/дела/i, /оформ/i, /банк/i, /плат[еи]/i, /поручени/i]
  },
  {
    category: 'Creative',
    confidence: 0.72,
    patterns: [/творч/i, /рисов/i, /муз/i, /петь/i, /искусств/i]
  },
  {
    category: 'Social',
    confidence: 0.7,
    patterns: [/общен/i, /встр/i, /друз/i, /команд/i, /сем/i, /беседа/i]
  },
  {
    category: 'Outdoor Play',
    confidence: 0.72,
    patterns: [/гуля/i, /на улице/i, /прогул/i, /свежем воздухе/i]
  },
  {
    category: 'Deep work',
    confidence: 0.7,
    patterns: [/работ/i, /концентрац/i, /аналит/i, /сосредоточ/i]
  },
  {
    category: 'Commute',
    confidence: 0.7,
    patterns: [/дорог/i, /поездк/i, /дорога до/i, /еду/i, /путь/i]
  }
];

export function categorizeWithHeuristics(
  task: TaskLike,
  options?: { strongOnly?: boolean },
): { label: TaskCategory; confidence: number } | null {
  const normalized = normalizeTaskText(task);
  if (!normalized) return null;

  const strong = matchRules(normalized, STRONG_RULES);
  if (strong) {
    return strong;
  }

  if (options?.strongOnly) {
    return null;
  }

  return matchRules(normalized, SUPPORT_RULES);
}

export function refineCategoryPrediction(
  task: TaskLike,
  initialLabel: TaskCategory,
  confidence: number,
): { label: TaskCategory; confidence: number } {
  const normalized = normalizeTaskText(task);

  const heuristicStrong = categorizeWithHeuristics(task, { strongOnly: true });
  if (heuristicStrong && heuristicStrong.confidence >= Math.max(confidence, 0.8)) {
    return heuristicStrong;
  }

  let nextLabel = initialLabel;
  let nextConfidence = confidence;

  if (GAMES_TERMS.test(normalized)) {
    nextLabel = 'Games';
    nextConfidence = Math.max(nextConfidence, 0.72);
  } else if (SPORT_TERMS.test(normalized)) {
    nextLabel = 'Sport activity';
    nextConfidence = Math.max(nextConfidence, 0.72);
  } else if (RELAX_TERMS.test(normalized)) {
    nextLabel = 'Relaxing';
    nextConfidence = Math.max(nextConfidence, 0.68);
  }

  if (WALK_TERMS.test(normalized) && !WORKOUT_GUARD.test(normalized)) {
    const label: TaskCategory = OUTDOOR_TERMS.test(normalized) ? 'Outdoor Play' : 'Relaxing';
    nextLabel = label;
    nextConfidence = Math.max(nextConfidence, 0.64);
  }

  if (
    initialLabel === 'Sport activity' &&
    confidence < 0.55 &&
    WALK_TERMS.test(normalized) &&
    !WORKOUT_GUARD.test(normalized)
  ) {
    nextLabel = 'Relaxing';
    nextConfidence = Math.max(nextConfidence, 0.6);
  }

  const heuristicFallback = categorizeWithHeuristics(task);
  if (heuristicFallback) {
    if (heuristicFallback.label === nextLabel) {
      nextConfidence = Math.max(nextConfidence, heuristicFallback.confidence);
    } else if (heuristicFallback.confidence >= nextConfidence + 0.1) {
      nextLabel = heuristicFallback.label;
      nextConfidence = heuristicFallback.confidence;
    }
  }

  return { label: nextLabel, confidence: nextConfidence };
}

