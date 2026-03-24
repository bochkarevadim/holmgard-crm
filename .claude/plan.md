# План: расходники в тарифах + автосписание со склада

## Суть
1. В каждом тарифе (услуге) хранить кол-во шаров и гранат на 1 человека
2. В карточках тарифов отображать расходники иконками
3. При завершении заказа (`completeEventPayment`) автоматически списывать расходники со склада

## Изменения

### 1. Структура данных тарифов — `js/app.js` (initData)
Добавить поля к каждому тарифу:
- `ballsPerPerson: число` — шаров на 1 человека (0 если не нужно)
- `grenadesPerPerson: число` — гранат на 1 человека (0 если не нужно)

Примеры из текущих тарифов (парсим из поля `included`):
- МИССИЯ ВЫПОЛНИМА → 300 шаров → `ballsPerPerson: 300`
- БОЛЬШОЙ КУШ → 500 шаров → `ballsPerPerson: 500`
- НЕУДЕРЖИМЫЕ → 600 шаров + граната → `ballsPerPerson: 600, grenadesPerPerson: 1`
- Кидбол — безлимитные шары → `ballsPerPerson: 0` (не списываем)
- ТИР200 → `ballsPerPerson: 200`, ТИР500 → `ballsPerPerson: 500`
- Опция "Граната" (id:19) → `grenadesPerPerson: 1`
- Опция "Дым. шашка" (id:21) → `grenadesPerPerson: 1`
- Опция "Доп. шары 200шт" (id:20) → `ballsPerPerson: 200`

Миграция: добавить поля к существующим тарифам через `DB.get('consumables_v1')`.

### 2. Модал тарифа — `index.html`
Добавить 2 поля в форму `#tariff-form` (после "Возраст"):
```html
<div class="form-row">
    <div class="form-group">
        <label>Шаров на 1 чел.</label>
        <input type="number" id="tariff-balls" placeholder="0" min="0">
    </div>
    <div class="form-group">
        <label>Гранат на 1 чел.</label>
        <input type="number" id="tariff-grenades" placeholder="0" min="0">
    </div>
</div>
```

### 3. Карточки тарифов — `js/app.js` (loadDirectorTariffs + loadTariffs)
В `.tariff-meta` добавить иконки расходников:
```
${t.ballsPerPerson ? `<span><span class="material-icons-round">radio_button_unchecked</span> ${t.ballsPerPerson} шаров</span>` : ''}
${t.grenadesPerPerson ? `<span><span class="material-icons-round">brightness_7</span> ${t.grenadesPerPerson} гранат</span>` : ''}
```

### 4. Сохранение/загрузка в модале — `js/app.js` (openTariffModal, saveTariff)
- `openTariffModal`: подставлять `tariff.ballsPerPerson` и `tariff.grenadesPerPerson`
- `saveTariff`: сохранять эти поля из формы

### 5. Автосписание — `js/app.js` (completeEventPayment)
При завершении заказа:
```javascript
// Рассчитать расходники
const tariffs = DB.get('tariffs', []);
const event = events[idx];
let totalBalls = 0, totalGrenades = 0;

// Основной тариф × кол-во участников
if (event.tariffId) {
    const tariff = tariffs.find(t => t.id === event.tariffId);
    if (tariff) {
        totalBalls += (tariff.ballsPerPerson || 0) * (event.participants || 1);
        totalGrenades += (tariff.grenadesPerPerson || 0) * (event.participants || 1);
    }
}

// Опции к игре × кол-во (гранаты, доп. шары, дым)
if (event.selectedOptions) {
    event.selectedOptions.forEach(optId => {
        const opt = tariffs.find(t => t.id === optId);
        if (opt) {
            totalBalls += (opt.ballsPerPerson || 0) * (event.participants || 1);
            totalGrenades += (opt.grenadesPerPerson || 0) * (event.participants || 1);
        }
    });
}

// Списать со склада
if (totalBalls > 0 || totalGrenades > 0) {
    const stock = DB.get('stock', {});
    stock.balls = Math.max(0, (stock.balls || 0) - totalBalls);
    stock.grenades = Math.max(0, (stock.grenades || 0) - totalGrenades);
    DB.set('stock', stock);
    // Сохранить что списано в event
    events[idx].consumablesUsed = { balls: totalBalls, grenades: totalGrenades };
}
```

### 6. Файлы для изменений
- **`js/app.js`** — initData (данные + миграция), loadDirectorTariffs, loadTariffs (сотрудник), openTariffModal, saveTariff, completeEventPayment
- **`index.html`** — 2 поля в модале тарифа
