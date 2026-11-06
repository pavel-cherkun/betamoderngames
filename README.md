# Betamodern Games

Витрина пет-игр Павла Черкуна: каталог, Shorts, избранное, оценки и отзывы через Telegram. Статический сайт без сборки, ставится на экран «Домой» и открывается как Telegram Mini App.

- Данные: `games.json` (игры и shorts), `data/ratings.json` (пишет GitHub Action из Telegram).
- Схема отзывов: [ОТЗЫВЫ.md](ОТЗЫВЫ.md). Что не хватает по играм: [ИНВЕНТАРЬ.md](ИНВЕНТАРЬ.md).
- Локально: `python3 -m http.server 5288`, демо-оценки — `?demo=1`.
