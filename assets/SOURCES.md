# Источники ресурсов LudoDrop

Золотой апгрейд снят четырьмя камерами в смоделированном в Blender индукционном зале. Указатель привязан к реальному углу остановки колеса. Ротор, раскрывающийся знак ранга и литые цифры множителей отрендерены в 3D. На верхнем ободе использован рельеф по исходному портрету Гейба. Выбранную цель и выигранный предмет браузер берёт из текущего раунда. [Кинематографическая сцена](upgrade-film/induction.mp4)

Для сцены написана отдельная партитура. Виолончели и валторны записаны в VSCO 2 Community Edition. Удары наковальни, гонга, литавр и трубчатого колокола, а также арфа, тарелка, вибрафон и большой барабан взяты из VCSL. Для механических акцентов использованы записи Kenney. Исходные сэмплы доступны по CC0. [VSCO 2 Community Edition](https://github.com/sgossner/VSCO-2-CE) · [Virtual Community Sample Library](https://github.com/sgossner/VCSL) · [Kenney Casino Audio](https://opengameart.org/content/54-casino-sound-effects-cards-dice-chips) · [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds)

В исходном архивном монтаже «Time Lock» использован фрагмент выступления Гейба Ньюэлла на LinuxCon 2013. Автор записи — The Linux Foundation. Фрагмент кадрирован, переведён в монохром и смонтирован без исходного звука. [Оригинальная запись](https://commons.wikimedia.org/wiki/File:LinuxCon_%26_CloudOpen_North_America_2013_-_Gabe_Newell,_Valve.webm) · [Лицензия CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)

Миниатюры каталога скомпонованы из изображений контейнеров ниже и кадров локальных 3D-моделей. У исходных изображений убраны прозрачные поля. Предметы приведены к одному холсту 576 × 360, с сохранением пропорций. [Миниатюры каталога](cases/catalog/)

Для витрины «Неоновый» подготовлен прозрачный рендер локальной 3D-модели AK-47 с игровой текстурой Neon Rider. На заднем плане использован кадр Dust II из коллекции карт ниже. [Рендер для витрины](cases/features/neon-rider-studio.webp) · [3D-модель](unseal/armory/ak-neon-rider.glb)

На фоне «Вершина» кейсы стоят на скальном выступе над долиной. Панорама рассвета создана для LudoDrop с помощью ImageGen. 3D-модель контейнера освещена цветами окружения и отбрасывает тень на поверхность выступа. Из этой же сцены получены начальные кадры для устройств без WebGL. [Горный выступ](cases/features/summit-shelf.webp) · [Кейс Blacksite](unseal/summit/black-closed.webp)

«Мастерская» — исходная сцена открытия, выбранная по умолчанию. Верстак, окно и настенные сетки построены в Three.js. На сетках висят модели оружия из Counter-Strike 2 с игровыми текстурами. С этой сцены сняты начальные кадры, маски окна и видеопревью каталога. [AK-47 | Neon Rider](unseal/armory/ak-neon-rider.glb) · [AWP | Dragon Lore](unseal/armory/awp-dragon-lore.glb) · [Превью](unseal/courtyard/knife-preview.webm) · [Фактура верстака](cases/features/bench-mat.webp)

Панорама порта для витрины коллекций создана для LudoDrop с помощью ImageGen. [Порт на закате](cases/features/dry-dock-dusk.webp) · [Версия для телефона](cases/features/dry-dock-dusk-small.webp)

Панорама улицы в духе Inferno создана для LudoDrop с помощью ImageGen. Тёплый свет и синие тени видны сквозь панели сайта. [Панорама улицы](rooms/inferno-rally.webp)

Графическая фактура на экране выбора кейса создана для LudoDrop с помощью ImageGen. [Фактура](cases/features/rally-print.webp)

Иллюстрация стола снабжения создана для LudoDrop с помощью ImageGen. [Стол снабжения](rooms/supply-desk.webp)

Турнирная иллюстрация игроков для контракта создана для LudoDrop с помощью ImageGen. [Игроки на карте](contracts/league-operators.webp)

## Контракт обмена

Корпус стеклянного сканера создан для LudoDrop в ImageGen. Внутри него сайт показывает выбранные предметы и награду из каталога. [Сканер](contracts/scanner-glass.webp)

Для предыдущего оформления ImageGen создал фон оружейной, корпус затвора и внутреннюю камеру. Фактура шлифованной стали создана процедурно. [Помещение](contracts/terminal-room.webp) · [Корпус](contracts/machine-housing.webp) · [Камера](contracts/machine-bore.webp) · [Сталь](contracts/terminal-steel.webp)

## Предметы и контейнеры CS2

Для исходных коллекций идентификаторы, модели оружия, названия покрытий, редкость и ссылки на изображения взяты из снимка ByMykel/CSGO-API от 6 ноября 2026 года. Скины и контейнеры Valve загружены с CDN Steam Community и хранятся локально. Права на игровую графику и товарные знаки принадлежат Valve и соответствующим авторам. [Проект CSGO-API](https://github.com/ByMykel/CSGO-API) · [Каталог скинов](https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/skins.json) · [Каталог контейнеров](https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/crates.json)

- В исходном наборе 900 изображений с альфа-каналом размером 512 × 384 (216 PNG и 684 WebP). Для каждого скина в каталоге указаны исходный идентификатор и локальный путь. Ножи и перчатки в интерфейсе имеют золотую редкость. [Каталог приложения](../../src/data/assets.json)
- Капсулы, наборы пинов и три дополнительные серии оружейных кейсов используют составы из каталога CS2 и локальные иллюстрации. Названия наклеек и пинов приведены по русской локализации игры. [Контейнеры](containers/) · [Каталог CS2](https://github.com/ByMykel/CSGO-API) · [Локализация Valve](https://github.com/ByMykel/counter-strike-file-tracker)
- В `cases/crate-*.png` лежат изображения контейнеров с исходными идентификаторами Valve. В LudoDrop у тематических кейсов собственные составы и цены. [Кейсы](../../src/data/cases.ts) · [Таблицы выпадения](../../src/data/drop-tables.json)
- На карточках карт используются изображения сувенирных наборов Dust II (London 2018), Ancient (Antwerp 2022), Nuke (Austin 2025), Mirage (Shanghai 2024), Inferno (Copenhagen 2024), Overpass (Berlin 2019), Vertigo (Paris 2023) и набора коллекции Anubis. Сопоставления указаны в каталоге кейсов. [Каталог кейсов](../../src/data/cases.ts) [Оригинальные контейнеры в каталоге Steam Community](https://steamcommunity.com/market/search?appid=730&category_730_Type%5B%5D=tag_CSGO_Type_WeaponCase)

## Модели и анимации открытия

Восемь кейсов мастерской созданы для LudoDrop. Изображение каждого корпуса в каталоге и его анимации открытия сняты с одной модели. Содержимое каждой серии подобрано из локального каталога игровых предметов. [Корпуса мастерской](cases/workshop/) · [Модели](unseal/models/) · [Серии и цены](../../src/data/workshop-cases.ts)

Панорама грузового депо и тематические фоны мастерской созданы для LudoDrop с помощью ImageGen. [Грузовое депо](cases/features/freight-depot.webp) · [Фоны серий](cases/workshop-backdrops/)

Помещение с металлическими стеллажами в инвентаре и каталоге предметов создано с помощью ImageGen. [Оружейная комната](cases/features/equipment-room.webp)

Панорама оружейной с подсвеченным стендом создана для инвентаря LudoDrop с помощью ImageGen. Из центральной металлической панели сделан ложемент для скинов. [Панорама](cases/features/loadout-room.webp) · [Панель](cases/features/armory-mount.webp)

Стол оперативного штаба для стенда «Контрабанды» создан с помощью ImageGen. Первый кадр «Контрабанды» снят с той же закрытой 3D-модели, которую можно повернуть в браузере. [Фон штаба](cases/features/briefing-room.webp) · [Модель на витрине](cases/features/contraband-inspect.webp)

Миниатюра Гейба Ньюэлла в разделе коллекций карт сделана из фотографии Official GDC, снятой на Game Developers Conference 11 марта 2010 года. Кадр TheSilksongPikmin с Wikimedia Commons обрезан до квадрата, уменьшен и сохранён в WebP. [Исходная фотография](https://www.flickr.com/photos/officialgdc/4427575126/) · [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Gabe_Newell_GDC_2010_%28close_cropped%29.jpg) · [Лицензия CC BY 2.0](https://creativecommons.org/licenses/by/2.0/) · [Миниатюра](cases/features/gabe-gdc-2010.webp)

Для афиши «Сломанный клык» создана полноцветная турнирная иллюстрация Гейба Ньюэлла. Модель кейса отображается отдельно и доступна для осмотра. [Турнирная афиша](cases/features/gabe-rally.webp)

Сцены для стенда и каталога созданы с помощью ImageGen. Для «Сломанного клыка» подготовлены панорама полевой станции Ancient, портрет Гейба Ньюэлла и изображение корпуса по референсу 3D-модели. Фактура металлических табличек взята с поверхности стола на панораме. [Полевая станция](cases/features/ancient-outpost.webp) · [Гейб Ньюэлл](cases/features/gabe-newell.webp) · [Литейный цех](cases/features/foundry-yard.webp) · [Подводная станция](cases/features/deep-station.webp) · [Узел связи](cases/features/relay-station.webp) · [Лаборатория](cases/features/espionage-lab.webp)

Для CS20, «Разлома» и «Сломанного клыка» используются модели Valve с декалями серий community_24, community_26 и community_27. Капсулы и пакеты пинов имеют индивидуальную печать и объёмную анимацию в Three.js. [Модели коллекционных упаковок](../../src/collectible-model.ts)

У десяти жёлтых и трёх чёрных серий свои материалы и две игровые декали. Kilowatt и Gallery используют современный корпус, собственные эмблемы и анимацию навесного замка. Геометрия, UV, текстуры и движение взяты из локальной установки Counter-Strike 2. У eSports 2013 сделан тонкий чемодан с нижней петлёй и печатью из Steam. Восемь сувенирных наборов используют корпус `crate_aus2025_promo_de_nuke.vmdl_c` с оформлением соответствующих наборов Steam. [Модели серий](unseal/series/) · [Сувенирные наборы](unseal/models/)

У Office геометрия и механизм раскрытия взяты из модели Valve `models/props/ad_laptop/ad_laptop_animated.vmdl_c`, декаль Genesis — `community_36`. После загрузки терминала его экран перебирает предметы из пула Office и в конце подтверждает сохранённые награды. Геометрия картонной упаковки X-Ray и движущаяся плёнка созданы для LudoDrop, исходная печать взята с изображения Steam № 4668. [Терминал](../../src/terminal-model.ts) · [Упаковка X-Ray](../../src/xray-model.ts)

Девять авторских жёстких кейсов используют объёмные створки и шарниры. Для «Ронина», «Арктики», «Неонового» и «Золотого дропа» отдельно заданы размеры, огранка углов, крышки и застёжки. Панели используют графику исходных коллекций. На странице открытия серийных, авторских и сувенирных кейсов воспроизводится запись соответствующей модели с частотой 60 кадров в секунду. У «Контрабанды» тканевые стенки, подкладка и два бегунка молнии. При недоступности WebGL для сумки используется запись той же модели. [Жёсткие кейсы](../../src/hard-case-model.ts) · [Компактные корпуса](../../src/compact-case-model.ts) · [Сумка](../../src/bag-model.ts) · [Подготовка записей](../../scripts/render-inspection-fallback.mjs)

## Карты Counter-Strike 2

Кадр закрытого кейса с декалью community_27 служит референсом изображения «Сломанного клыка» на главной. При вращении кейса, капсулы или пакета браузер рисует закрытую модель в Three.js. [Изображение на стенде](cases/features/broken-fang-field.webp) · [Кадр референса](cases/features/broken-fang-inspect.webp) · [Сцена осмотра](../../src/inspection-scene.ts)

В архиве карт сохранены скриншоты и эмблемы Valve. Панорамы подготовлены в WebP шириной 1600 пикселей. Оригиналы Dust II и Nuke входят в раздел сравнения карт на сайте Counter-Strike 2. [Страница Valve](https://www.counter-strike.net/cs2)

| Карта | Исходный кадр |
| --- | --- |
| Dust II | Площадка B, вид со стороны дальней платформы. [Скриншот Valve](https://cdn.fastly.steamstatic.com/apps/csgo/images/csgo_react/cs2/maps/dust2_back_plat_s2.jpg) |
| Ancient | Двор с руинами. Ресурс локальной установки игры `panorama/images/map_icons/screenshots/1080p/de_ancient_3_png.vtex_c` из `game/csgo/pak01_dir.vpk`. |
| Nuke | Площадка A в реакторном зале. [Скриншот Valve](https://cdn.fastly.steamstatic.com/apps/csgo/images/csgo_react/cs2/maps/nuke_default_s2.jpg) |

Общий фон сайта показывает заснеженный двор Office. Панорама отрендерена из карты Valve `game/csgo/maps/cs_office_vanity.vpk` со штатной камеры главного меню `cam_default` с углом обзора 55°. При рендере использованы геометрия, текстуры и карты освещения локальной установки Counter-Strike 2. Для телефона подготовлен отдельный вертикальный кадр. [Панорама Office](maps/office-menu.webp) · [Версия для телефона](maps/office-menu-mobile.webp)

Эмблемы карт взяты из того же игрового архива. Встроенные SVG из ресурсов `panorama/images/map_icons/map_icon_de_{dust2,ancient,nuke}.vsvg_c` растрированы в прозрачные WebP размером 192 × 192. [Изображения карт и эмблемы](maps/)

## Авторские иллюстрации

В архиве иллюстраций находятся авторские сцены 36 кейсов, созданные с помощью ImageGen. Каждый кадр содержит контейнер и окружение и хранится в `cases/scenes/<id-кейса>.webp`. Для двух коллекций также созданы панорамные иллюстрации. [Промпты сцен](cases/scenes/prompts.json)

| Коллекция | Панорама и карточка |
| --- | --- |
| Ронин | [Флагманская панорама](cases/ronin-hero.webp) · [Лаковый сундук с белой маской ханъя](cases/scenes/original-ronin.webp) |
| Ночной порт | [Портовая панорама](cases/night-port-hero.webp) · [Контейнер на причале](cases/scenes/night-port.webp) |

### Исходные предметные рендеры

На карточках десяти авторских коллекций используются их предметные рендеры с прозрачным фоном. Для «Ночного порта» на главной также используется широкая панорама причала.

| Коллекция | Файлы |
| --- | --- |
| Ночной порт | [Сцена в порту для главного экрана](cases/night-port-hero.webp) и [отдельный кейс с эмблемой якоря](cases/collections/night-port.webp) |
| Красная линия | [Карбоновый кейс с алыми рёбрами и эмблемой](cases/collections/redline.webp) |
| Неоновый, Арктика, Золотой дроп, Сакура | Исходные PNG в `cases/custom/`, WebP в `cases/collections/`. [Промпты](cases/custom/prompts.json) |
| Asiimov, Ронин, Граффити, Контрабанда | Исходные PNG в `cases/originals/`, WebP в `cases/collections/`. [Промпты](cases/originals/prompts.json) |

Промпт иллюстрации «Красная линия» приведён ниже.

> Use case: product-mockup. Create one premium photorealistic product inventory cutout of a CS2 collectible weapons crate, landscape 3:2. The Redline crate is a wide, compact rugged dark carbon-fiber equipment trunk with lacquer scarlet corner guards, red metal runners, fine parallel red stripes and an inlaid sharp diagonal triple-slash red emblem on its front. Machined titanium catch latches, carry grip in the lid, subtle use wear, beautiful black carbon weave. Three-quarter front view with the right side visible, slightly elevated camera. The whole object centered and fully visible, fills 88% of image width. Readable, carefully lit carbon surfaces, large bold red highlights, bright softbox illumination; industrial premium store catalog look. Transparent background, clean alpha contour, no floor, no separate shadow, no people, no gun, no lettering, no words, no additional objects or frame.

Четыре квадратных обложки первого ряда созданы отдельно для карточек каталога. Широкие панорамы используются на страницах кейсов. [Обложки коллекций](cases/covers/)

## Шрифты

Шрифты установлены локально из Google Fonts и распространяются по SIL Open Font License 1.1. Для кириллицы и латиницы подключаются отдельные файлы WOFF2.

| Семейство | Назначение и лицензия |
| --- | --- |
| [Inter](https://fonts.google.com/specimen/Inter) | Основной текст нового интерфейса. [OFL](fonts/inter-OFL.txt) |
| [Roboto Condensed](https://fonts.google.com/specimen/Roboto+Condensed) | Заголовки и крупные цифры. [OFL](fonts/roboto-condensed-OFL.txt) |
| [Oswald](https://fonts.google.com/specimen/Oswald) | Афишные заголовки коллекций. [OFL](fonts/oswald-OFL.txt) |
| [Onest](https://fonts.google.com/specimen/Onest) | Гарнитура исходного проекта. [OFL](fonts/onest-OFL.txt) |
| [Unbounded](https://fonts.google.com/specimen/Unbounded) | Акцидентная гарнитура исходного проекта. [OFL](fonts/unbounded-OFL.txt) |

Для баннера промокода OFFICE20 создана иллюстрация жетонов и пропуска с помощью ImageGen. [Иллюстрация промоакции](cases/features/office-promo.webp)

Панорама обсерватории для коллекции «Полярная ночь» создана с помощью ImageGen. [Полярная обсерватория](cases/features/polar-observatory.webp)

Гравированный дракон из прежнего оформления создан для LudoDrop с помощью ImageGen. [Текстура металла](cases/engraved-dragon.webp)

Панорамные сцены игровых режимов созданы для LudoDrop с помощью ImageGen. На обложках изображены [калибровочный механизм](rooms/upgrade.webp), [взлётная полоса](rooms/crash.webp), [механическое колесо](rooms/wheel.webp), [кристалл в геологической лаборатории](rooms/mines.webp) и [чемодан с документами](rooms/contracts.webp).

## Звуки

Короткие семплы открытия замка, щелчка и раскрытия предмета взяты из локальной установки Counter-Strike 2. Web Audio синтезирует сигнал остановки, дополнительные низкие тоны для редкого дропа и короткие звуки действий. Пути к оригинальным игровым ресурсам и контрольные суммы PCM указаны в реестре звуков. [Источники WAV](audio/SOURCES.md) · [Манифест](audio/manifest.json)

## Стоимости

Цены сопоставлены по точному `market_hash_name` со снимком Market.CSGO от 6 ноября 2026 года, 12:30:16 UTC. Для трёх наклеек использованы отдельные предложения Skinport от 20 ноября 2026 года. В таблице у них указаны источник и дата. Игра использует их как фиксированные стоимости в виртуальных кредитах. Исходное предложение в рублях, число листингов и округлённая стоимость в кредитах сохранены для каждого предмета. [Использованный снимок](../../src/data/price-snapshot.json) · [Исходный API](https://market.csgo.com/api/v2/prices/RUB.json)


