**Stack:** Vue 3 (Composition API) + Vuetify, Express.js, MongoDB, Passport (Google OAuth), Pinia, Vite, Vue I18n.  
**AI:** Hugging Face Inference API (zero-shot classification; small instruct LLM) with mock fallback.

## FINAL MATH ##

1) Время и сущности

День дискретизируется на равные слоты длиной Delta минут (по умолчанию 15).

Множество слотов: S = {s1, s2, ..., sm}. Час дня для слота s — h(s) в диапазоне [0, 24).

Задача t имеет поля:

d_t — требуемая длительность в минутах,

q_t — минимальный непрерывный кусок (по умолчанию 30 минут),

p_t — приоритет в [0, 1],

D_t — дедлайн (timestamp, опционально),

c_t — категория (например: "Питание", "Учёба", "Отдых", "Игры", "Спорт", "Дела/Поручения", "Творчество", "Коммьют", "Другое"),

fixed_time (опционально) — жёстко заданный интервал (например, секция/кружок).

2) Иерархия приоритетов (фаза обязательных дел)

Планирование выполняется в две фазы.

ФАЗА 0 (обязательные дела, размещаются первыми, формируют маски):

Сон: интервал [sleep_start, sleep_end] из настроек пользователя.

Школа/Уроки: фиксированные/расписанные уроки в течение дня.

Секции/Кружки/Тренировки: только фиксированное время пользователя.

Питание (пин-слоты):

Завтрак 07:00–08:30,

Обед 12:00–14:00,

Ужин 18:00–20:30.
Все эти блоки считаются занятыми, формируют жёсткие маски: внутри них нельзя размещать другие задачи.

ФАЗА 1 (остальные задачи по модели полезности):

Размещаются только в слоты, не занятые фазой 0.

3) Жёсткие маски (admissible slots)

Определим бинарную функцию mask(t, s):

mask(t, s) = 0, если s попадает хотя бы в один из жёстких интервалов:

сон,

уроки/школа,

секции/кружки/тренировки (fixed_time),

окна питания (кроме самой задачи "Питание" соответствующего типа).

Во всех остальных случаях mask(t, s) = 1.

Допустимое множество: S_adm(t) = { s in S | mask(t, s) = 1 }.

4) Вектор признаков x(t, s)

Для каждой пары (t, s), где s ∈ S_adm(t), вычисляется вектор x(t, s) = [x1, ..., x12]^T.
Все признаки нормированы в [-1, 1], кроме явно оговорённых.

Определения:

h = h(s) — час дня для слота s (вещественное число в [0, 24)).

delta_deadline_hours = max(0, D_t - start(s)) в часах; если дедлайна нет, принимаем 0.

used_before_s — уже запланированные минуты до начала s (по текущему плану пользователя).

L = 360 (6 часов) — мягкая дневная "квота" умственной нагрузки.

x1: Circadian fit (шаговые кривые по категории c_t)

если c_t == "Питание":
  x1 = +1 внутри своего окна (Завтрак/Обед/Ужин), иначе -1
если c_t == "Учёба/Домашнее задание":
  16 <= h < 19.5 -> +1
  19.5 <= h < 21 -> +0.2
  иначе -> -0.5
если c_t == "Отдых":
  18 <= h < 21 -> +1
  16 <= h < 18 -> +0.5
  h  < 10     -> -0.5
  иначе -> 0
если c_t == "Игры":
  17 <= h <= 20 -> +1
  12 <= h < 17 ->  0
  h  < 12     -> -1
  иначе -> 0
если c_t == "Спорт":
  17 <= h < 20 -> +1
  10 <= h < 17 ->  0
  иначе -> -0.5
если c_t == "Дела/Поручения":
  12 <= h < 17 -> +0.6
  h  < 9      -> -0.3
  иначе -> 0
если c_t == "Творчество":
  18 <= h < 21 -> +0.7
  14 <= h < 18 -> +0.3
  h  < 10     -> -0.2
  иначе -> 0
иначе:
  x1 = 0


x2: Давление дедлайна

tau_hours = 6
x2 = 1 - exp( - delta_deadline_hours / tau_hours )
(если дедлайна нет, x2 = 0)


x3: Приоритет

x3 = p_t   (в [0,1])


x4: Стоимость переключения контекста (граница слотов)

x4 = +1 если соседние занятые слоты той же категории
x4 = -1 если соседние занятые слоты другой категории
x4 =  0 если соседей нет или неизвестно


x5: Накопленная дневная нагрузка

если used_before_s <= L: x5 = 0
иначе: x5 = -min(1, (used_before_s - L) / 120)


x6: Привычка/история

x6 ∈ [-1, 1]; это масштабированная EMA частоты подтверждённых (y=1) размещений категории c_t около часа h.


x7: Конфликт с питанием

если c_t == "Питание" и s внутри окна (соответствующего приёма пищи): x7 = +1
если c_t == "Питание" и s вне окна: x7 = -1
если c_t != "Питание" и s внутри любого окна питания: x7 = -1
иначе: x7 = 0


x8: Конфликт с уроками (только детский профиль)

x8 = -1 если s попадает в урок, иначе 0


x9: Конфликт со сном

x9 = -1 если s попадает в сон, иначе 0


x10: Дневная цель отдыха (только детский профиль)

если c_t in {"Отдых","Прогулка"} и сумма уже спланированного отдыха сегодня < 60 мин: x10 = +1
иначе: x10 = 0


x11: Штраф за позднюю домашку (только детский профиль)

если c_t == "Учёба/Домашнее задание" и h >= 20.0: x11 = -1
если c_t == "Учёба/Домашнее задание" и 19.0 <= h < 20.0: x11 = -0.5
иначе: x11 = 0


x12: Штраф за игры утром

если c_t == "Игры" и h < 12.0: x12 = -1
если c_t == "Игры" и 12.0 <= h < 15.0: x12 = -0.5
если c_t == "Игры" и 17.0 <= h <= 20.0: x12 = +0.5
иначе: x12 = 0

5) Полезность и выбор слота

Полезность (линейная):

U(t, s) = dot(w, x(t, s))   # w и x — векторы длины 12


Выбор якорного слота:

s_star(t) = argmax_{s ∈ S_adm(t)} U(t, s)


Рост непрерывного сегмента до длительности d_t:

1) Начать с s_star(t);
2) Жадно расширять в соседние допустимые слоты, максимизируя СРЕДНЮЮ полезность сегмента;
3) Соблюдать min-кусок q_t;
4) Разрешены максимум 2 сегмента для одной задачи; для второго сегмента добавляется штраф phi = -0.2 к средней полезности при сравнении кандидатов на размещение.


Разрешение конфликтов:

urgency(t) = p_t * max_s x2(t, s)   # приоритет * давление дедлайна
Задачи планируются по убыванию urgency; при пересечении менее срочная задача переразмещается.

6) Логистическая регрессия (вероятность принятия) и SGD

Мы обучаем веса w по бинарным меткам y ∈ {0,1} для пар (t, s), где:

y = 1 — пользователь принял размещение (оставил как есть) или сам перетащил задачу в (t, s) и подтвердил,

y = 0 — пользователь отверг/передвинул предложение или дал негативную оценку.

Сигмоида и вероятность:

sigma(z) = 1 / (1 + exp(-z))
P(y=1 | x) = sigma( dot(w, x) )


Функция потерь (логистическая с L2-регуляризацией):

loss = - ( y*log(P) + (1 - y)*log(1 - P) ) + (lambda/2) * ||w||^2
где P = sigma(dot(w, x)), lambda > 0


Градиент и шаг SGD (онлайн, по одному примеру):

grad = (P - y) * x + lambda * w
w = w - eta * grad
Рекомендации: eta = 0.05, lambda = 0.001


Замечания по корректности:

Компоненты признаков, соответствующие жёстким правилам (x7, x8, x9), обнулять перед шагом SGD, если пользователь сознательно нарушил окно сна/питания/уроков. Это не даст модели "разучить" базовые ограничения.

Штрафы-предпочтения (x11, x12) не маскировать — они должны адаптироваться под реальное поведение семьи/ребёнка.

При желании допускается клиппинг градиента по L2-норме до порога (например, 5.0) для численной устойчивости; bias-терм не используется (интерсепт можно смоделировать отдельным x0=1 и w0, но в базовой версии не обязателен).

7) Базовые веса (инициализация)

Порядок соответствует [x1 .. x12].

Для детского профиля (рекомендуется по умолчанию):

w_kid = [ 0.55, 0.45, 0.50, -0.25, -0.15, 0.30, -0.95, -1.10, -1.30, 0.40, -0.70, -0.80 ]


Для взрослого профиля (на будущее, если понадобится):

w_adult = [ 0.55, 0.50, 0.55, -0.25, -0.20, 0.35, -0.90, 0.00, -1.20, 0.15, 0.00, 0.00 ]

8) Примечания к целостности и качеству

Благодаря фазе 0 базовые дела ребёнка (сон, еда, школа, секции) всегда занимают свои окна и никогда не вытесняются абсурдными задачами по приоритету.

Линейная полезность и жадный рост сегмента поддерживают простоту и скорость (<= 800 мс при <= 50 задач/день).

SGD корректно подстраивает субъективные предпочтения, не ломая жёсткие правила (за счёт маскирования x7/x8/x9 в шагах обновления, когда пользователь их нарушает вручную).

Для предотвращения дубликатов: обязательные блоки фазы 0 создаются один раз на дату; при повторной инициализации проверяется уникальность (userId, date, title, start, end).

---

## 1. Problem & Goals
Users add tasks but fail to place them into a realistic day. The app generates a **balanced timetable** (when & how long) for a single day, respects sleep/work windows, and **learns** from edits.

### Success (v1)
- Enter tasks → one-click schedule with explanations.
- Drag/resize edits update a **personal model** via SGD + logistic regression.
- “Previous tasks” quick-add.
- EN/RU localization; Google login; fast (≤800 ms for ≤50 tasks).

### Non-Goals
- Team features, multi-day optimization, full Google Calendar sync (can be later).

---

## 2. Core Concepts
- **Task**: title, estimated minutes, priority (0–1), optional deadline/window/fixed time.
- **Time slot**: 15-min blocks across a day.
- **Admissible slot**: not in sleep/locked windows and not already allocated.
- **Utility**: score for placing task t in slot s.

---

## 3. Mathematical Model

Let tasks \(T=\{t_1,\dots,t_n\}\) and slots \(S=\{s_1,\dots,s_m\}\).

**Utility:**
\[
U(t,s) = \sum_{i=1}^k w_i \, f_i(t,s)
\]
- \(f_i(t,s)\): value of the i-th factor (e.g., circadian fit, deadline pressure, priority, habit, context switch, daily load).
- \(w_i\): learnable weight representing user preference.

**Slot choice:**
\[
s^*(t) = \arg\max_{s \in S_{\text{admissible}}} U(t,s)
\]

**Duration allocation:** Expand from \(s^*(t)\) into adjacent admissible slots that maximize **average** utility until duration \(d(t)\) is met. If fragmentation is needed, pick top-K segments with min chunk (e.g., 30 min).

### Feature Vector (examples)
1. **Circadian fit** (category × time-of-day).  
2. **Deadline pressure** (higher near deadline).  
3. **Priority** [0..1].  
4. **Context switch cost** (penalty if neighbors have different category).  
5. **User load** (penalty after preferred daily limit).  
6. **Habit/history** (boost if similar tasks commonly done at this time).

Normalize features to [−1,1] (or [0,1]) and store per evaluation.

---

## 4. Learning From Feedback (SGD + Logistic Regression)

Binary label \(y \in \{0,1\}\) per (t,s):
- \(y=1\): user accepted placement, or moved task and kept it (positive).
- \(y=0\): user overrode a placement or thumbed-down.

Model:
\[
P(y=1|x) = \sigma(w^\top x) = \frac{1}{1+e^{-w^\top x}}
\]

Online update (per interaction), learning rate \( \eta \):
- Error \(e=\sigma(w^\top x)-y\)  
- Gradient \( \nabla = e \cdot x \)  
- Update \( w \leftarrow w - \eta (\nabla + \lambda w) \) with L2 \( \lambda \)

Inference uses **logit** \(U(t,s)=w^\top x\) to rank slots.

**Cold start:** heuristic \(w_0\) and rules; begin learning when ≥20 labeled pairs.

---

## 5. Scheduling Algorithm

1. Build slots S (15-min) and mark forbidden (sleep/locks).
2. For each task t:
   - Compute features \(x(t,s)\) for admissible s.
   - Score \(U=w^\top x\); choose \(s^*(t)\); **grow** segment to duration.
3. Resolve overlaps by descending **urgency = priority × deadline pressure**.
4. Store final plan and explanations.

Pseudocode:
txt
for t in sortByUrgency(tasks):
  best = argmax_s dot(w, features(t, s))
  segment = grow(best, duration=t.d)
  place(t, segment)
resolve_overlaps()

## 6). AI Usage
6.1 Categorization (free)
Zero-shot classification (HF Inference API).

Labels: Healthcare, Sport activity, Deep work, Admin/Errands, Learning, Social, Household, Creative, Commute, Other.

On save → assign {category, confidence}; user can override.

6.2 Reasoning
Small instruct model (HF) returns 1–2 sentence explanation using top features and constraints.

If provider unavailable → template fallback:

“Placed {title} at {time} for {duration} due to high {feature1} and {feature2}, no conflict with sleep/locks. Deadline pressure: {dp}.”

## 7). Data Model (Mongo)
users
_id, email, name, locale, sleep_start, sleep_end, work_start, work_end, model:{ w:[Number], updatedAt }

tasks
_id, userId, title, description, estimatedMinutes, priority, deadline?, desiredWindow?, fixedTime?, category, ai:{label, confidence, provider}, archived, createdAt, updatedAt

plans
_id, userId, date, slots:[{ start, end, taskId, score, featuresSnapshot, reasoningText }], createdAt

feedback
_id, userId, taskId, planId, slot:{start,end}, label:0|1, source:'kept'|'moved'|'thumbs', note?, createdAt

catalog (Previous tasks)
_id, userId, taskTemplate:{ title, defaultMinutes, defaultPriority, category }, lastUsedAt, uses

## 8). API (Express)
Auth

GET /auth/google → OAuth

GET /auth/google/callback

GET /me

Tasks

GET /tasks

POST /tasks → categorize with AI

PUT /tasks/:id

DELETE /tasks/:id

GET /catalog

POST /catalog

Schedule

POST /schedule/calculate { date, tasks? } → plan with slots + reasoning

POST /schedule/feedback { planId, entries:[{taskId, slot, label, note?}] } → SGD update

POST /schedule/apply-edits { planId, patches:[{taskId, from,to}] } → log positives, optional re-calc

Settings

PUT /settings (sleep/work, locale)

Debug

GET /model (current w)

POST /model/reset

## 9). Frontend UX (Vue + Vuetify)
Day calendar (Google Calendar–like), 15-min grid, drag/resize, category colors, priority badges.

Task Drawer: create/edit; AI category chips; quick-add from Previous tasks.

Explanation Panel: reasons per event; quick thumbs up/down.

Top Bar: Calculate, EN/RU switch, user menu.

Empty state: 1-minute tutorial.

Dark/Light modes.

## 10). Localization
Vue I18n with en.json and ru.json; all UI strings translatable.

Date/time localized (date-fns).

Requirement: the app itself supports RU/EN, not the PRD content.

## 11). Metrics
Acceptance rate (y=1), edits per plan, time to schedule, Δw magnitude, DAU, task reuse.

## 12). Test Plan (smoke)
Create 10 tasks; schedule < 800 ms.

Move 3 tasks; submit feedback; verify weights change and next plan differs.

AI offline → fallback explanations shown.

RU toggle switches all strings and formats.

## 13). Defaults
Granularity: 15 min; Min chunk: 30 min.

𝑤
0
w 
0
​
 : [0.6, 0.5, 0.6, -0.3, -0.2, 0.4]

Learning: 
𝜂
=
0.05
η=0.05, 
𝜆
=
0.001
λ=0.001