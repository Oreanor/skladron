// Правила игры. Числа не вписаны в текст, а подставляются из прайса —
// иначе после первой же правки баланса правила начали бы врать.

import type { Locale } from "./dict";

export interface RuleSection {
  title: string;
  lines: string[];
  /** Пункты по порядку — нумерованным списком: так читаются шаги «с чего начать». */
  steps?: boolean;
}

const en: RuleSection[] = [
  {
    title: "Getting started",
    steps: true,
    lines: [
      "**Build the warehouse.** Take «Area» and drag a frame out from the starter {starter}×{starter} square — the warehouse can be any size and shape, as long as it is in one piece. A cell costs {cell} cr. A bigger warehouse has more room for installations and containers, but also more to burn. Once you have at least 25 cells, name the warehouse and it is founded.",
      "**Set up the defence.** Without guns the warehouse cannot be defended: drones fly at cells and set them alight. A gun ({gun} cr) shoots everything within {gunRange} cells on its own; a launcher ({rocket} cr) fires a missile that steers onto its target. Place them so their circles cover the approaches. Helping them are sprinklers (put out fire around them), traps (hold drones by magnet) and balloons (a one-shot barrage in the swarm's way). While a tool is selected, its installations' circles show on the map.",
      "**Buy drones.** The «Drones» tool puts a container of {perCell} on a free cell for {droneBox} cr. Drones are both goods and weapons: every midnight, London time, everything stored is sold at double the purchase price — that is your income. You also send them on raids and on recon.",
      "**Play the missions.** The «Missions» panel is a hundred battles on your own warehouse against ever stronger waves: free, any time, with a bonus for every drone beaten off. In battle the guns fire by themselves, while you finish drones off with the mouse and put out fires with the hose. The number of your last mission passed is your level, and rivals see it.",
      "**Add rivals and raid them.** Enter a rival's e-mail in «Rivals», scout their warehouse with one drone, then build a raid from waves and warheads. Every cell you burn pays {loot} cr, and more the harder you hit. The rival defends on their side, and you get a report and a replay.",
    ],
  },
  {
    title: "The warehouse and the money",
    lines: [
      "You start with {credits} cr and a {starter}×{starter} warehouse standing in the middle of the field — it is yours for free.",
      "Every midnight, London time, the shipment goes out: everything stored is sold at double the purchase price — a container of drones goes for {droneBoxSale} cr at drone level 0 and up to {droneBoxSaleTop} at level 10. That is the warehouse's income: cells pay no rent. Whatever you did not send into battle is sold. The server runs the shipment by itself and reports it in Telegram, if the bot is linked.",
      "Short of money? The bank lends {loanMin}–{loanMax} cr for {loanHours} hours at {loanRate}%. The goods you buy with it can burn in a raid — the debt will not.",
      "Money strategy: the real income is burning rival warehouses ({loot} cr per cell). Defence bounty is smaller — a clean stop of a big swarm pays hundreds or about a thousand, usually two to three times less than a successful attack; missions earn it too. Flat broke — take a loan, play a mission, or wipe and get a floor of at least {credits} cr.",
    ],
  },
  {
    title: "Building",
    lines: [
      "«Area» — drag a frame or tap a cell. A new cell costs {cell} cr and must touch what already stands.",
      "«Repair» — the same, {repair} cr per burnt cell.",
      "«Demolish» — tear down empty warehouse cells, intact or burnt, for {scrap} cr each. Bare ground is left behind; cells holding an installation or a container cannot be torn down, the warehouse must stay in one piece and cannot shrink below {minCells} cells.",
      "«Gun» — {gun} cr on a free intact cell.",
      "«Launcher» — {rocket} cr, placed and dragged like a gun. It reaches {rocketRange} cells, same as a gun, and fires wide, but the missile steers onto the target it was fired at and flies faster than a gun shell. One missile per launcher in the air, {rocketReload} s to reload.",
      "«Sprinkler» — {spray} cr, placed and dragged just like a gun. It does not shoot: when a cell within {sprayRange} catches fire, the sprinkler spins up and sweeps eight jets around itself. A jet stops at the first blaze it meets and needs a moment to douse it. It runs on mains water and never runs dry, but a big enough fire can still outpace a dense ring of them.",
      "«Trap» — {trap} cr, placed and dragged like a gun. It magnetically holds up to {trapCap} drones within {trapRange} cells; extras fly past. Guns can still shoot held drones; if the trap burns, the hold drops.",
      "«Drones» — a container of {perCell} pieces for {droneBox} cr. It gets dearer with the drone level, up to {droneBoxTop} cr at level ten.",
      "«Balloons» — {balloon} cr, a one-shot launcher placed like a gun. As soon as a drone enters its {balloonRange}-cell circle, it throws out {balloonCount} barrage balloons almost at once, scattering them evenly over the whole circle, and is gone — nothing is left on its cell. The balloons then drift slowly, and a drone that flies into one dies with it — no fire, no damage to the warehouse or the ground. But a gun or launcher shell pops a balloon in its way just as readily. Each level widens the circle and adds two balloons.",
      "Installations and containers can be dragged around the warehouse in any mode, for free. Drop one onto an occupied cell and the two swap places. Double-click sells an installation or a container at today's purchase price.",
      "«Blueprints» — save your current warehouse under a name to come back to it later. Rebuilding tears down the current warehouse and sells it — intact cells at build price, burnt ones for scrap, installations, drones and balloons at purchase price — and puts the blueprint in its place. You pay only the difference; a blueprint holds no drones.",
    ],
  },
  {
    title: "Defence",
    lines: [
      "Raids queue up and are fought strictly in order — you cannot skip or reorder them.",
      "Take as long as you need to prepare; the first raid in the queue waits for you, and only that one can be fought.",
      "A battle counts only once it is played to the end. Reload the page or close the tab mid-battle and it does not count: the raid stays first in the queue, the warehouse is untouched, and you can defend again.",
      "In battle the guns work by themselves — {gunRange} cells of range, {reload} s to reload. Your mouse is the machine gun when a drone is in the crosshair — over the warehouse too; otherwise over the warehouse it is the fire hose. A gun shell is unguided: the gun leads its target and fires only once the turret has turned. Installations work together — none fires at a target that already has a shell or missile on its way, and a miss frees it again.",
      "Fire spreads to neighbouring cells every {spread} s. A container on a burning cell is lost with the drones inside; a gun there dies too.",
    ],
  },
  {
    title: "Raids",
    lines: [
      "Add a rival by e-mail — they have to be playing too.",
      "Build the raid from waves: each has its own pattern, side and warheads (empty, explosive, gun, sprinkler or trap jammer, stealth, blower, turbo, armor, shooter). Up to {maxRaid} drones. A bigger swarm makes the formation denser — the raid barely lasts longer. Drones leave the warehouse at once; warheads cost an extra credit surcharge. Rings and spirals have a spin instead of a side: clockwise, counter-clockwise or, for a ring, none.",
      "A blower warhead explodes like a plain one and, on the way in, shoves barrage balloons aside — several cells away from the drone, without popping them. A handful of blowers in the swarm noticeably cuts what the balloons take; a third of the swarm brings it near zero.",
      "The trap jammer works the same way, but its circle is half a trap's — it has to come in close, under the guns. While the circle covers a trap, the trap holds nobody and lets the caught go.",
      "A stealth warhead blows up like a plain one, but guns and launchers do not see it at all — neither will aim, and no missile will lock on. Against it you have only your own hands, the traps and the barrage balloons: it crashes into a balloon like any drone, and it sets off a balloon launcher too.",
      "A turbo warhead blows up like a plain one, but the drone flies half again as fast — less time under fire.",
      "An armored drone blows up like a plain one, but a gun needs two hits: after the first it keeps flying, smoking. A launcher's missile and your machine gun still bring it down in one.",
      "A shooter carries one missile and fires it at the warehouse from {shooterRange} cells — farther than a mid-level gun reaches. The missile sets one cell alight, like a drone; then the shooter itself flies in to ram the warehouse. The missile is faster than a drone but slower than our own, and a gun can shoot it down.",
      "The defender fights the raid on their own screen. You get a report afterwards — and can watch the whole thing replayed.",
      "For every cell you burn down you get a {loot} cr bonus. The defender gets a defence bounty: {defendClean} cr per drone when nothing burns, or {defendDirty} cr per drone minus {defendBurn} cr per burnt cell. Insurance pays them {insureCell} cr per burnt cell — exactly the repair. The basic policy stops there; every level of it adds {insureShare}% cover for goods and guns lost in the fire, up to the full value.",
      "The bonus is not flat: it grows with the share of the warehouse you burn down. Half of it pays a quarter more per cell, four fifths pays double, all of it triple — up to {lootMax} cr a cell. Finishing one rival off beats nibbling at ten.",
      "After a total wipe the warehouse resets, but the account is topped up to at least {credits} cr so you can rebuild.",
      "Nobody is paid for downed drones: money comes from goods, not from shooting.",
      "Every finished battle lands in the log: watch the replay or copy a link so others can see how it went.",
    ],
  },
  {
    title: "Missions",
    lines: [
      "Missions are a single-player campaign: 100 battles on your own warehouse, no rival needed, any time, free of charge.",
      "Every mission is 8–10 waves: the first come one after another, small and simple; towards the end they grow, come thicker and overlap. The whole thing grows with the number too — from 120 drones on the first to 1000 on the hundredth, with levelled-up drones and every kind of warhead mixed in.",
      "A mission's score is the share of your warehouse that survived: save it all and you get 100. The best score for every number is kept.",
      "The next mission opens if any of the warehouse survives. Passed ones can be replayed — a number always brings the same swarm, so scores compare fairly.",
      "A mission pays the defence bounty — {defendClean} cr per drone for a clean stop — so the further the number and the bigger the swarm, the bigger the reward. What burns in a mission burns for real, but insurance covers it as in any battle.",
    ],
  },
  {
    title: "Recon",
    lines: [
      "Recon sorties spend drones from the same warehouse containers as raids.",
      "A flight takes you over the rival's map under fog of war. The plane comes in from a random edge and uncovers a circle around itself; steer with the left and right arrows. Or hold a finger on the map and the plane turns towards it.",
      "Their guns can shoot it down. Out of planes — the sortie is over.",
      "What you mapped stays yours, gaps and all — the «Map» button on the rival's card. But it goes stale: wherever they have rebuilt since your flight, the fog creeps back over that patch.",
    ],
  },
  {
    title: "Upgrades",
    lines: [
      "Classes cost {upgrade} cr per level. Levels count from zero up to ten; the insurance policy stops at four, where cover is already full.",
      "Drones fly faster and see farther on recon, guns reach further and shoot quicker, the machine gun aims better, the hose covers more, sprinklers douse a wider circle, traps grab farther. Balloons — a wider circle and two more balloons per level.",
      "Launchers grow the same way: more range and a faster missile with every level.",
      "A level applies to everything at once — to what is already in stock and to everything bought later.",
    ],
  },
  {
    title: "Tips",
    lines: [
      "Overlap the guns' circles: one gun on an approach cannot keep up with a swarm.",
      "Do not pile everything together — fire spreads to neighbouring cells and eats containers and guns alike.",
      "Put sprinklers deep inside: they save what breaks through the defence.",
      "Place balloons on the approaches, not in the middle — there their circle goes off before the swarm reaches the warehouse.",
      "Scout before a raid: you see where the guns are thick and on which side there is a gap.",
      "Drones you are not using go out with the nightly shipment: a container pays back double.",
      "Short of money — play missions: they pay for every drone beaten off.",
      "Upgrades make things dearer but stronger — upgrade what you have most of.",
      "A battle counts only when finished: reload mid-battle and you can defend the raid again.",
    ],
  },
];

const ru: RuleSection[] = [
  {
    title: "С чего начать",
    steps: true,
    lines: [
      "**Построй склад.** Возьми «Площадь» и тяни рамку от стартового квадрата {starter}×{starter} — склад может быть любой величины и формы, лишь бы цельный. Клетка стоит {cell} кр. Чем больше склад, тем больше места под установки и ящики, но и гореть есть чему. Набралось хотя бы 25 клеток — дай складу имя, и он основан.",
      "**Поставь оборону.** Без пушек склад не защитить: дроны летят на клетки и поджигают их. Зенитка ({gun} кр) сама бьёт всё, что в радиусе {gunRange} клеток; ракетница ({rocket} кр) пускает ракету, которая доворачивает на цель. Ставь их так, чтобы круги перекрывали подходы. В помощь им — огнетушители (тушат пожар вокруг себя), ловушки (держат дронов магнитом) и шары (разовое заграждение на пути роя). Пока инструмент выбран, круги его установок видны на карте.",
      "**Купи дронов.** Инструмент «Дроны» ставит на свободную клетку ящик на {perCell} штук за {droneBox} кр. Дроны — и товар, и оружие: каждую полночь по Лондону всё, что лежит на складе, продаётся вдвое дороже закупки — это твой доход. Их же ты шлёшь в налёты и на разведку.",
      "**Проходи миссии.** Панель «Миссии» — сто боёв на своём складе против всё более сильных волн: бесплатно, в любое время, с премией за каждого отбитого дрона. В бою пушки стреляют сами, а ты добиваешь дронов мышью и тушишь пожары брандспойтом. Номер последней пройденной миссии — твой уровень, его видят соперники.",
      "**Добавь врагов и устраивай налёты.** Впиши почту соперника в «Врагах», разведай его склад одним дроном, потом собери налёт из волн и начинок. За каждую сожжённую клетку — премия {loot} кр, и тем щедрее, чем сильнее разгром. Соперник отбивается у себя, а ты получаешь отчёт и повтор боя.",
    ],
  },
  {
    title: "Склад и деньги",
    lines: [
      "Начинаешь с {credits} кр и складом {starter}×{starter} посреди поля — он твой даром.",
      "Каждую полночь по Лондону уходит отгрузка: всё, что лежит на складе, продаётся вдвое дороже закупки — контейнер дронов уходит за {droneBoxSale} кр на нулевом уровне дронов и до {droneBoxSaleTop} на десятом. Это и есть доход склада: аренды с клеток нет. Что не пустил в дело, то продано. Сервер проводит отгрузку сам и пишет итог в телеграм, если бот привязан.",
      "Не хватает денег — банк даёт {loanMin}–{loanMax} кр на {loanHours} часа под {loanRate}%. Купленный на них товар может сгореть в налёте, долг — нет.",
      "Стратегия кассы: основные деньги — с чужих складов ({loot} кр за сожжённую клетку). Премия за отбой меньше — при чистом отбое крупного роя это сотни или около тысячи, в среднем вдвое–втрое скромнее атаки; миссии тоже её дают. Упал в ноль — заём, миссия или полный снос с подушкой не меньше {credits} кр.",
    ],
  },
  {
    title: "Стройка",
    lines: [
      "«Площадь» — тяни рамку или ткни в клетку. Новая клетка стоит {cell} кр и должна примыкать к тому, что уже стоит.",
      "«Ремонт» — так же, {repair} кр за сгоревшую клетку.",
      "«Снос» — снести пустые клетки склада, целые или сгоревшие, по {scrap} кр за клетку. Остаётся голая земля. Клетку, где стоит установка или ящик, не снести; склад не должен развалиться надвое и стать меньше {minCells} клеток.",
      "«Пушка» — {gun} кр на свободную целую клетку.",
      "«Ракетница» — {rocket} кр, ставится и таскается как пушка. Достаёт на {rocketRange} клеток, как зенитка, и пускает неточно, зато ракета сама доворачивает на ту цель, в которую её пустили, и быстрее снаряда зенитки. В воздухе держит одну ракету, перезарядка {rocketReload} с.",
      "«Огнетушитель» — {spray} кр, ставится и таскается так же, как пушка. Он не стреляет: как только в радиусе {sprayRange} клеток занимается огонь, установка раскручивается и бьёт восемью струями вокруг себя. Струя упирается в первый же очаг и гасит его не сразу. Вода из водопровода и не кончается, но большой пожар может пересилить и плотный ковёр установок.",
      "«Ловушка» — {trap} кр, ставится и таскается как пушка. Магнитом удерживает до {trapCap} дронов в радиусе {trapRange} клеток; лишние пролетают. Зенитки всё ещё могут сбивать захваченных; если ловушка сгорает — захват сбрасывается.",
      "«Дроны» — контейнер на {perCell} штук за {droneBox} кр. С уровнем дронов дорожает — до {droneBoxTop} кр на десятом.",
      "«Шары» — {balloon} кр, разовая пусковая установка, ставится как пушка. Как только в её круг радиусом {balloonRange} клеток входит дрон, она почти разом выбрасывает {balloonCount} аэростатов, ровно раскидывая их по всему кругу, и пропадает — на клетке ничего не остаётся. Дальше шары медленно плывут, и влетевший дрон гибнет вместе с шаром — без пожара, без вреда складу и земле. Но снаряд зенитки или ракета лопнут шар на своём пути с тем же успехом. Каждый уровень расширяет круг и прибавляет два шара.",
      "Установки и контейнеры таскаются по складу в любом режиме, и это бесплатно. Уронишь на занятую клетку — поменяются местами. Двойной клик продаёт установку или контейнер по нынешней цене закупки.",
      "«Чертежи» — сохрани нынешний склад под именем, чтобы вернуться к нему позже. Перестройка сносит нынешний склад и продаёт его — целые клетки по цене постройки, сгоревшие во вторсырьё, установки, дроны и шары по цене закупки — и ставит на его месте чертёж. Платится только разница, дронов в чертеже нет.",
    ],
  },
  {
    title: "Оборона",
    lines: [
      "Налёты встают в очередь и отбиваются строго по порядку — переставить и пропустить нельзя.",
      "Готовься сколько нужно: первый в очереди ждёт, но отбить можно только его.",
      "Бой засчитывается, только когда доигран до конца. Обновил страницу или закрыл вкладку посреди боя — он не в счёт: налёт остаётся первым в очереди, склад цел, и отбивать можно заново.",
      "В бою пушки работают сами — радиус {gunRange} клеток, перезарядка {reload} с. Дрон в перекрестье — мышь бьёт очередью, хоть над складом; нет дрона — над складом брандспойт, над землёй пулемёт. Снаряд зенитки неуправляемый: она бьёт с упреждением и стреляет, только довернув башню. Установки бьют сообща — по цели, в которую уже летит снаряд или ракета, другие не стреляют, а промах её снова отпускает.",
      "Огонь перекидывается на соседние клетки каждые {spread} с. Контейнер на горящей клетке пропадает вместе с дронами, пушка там же гибнет.",
    ],
  },
  {
    title: "Налёты",
    lines: [
      "Добавь соперника по почте — он тоже должен играть.",
      "Собери налёт из волн: у каждой свой рисунок, сторона и начинка (пустая, взрывчатка, подавление пушек, огнетушителей или ловушек, невидимка, обдув, турбо, броня, стрелок). До {maxRaid} дронов. Чем больше рой, тем гуще строй — налёт почти не растягивается. Дроны уходят со склада сразу, за начинку доплачиваются кредиты. У кольца и спирали вместо стороны — вращение: по часовой, против или, у кольца, без него.",
      "Начинка «обдув» взрывается как простая, а на подлёте расталкивает аэростаты: шар отходит на несколько клеток в сторону от дрона, не лопаясь. Несколько таких в рое заметно сокращают потери на заграждении, треть роя — сводит их почти к нулю.",
      "Подавление ловушек работает так же, но круг у него вдвое меньше, чем у самой ловушки: приходится подходить вплотную, под пушки. Пока круг накрывает магнит, тот никого не держит и отпускает захваченных.",
      "Начинка «невидимка» взрывается как обычная, но пушки и ракетницы её не видят вовсе: ни целятся, ни наводят ракету. Против неё остаются руки игрока, ловушки и шары: о шар она разбивается, как любой дрон, и пусковую установку тоже запускает.",
      "Начинка «турбо» взрывается как простая, но дрон летит в полтора раза быстрее — меньше времени под огнём.",
      "Начинка «броня» взрывается как простая, но зенитке нужно два попадания: после первого дрон летит дальше, дымясь. Ракета и пулемёт сбивают его с одного.",
      "Начинка «стрелок» несёт одну ракету и пускает её по складу с {shooterRange} клеток — дальше, чем достаёт зенитка средней прокачки. Ракета поджигает одну клетку, как и дрон, а сам стрелок, выстрелив, идёт таранить склад. Ракета быстрее дрона, но медленнее нашей, и зенитка её сбивает.",
      "Налёт отбивает защитник у себя. Тебе приходит отчёт — и повтор боя, который можно посмотреть целиком.",
      "За каждую сожжённую клетку тебе идёт премия {loot} кр. Защитнику — премия за отбой: {defendClean} кр за дрона при чистом отбое, иначе {defendDirty} кр за дрона минус {defendBurn} кр за сгоревшую клетку. Страховая платит {insureCell} кр за клетку — ровно на ремонт. Базовый полис на этом и кончается; каждый его уровень добавляет {insureShare}% покрытия сгоревшего товара и пушек, до полной стоимости.",
      "Премия не плоская: она растёт с долей сожжённого склада. За половину платят на четверть больше за клетку, за четыре пятых — вдвое, за весь склад — втрое, до {lootMax} кр за клетку. Добить одного выгоднее, чем пощипать десятерых.",
      "После полного сноса склад сбрасывается, но на счету будет не меньше {credits} кр — чтобы было на чем отстроиться.",
      "За сбитых дронов не платят никому: деньги приносит товар, а не стрельба.",
      "Каждый отгремевший бой попадает в журнал: там его можно пересмотреть или дать ссылку, чтобы посмотрели другие.",
    ],
  },
  {
    title: "Миссии",
    lines: [
      "Миссии — одиночная кампания: 100 боёв на своём складе, без соперника, в любое время и бесплатно.",
      "В каждой миссии 8–10 волн: первые идут по очереди, мелкие и простые, к концу волны крупнеют, приходят кучнее и накладываются друг на друга. С номером растёт и всё вместе — от 120 дронов на первой до 1000 на сотой, с прокачанными дронами и вперемешку всеми видами начинки.",
      "Счёт миссии — сколько процентов склада уцелело: сберёг всё — 100. Лучший счёт по каждому номеру хранится.",
      "Следующая миссия открывается, если склад уцелел хоть сколько-то. Пройденные можно переиграть: у номера всегда один и тот же рой, так что счёт честно сравним.",
      "Миссия платит премией за отбой — {defendClean} кр за каждого дрона при чистом отбое, так что чем дальше номер и больше рой, тем выше награда. Сгоревшее в миссии сгорает по-настоящему, но страховка его покрывает, как в любом бою.",
    ],
  },
  {
    title: "Разведка",
    lines: [
      "На разведку тратятся те же дроны, что лежат в контейнерах склада.",
      "Вылет уносит тебя на карту соперника под туманом войны. Самолёт заходит со случайного края и открывает круг вокруг себя; рулишь стрелками влево-вправо. Или держи палец на карте — самолёт сам заворачивает к нему.",
      "Его могут сбить чужие пушки. Кончились дроны — вылет окончен.",
      "Снятое остаётся твоим вместе с пробелами — кнопка «Карта» в карточке соперника. Но данные стареют: где враг с тех пор перестраивался, тот участок снова затягивает туманом.",
    ],
  },
  {
    title: "Прокачка",
    lines: [
      "Классы стоят {upgrade} кр за уровень. Уровни считаются с нуля и доходят до десятого, у полиса — до четвёртого: дальше покрывать нечего.",
      "Дроны летят быстрее и на разведке видят дальше, пушки бьют дальше и резвее, пулемёт точнее, струя шире, огнетушители заливают круг побольше, ловушки хватают дальше. Шары — шире круг и на два шара больше за уровень.",
      "Ракетницы растут так же: с каждым уровнем дальше достают и быстрее гонят ракету.",
      "Уровень достаётся всему классу разом — и тому, что уже на складе, и тому, что купишь потом.",
    ],
  },
  {
    title: "Советы",
    lines: [
      "Перекрывай круги зениток: одна пушка на подходе не успевает за роем.",
      "Не сваливай всё в одну кучу — огонь перекидывается на соседние клетки, и пожар съест и ящики, и пушки.",
      "Огнетушители ставь вглубь склада: они спасают то, что прорвалось сквозь оборону.",
      "Шары ставь на подходах, а не в середине — там их круг срабатывает раньше, чем рой дойдёт до склада.",
      "Перед налётом разведай склад: видно, где пушки стоят густо, а с какой стороны дыра.",
      "Не пускаешь дронов в дело — пусть уходят с ночной отгрузкой: ящик возвращает вдвое.",
      "Не хватает денег — проходи миссии: они платят за каждого отбитого дрона.",
      "Прокачка дорожит вещи, но делает их сильнее — качай то, чего у тебя больше всего.",
      "Бой засчитывается, только если доигран: обновил страницу посреди боя — налёт можно отбить заново.",
    ],
  },
];

const es: RuleSection[] = [
  {
    title: "Cómo empezar",
    steps: true,
    lines: [
      "**Construye el almacén.** Toma «Superficie» y arrastra un marco desde el cuadrado inicial de {starter}×{starter}: el almacén puede tener cualquier tamaño y forma, siempre que sea de una pieza. Una celda cuesta {cell} cr. Un almacén mayor tiene más sitio para instalaciones y contenedores, pero también más que arder. Con al menos 25 celdas, ponle nombre y queda fundado.",
      "**Monta la defensa.** Sin cañones el almacén no se defiende: los drones vuelan hacia las celdas y las incendian. El cañón ({gun} cr) dispara solo a todo lo que esté a {gunRange} celdas; la lanzadera ({rocket} cr) lanza un misil que corrige hacia su objetivo. Colócalos para que sus círculos cubran los accesos. Les ayudan los extintores (apagan el fuego a su alrededor), las trampas (retienen drones con un imán) y los globos (una barrera de un solo uso en el camino del enjambre). Con una herramienta elegida, los círculos de sus instalaciones se ven en el mapa.",
      "**Compra drones.** La herramienta «Drones» pone en una celda libre un contenedor de {perCell} por {droneBox} cr. Los drones son mercancía y arma a la vez: cada medianoche, hora de Londres, todo lo almacenado se vende al doble del precio de compra: ese es tu ingreso. También los envías a ataques y a explorar.",
      "**Juega las misiones.** El panel «Misiones» son cien combates en tu propio almacén contra oleadas cada vez más fuertes: gratis, cuando quieras, con premio por cada dron rechazado. En combate los cañones disparan solos, y tú rematas drones con el ratón y apagas incendios con la manguera. El número de tu última misión superada es tu nivel, y los rivales lo ven.",
      "**Añade rivales y atácalos.** Escribe el correo de un rival en «Rivales», explora su almacén con un dron y luego arma un ataque de oleadas y cargas. Cada celda quemada paga {loot} cr, y más cuanto mayor sea el destrozo. El rival se defiende en su lado y tú recibes un informe y la repetición.",
    ],
  },
  {
    title: "El almacén y el dinero",
    lines: [
      "Empiezas con {credits} cr y un almacén de {starter}×{starter} en medio del campo: es tuyo gratis.",
      "Cada medianoche, hora de Londres, sale el envío: todo lo almacenado se vende al doble del precio de compra — un contenedor de drones sale por {droneBoxSale} cr con drones de nivel 0 y hasta {droneBoxSaleTop} en el nivel 10. Ese es el ingreso del almacén: las celdas no pagan renta. Lo que no enviaste al combate, se vende. El servidor hace el envío solo y avisa en Telegram, si el bot está vinculado.",
      "¿Falta dinero? El banco presta {loanMin}–{loanMax} cr por {loanHours} horas al {loanRate}%. La mercancía comprada puede arder en un ataque; la deuda no.",
      "Estrategia de caja: el dinero gordo viene de quemar almacenes rivales ({loot} cr por celda). La prima de defensa es menor — un rechazo limpio de un enjambre grande da cientos o cerca de mil, unas dos o tres veces menos que un ataque bueno; las misiones también la pagan. Sin un cr — préstamo, una misión o derribo total con un suelo de al menos {credits} cr.",
    ],
  },
  {
    title: "Construcción",
    lines: [
      "«Área»: arrastra un marco o toca una celda. Una celda nueva cuesta {cell} cr y debe tocar lo ya construido.",
      "«Reparar»: igual, {repair} cr por celda quemada.",
      "«Demoler»: derriba celdas vacías del almacén, intactas o quemadas, a {scrap} cr cada una. Queda tierra desnuda; una celda con instalación o contenedor no se derriba, el almacén debe seguir de una pieza y no bajar de {minCells} celdas.",
      "«Cañón»: {gun} cr en una celda intacta libre.",
      "«Lanzadera» — {rocket} cr, se coloca y se arrastra como un cañón. Alcanza {rocketRange} celdas, como un cañón, y dispara con desvío, pero el misil corrige solo hacia el objetivo al que se lanzó y vuela más rápido que el proyectil del cañón. Un misil por lanzadera en el aire y {rocketReload} s de recarga.",
      "«Extintor»: {spray} cr, se coloca y se arrastra igual que un cañón. No dispara: en cuanto arde una celda a menos de {sprayRange}, la instalación gira y lanza ocho chorros a su alrededor. Cada chorro se detiene en el primer foco y tarda en apagarlo. Tira de la red de agua y nunca se queda seco, pero un incendio grande aún puede con un anillo denso.",
      "«Trampa»: {trap} cr, se coloca y se arrastra como un cañón. Retiene magnéticamente hasta {trapCap} drones a {trapRange} celdas; el resto pasa. Los cañones aún pueden derribar a los atrapados; si la trampa arde, la sujeción se pierde.",
      "«Drones»: un contenedor de {perCell} unidades por {droneBox} cr. Se encarece con el nivel de drones, hasta {droneBoxTop} cr en el décimo.",
      "«Globos» — {balloon} cr, una lanzadera de un solo uso que se coloca como un cañón. En cuanto un dron entra en su círculo de {balloonRange} celdas, suelta casi a la vez {balloonCount} globos de barrera, repartidos por todo el círculo, y desaparece: en su celda no queda nada. Luego los globos flotan despacio y el dron que choca con uno muere con él, sin fuego ni daño al almacén ni al suelo. Pero un proyectil del cañón o un misil revientan igual de bien el globo que se les cruce. Cada nivel ensancha el círculo y añade dos globos.",
      "Las instalaciones y los contenedores se arrastran por el almacén en cualquier modo, gratis. Si sueltas uno sobre una celda ocupada, intercambian el sitio. Con doble clic vendes una instalación o un contenedor al precio de compra actual.",
      "«Planos» — guarda tu almacén actual con un nombre para volver a él más tarde. Reconstruir derriba el almacén actual y lo vende — celdas intactas a precio de construcción, las quemadas como chatarra, instalaciones, drones y globos a precio de compra — y levanta el plano en su lugar. Pagas solo la diferencia; el plano no lleva drones.",
    ],
  },
  {
    title: "Defensa",
    lines: [
      "Los ataques hacen cola y se combaten en orden estricto: no puedes saltarte ninguno ni cambiar el orden.",
      "Tómate el tiempo que necesites: el primero en la cola espera, pero solo ese se puede combatir.",
      "Un combate solo cuenta si se juega hasta el final. Si recargas la página o cierras la pestaña a mitad, no cuenta: el ataque sigue primero en la cola, el almacén queda intacto y puedes defenderte de nuevo.",
      "En combate los cañones actúan solos: {gunRange} celdas de alcance, {reload} s de recarga. Con un dron en el punto de mira el ratón dispara la ametralladora, incluso sobre el almacén; si no hay dron, sobre el almacén va la manguera y sobre el suelo la ametralladora. El proyectil del cañón no es guiado: apunta con anticipación y dispara solo cuando la torreta ha girado. Las instalaciones actúan juntas: ninguna dispara a un objetivo al que ya va un proyectil o misil, y si falla queda libre otra vez.",
      "El fuego pasa a las celdas vecinas cada {spread} s. Un contenedor en una celda ardiendo se pierde con sus drones; un cañón allí también muere.",
    ],
  },
  {
    title: "Ataques",
    lines: [
      "Añade un rival por correo: también tiene que estar jugando.",
      "Arma el ataque en oleadas: cada una con su patrón, lado y carga (vacía, explosivo, inhibidor de cañones, de extintores o de trampas, invisible, soplador, turbo, blindado, tirador). Hasta {maxRaid} drones. Un enjambre mayor hace la formación más densa — el ataque casi no se alarga. Los drones salen del almacén enseguida; las cargas cuestan un recargo en créditos. El anillo y la espiral tienen giro en vez de lado: horario, antihorario o, en el anillo, ninguno.",
      "La carga de soplado estalla como la simple y, de camino, aparta los globos de barrera: el globo se desplaza varias celdas lejos del dron sin reventar. Unos pocos sopladores en el enjambre ya recortan mucho lo que se llevan los globos; un tercio del enjambre lo deja casi en cero.",
      "El inhibidor de trampas funciona igual, pero su círculo es la mitad del de la trampa: tiene que acercarse mucho, bajo los cañones. Mientras el círculo cubre el imán, este no retiene a nadie y suelta a los capturados.",
      "La carga invisible estalla como la simple, pero los cañones y las lanzaderas no la ven en absoluto: ni apuntan ni guían el misil. Contra ella solo quedan tus manos, las trampas y los globos: choca con un globo como cualquier dron y también activa la lanzadera de globos.",
      "La carga turbo estalla como la simple, pero el dron vuela una vez y media más rápido — menos tiempo bajo fuego.",
      "El dron blindado estalla como el simple, pero el cañón necesita dos impactos: tras el primero sigue volando entre humo. El misil de la lanzadera y tu ametralladora lo derriban de uno.",
      "El tirador lleva un misil y lo dispara contra el almacén desde {shooterRange} celdas, más lejos de lo que alcanza un cañón de nivel medio. El misil incendia una celda, como un dron; luego el tirador va a estrellarse contra el almacén. El misil es más rápido que un dron pero más lento que el nuestro, y un cañón puede derribarlo.",
      "El defensor combate el ataque en su pantalla. Tú recibes un informe y la repetición completa del combate.",
      "Por cada celda quemada recibes una prima de {loot} cr. Al defensor, una prima de defensa: {defendClean} cr por dron si no arde nada, o {defendDirty} cr por dron menos {defendBurn} cr por celda quemada. El seguro le paga {insureCell} cr por celda: justo la reparación. La póliza básica acaba ahí; cada nivel añade un {insureShare}% de cobertura de la mercancía y los cañones perdidos, hasta el valor total.",
      "La prima no es plana: crece con la parte del almacén que quemas. Por la mitad pagan una cuarta parte más por celda, por cuatro quintos el doble, por todo el triple — hasta {lootMax} cr por celda. Rematar a uno renta más que picotear a diez.",
      "Tras un derribo total el almacén se reinicia, pero la cuenta sube al menos a {credits} cr para poder reconstruir.",
      "Nadie cobra por drones derribados: el dinero lo trae la mercancía, no los disparos.",
      "Cada combate terminado va al registro: puedes volver a verlo o copiar un enlace para que lo vean otros.",
    ],
  },
  {
    title: "Misiones",
    lines: [
      "Las misiones son una campaña en solitario: 100 combates en tu propio almacén, sin rival, cuando quieras y gratis.",
      "Cada misión tiene 8–10 oleadas: las primeras llegan una tras otra, pequeñas y simples; hacia el final crecen, se apiñan y se solapan. Con el número crece todo: de 120 drones en la primera a 1000 en la centésima, con drones mejorados y todo tipo de carga mezclada.",
      "La puntuación de una misión es el porcentaje del almacén que sobrevivió: si lo salvas todo, 100. Se guarda la mejor puntuación de cada número.",
      "La siguiente misión se abre si sobrevive algo del almacén. Las superadas se pueden repetir: cada número trae siempre el mismo enjambre, así que las puntuaciones se comparan con justicia.",
      "Una misión paga la prima de defensa — {defendClean} cr por dron si no arde nada —, así que cuanto más alto el número y mayor el enjambre, mayor la recompensa. Lo que arde en una misión arde de verdad, pero el seguro lo cubre como en cualquier combate.",
    ],
  },
  {
    title: "Exploración",
    lines: [
      "La exploración gasta drones de los mismos contenedores del almacén que los ataques.",
      "El vuelo te lleva sobre el mapa del rival bajo niebla de guerra. El avión entra por un borde al azar y descubre un círculo a su alrededor; guía con las flechas. O mantén el dedo en el mapa y el avión gira hacia él.",
      "Sus cañones pueden derribarlo. Sin aviones, la salida termina.",
      "Lo cartografiado es tuyo, huecos incluidos: botón «Mapa» en la ficha del rival. Pero envejece: donde el rival haya reconstruido desde tu vuelo, la niebla vuelve a cubrir esa zona.",
    ],
  },
  {
    title: "Mejoras",
    lines: [
      "Las clases cuestan {upgrade} cr por nivel. Los niveles van de cero a diez; la póliza se queda en el cuarto, cuando la cobertura ya es total.",
      "Los drones vuelan más rápido y ven más lejos en exploración, los cañones llegan más lejos y disparan antes, la ametralladora apunta mejor, la manguera cubre más, los extintores riegan un círculo mayor, las trampas atrapan más lejos. Globos: un círculo más amplio y dos globos más por nivel.",
      "Las lanzaderas crecen igual: más alcance y misil más rápido con cada nivel.",
      "El nivel vale para toda la clase a la vez: lo que ya tienes y lo que compres después.",
    ],
  },
  {
    title: "Consejos",
    lines: [
      "Solapa los círculos de los cañones: uno solo en un acceso no puede con un enjambre.",
      "No lo amontones todo: el fuego pasa a las celdas vecinas y se come contenedores y cañones.",
      "Pon los extintores hacia dentro: salvan lo que atraviesa la defensa.",
      "Coloca los globos en los accesos, no en el centro: ahí su círculo salta antes de que el enjambre llegue al almacén.",
      "Explora antes de atacar: ves dónde hay muchos cañones y por qué lado hay un hueco.",
      "Los drones que no uses salen con el envío nocturno: un contenedor devuelve el doble.",
      "¿Falta dinero? Juega misiones: pagan por cada dron rechazado.",
      "Mejorar encarece las cosas pero las hace más fuertes: mejora lo que más tengas.",
      "Un combate solo cuenta si se termina: si recargas a mitad, puedes defender el ataque otra vez.",
    ],
  },
];

const pt: RuleSection[] = [
  {
    title: "Por onde começar",
    steps: true,
    lines: [
      "**Constrói o armazém.** Escolhe «Área» e arrasta um retângulo a partir do quadrado inicial de {starter}×{starter} — o armazém pode ter qualquer tamanho e forma, desde que seja inteiro. Uma célula custa {cell} cr. Um armazém maior tem mais espaço para instalações e contentores, mas também mais para arder. Com pelo menos 25 células, dá-lhe um nome e fica fundado.",
      "**Monta a defesa.** Sem canhões o armazém não se defende: os drones voam para as células e incendeiam-nas. O canhão ({gun} cr) dispara sozinho em tudo a {gunRange} células; o lançador ({rocket} cr) lança um míssil que corrige para o alvo. Coloca-os de modo a que os círculos cubram os acessos. Ajudam-nos os extintores (apagam o fogo à volta), as armadilhas (prendem drones com um íman) e os balões (uma barreira de uso único no caminho do enxame). Com uma ferramenta escolhida, os círculos das suas instalações aparecem no mapa.",
      "**Compra drones.** A ferramenta «Drones» põe numa célula livre um contentor de {perCell} por {droneBox} cr. Os drones são mercadoria e arma: todas as meias-noites, hora de Londres, tudo o que está guardado vende-se ao dobro da compra — é esse o teu rendimento. Também os mandas em ataques e em reconhecimento.",
      "**Joga as missões.** O painel «Missões» são cem combates no teu próprio armazém contra vagas cada vez mais fortes: grátis, quando quiseres, com prémio por cada drone repelido. Em combate os canhões disparam sozinhos, e tu acabas com drones com o rato e apagas fogos com a mangueira. O número da última missão passada é o teu nível, e os rivais veem-no.",
      "**Adiciona rivais e ataca-os.** Escreve o e-mail de um rival em «Rivais», faz o reconhecimento do armazém dele com um drone e depois monta um ataque de vagas e cargas. Cada célula queimada paga {loot} cr, e mais quanto maior a destruição. O rival defende-se do lado dele e tu recebes um relatório e a repetição.",
    ],
  },
  {
    title: "O armazém e o dinheiro",
    lines: [
      "Começas com {credits} cr e um armazém de {starter}×{starter} no meio do campo — é teu de graça.",
      "Todas as meias-noites, hora de Londres, sai a expedição: tudo o que está guardado vende-se ao dobro da compra — um contentor de drones sai por {droneBoxSale} cr com drones de nível 0 e até {droneBoxSaleTop} no nível 10. É esse o rendimento do armazém: as células não pagam renda. O que não mandaste ao combate é vendido. O servidor faz a expedição sozinho e avisa no Telegram, se o bot estiver ligado.",
      "Falta dinheiro? O banco empresta {loanMin}–{loanMax} cr por {loanHours} horas a {loanRate}%. A mercadoria comprada pode arder num ataque; a dívida não.",
      "Estratégia de caixa: o dinheiro grosso vem de queimar armazéns rivais ({loot} cr por célula). O prémio de defesa é menor — uma defesa limpa de um enxame grande dá centenas ou cerca de mil, em média duas a três vezes menos que um ataque bom; as missões também o pagam. A zero — empréstimo, uma missão ou derrube total com chão de pelo menos {credits} cr.",
    ],
  },
  {
    title: "Construção",
    lines: [
      "«Área» — arrasta uma moldura ou toca numa célula. Uma célula nova custa {cell} cr e tem de tocar no que já está de pé.",
      "«Reparar» — igual, {repair} cr por célula queimada.",
      "«Demolir» — deita abaixo células vazias do armazém, intactas ou queimadas, a {scrap} cr cada. Fica terra nua; uma célula com instalação ou contentor não se demole, o armazém tem de continuar inteiro e não ficar com menos de {minCells} células.",
      "«Canhão» — {gun} cr numa célula intacta livre.",
      "«Lançador» — {rocket} cr, coloca-se e arrasta-se como um canhão. Alcança {rocketRange} células, como um canhão, e dispara torto, mas o míssil corrige sozinho para o alvo a que foi lançado e voa mais depressa que o projéctil do canhão. Um míssil por lançador no ar e {rocketReload} s de recarga.",
      "«Extintor» — {spray} cr, coloca-se e arrasta-se tal como um canhão. Não dispara: assim que uma célula a menos de {sprayRange} pega fogo, a instalação gira e lança oito jactos à sua volta. Cada jacto pára no primeiro foco e demora a apagá-lo. Liga-se à rede de água e nunca fica seco, mas um incêndio grande ainda pode vencer um anel denso.",
      "«Armadilha» — {trap} cr, coloca-se e arrasta-se como um canhão. Retém magneticamente até {trapCap} drones a {trapRange} células; os demais passam. Os canhões ainda podem abater os capturados; se a armadilha arder, a retenção cai.",
      "«Drones» — um contentor de {perCell} unidades por {droneBox} cr. Fica mais caro com o nível dos drones, até {droneBoxTop} cr no décimo.",
      "«Balões» — {balloon} cr, um lançador de uso único que se coloca como um canhão. Assim que um drone entra no seu círculo de {balloonRange} células, solta quase de uma vez {balloonCount} balões de barragem, espalhados por todo o círculo, e desaparece — na célula não fica nada. Depois os balões flutuam devagar e o drone que bate num morre com ele, sem fogo nem dano ao armazém ou ao chão. Mas um projéctil do canhão ou um míssil rebentam com igual facilidade o balão que lhes aparece à frente. Cada nível alarga o círculo e junta dois balões.",
      "Instalações e contentores arrastam-se pelo armazém em qualquer modo, de graça. Larga um numa célula ocupada e trocam de lugar. Um duplo clique vende uma instalação ou um contentor ao preço de compra atual.",
      "«Plantas» — guarda o armazém atual com um nome para voltar a ele mais tarde. Reconstruir demole o armazém atual e vende-o — células intactas ao preço de construção, as queimadas como sucata, instalações, drones e balões ao preço de compra — e ergue a planta no lugar dele. Pagas só a diferença; a planta não leva drones.",
    ],
  },
  {
    title: "Defesa",
    lines: [
      "Os ataques formam fila e são travados por ordem estrita — não podes saltar nem reordenar.",
      "Prepara-te o tempo que precisares: o primeiro na fila espera, mas só esse se pode travar.",
      "Um combate só conta quando é jogado até ao fim. Recarregaste a página ou fechaste o separador a meio — não conta: o ataque continua primeiro na fila, o armazém fica intacto e podes defender de novo.",
      "Em combate os canhões trabalham sozinhos — {gunRange} células de alcance, {reload} s de recarga. Com um drone na mira o rato dispara a metralhadora, mesmo sobre o armazém; sem drone, sobre o armazém vai a mangueira e sobre o chão a metralhadora. O projéctil do canhão não é guiado: aponta com antecipação e só dispara depois de a torre rodar. As instalações atuam em conjunto — nenhuma dispara contra um alvo a que já vai um projéctil ou míssil, e um falhanço liberta-o de novo.",
      "O fogo passa às células vizinhas a cada {spread} s. Um contentor numa célula a arder perde-se com os drones; um canhão ali também morre.",
    ],
  },
  {
    title: "Ataques",
    lines: [
      "Adiciona um rival por e-mail — ele também tem de estar a jogar.",
      "Monta o ataque em vagas: cada uma com o seu padrão, lado e carga (vazia, explosivo, inibidor de canhões, de extintores ou de armadilhas, invisível, soprador, turbo, blindado, atirador). Até {maxRaid} drones. Um enxame maior torna a formação mais densa — o ataque quase não se alonga. Os drones saem do armazém logo; as cargas custam um extra em créditos. O anel e a espiral têm rotação em vez de lado: horária, anti-horária ou, no anel, nenhuma.",
      "A carga de sopro explode como a simples e, na aproximação, afasta os balões de barragem: o balão desloca-se várias células para longe do drone sem rebentar. Alguns sopradores no enxame já cortam bastante o que os balões levam; um terço do enxame deixa isso quase em zero.",
      "O inibidor de armadilhas funciona igual, mas o seu círculo é metade do da armadilha: tem de chegar perto, debaixo dos canhões. Enquanto o círculo cobre o íman, este não segura ninguém e larga os capturados.",
      "A carga invisível explode como a simples, mas canhões e lançadores não a veem de todo: não apontam nem guiam o míssil. Contra ela restam as tuas mãos, as armadilhas e os balões: bate num balão como qualquer drone e também dispara o lançador de balões.",
      "A carga turbo explode como a simples, mas o drone voa uma vez e meia mais depressa — menos tempo sob fogo.",
      "O drone blindado explode como o simples, mas o canhão precisa de dois acertos: depois do primeiro continua a voar a fumegar. O míssil do lançador e a tua metralhadora derrubam-no de uma vez.",
      "O atirador leva um míssil e dispara-o contra o armazém a {shooterRange} células — mais longe do que alcança um canhão de nível médio. O míssil incendeia uma célula, como um drone; depois o atirador vai embater no armazém. O míssil é mais rápido que um drone mas mais lento que o nosso, e um canhão pode abatê-lo.",
      "O defensor trava o ataque no ecrã dele. Tu recebes um relatório — e a repetição completa do combate.",
      "Por cada célula queimada recebes um prémio de {loot} cr. Ao defensor, um prémio de defesa: {defendClean} cr por drone se nada arder, ou {defendDirty} cr por drone menos {defendBurn} cr por célula queimada. O seguro paga {insureCell} cr por célula — exatamente a reparação. A apólice básica fica por aí; cada nível acrescenta {insureShare}% de cobertura da mercadoria e dos canhões perdidos, até ao valor total.",
      "A prima não é plana: cresce com a parte do armazém que queimas. Por metade pagam um quarto a mais por célula, por quatro quintos o dobro, por tudo o triplo — até {lootMax} cr por célula. Acabar com um rende mais do que beliscar dez.",
      "Depois de um derrube total o armazém reinicia, mas a conta sobe pelo menos a {credits} cr para poderes reconstruir.",
      "Ninguém é pago por drones abatidos: o dinheiro vem da mercadoria, não dos tiros.",
      "Cada combate terminado vai para o registo: podes revê-lo ou copiar uma ligação para outros verem.",
    ],
  },
  {
    title: "Missões",
    lines: [
      "As missões são uma campanha a solo: 100 combates no teu próprio armazém, sem rival, quando quiseres e de graça.",
      "Cada missão tem 8–10 vagas: as primeiras chegam uma após outra, pequenas e simples; para o fim crescem, vêm mais juntas e sobrepõem-se. Com o número cresce tudo: de 120 drones na primeira a 1000 na centésima, com drones melhorados e todo o tipo de carga misturada.",
      "A pontuação de uma missão é a percentagem do armazém que sobreviveu: salvas tudo, 100. Guarda-se a melhor pontuação de cada número.",
      "A missão seguinte abre se sobreviver algo do armazém. As passadas podem repetir-se: cada número traz sempre o mesmo enxame, por isso as pontuações comparam-se com justiça.",
      "Uma missão paga o prémio de defesa — {defendClean} cr por drone se nada arder —, por isso quanto mais alto o número e maior o enxame, maior a recompensa. O que arde numa missão arde a sério, mas o seguro cobre-o como em qualquer combate.",
    ],
  },
  {
    title: "Reconhecimento",
    lines: [
      "O reconhecimento gasta drones dos mesmos contentores do armazém que os ataques.",
      "O voo leva-te sobre o mapa do rival sob nevoeiro de guerra. O avião entra por um bordo ao acaso e descobre um círculo à sua volta; guia com as setas. Ou mantém o dedo no mapa e o avião vira para ele.",
      "Os canhões dele podem abatê-lo. Sem aviões, a saída acaba.",
      "O que mapeaste fica teu, falhas incluídas — botão «Mapa» na ficha do rival. Mas envelhece: onde ele reconstruiu depois do teu voo, o nevoeiro volta a cobrir essa zona.",
    ],
  },
  {
    title: "Melhorias",
    lines: [
      "As classes custam {upgrade} cr por nível. Os níveis vão de zero a dez; a apólice fica no quarto, quando a cobertura já é total.",
      "Os drones voam mais depressa e veem mais longe em reconhecimento, os canhões alcançam mais longe e disparam mais rápido, a metralhadora acerta melhor, a mangueira cobre mais, os extintores regam um círculo maior, as armadilhas apanham mais longe. Balões — um círculo mais largo e mais dois balões por nível.",
      "Os lançadores crescem do mesmo modo: mais alcance e míssil mais rápido a cada nível.",
      "O nível vale para toda a classe de uma vez: o que já tens e o que comprares depois.",
    ],
  },
  {
    title: "Conselhos",
    lines: [
      "Sobrepõe os círculos dos canhões: um só num acesso não aguenta um enxame.",
      "Não amontoes tudo: o fogo passa às células vizinhas e come contentores e canhões.",
      "Põe os extintores mais para dentro: salvam o que atravessa a defesa.",
      "Coloca os balões nos acessos, não no meio — aí o círculo dispara antes de o enxame chegar ao armazém.",
      "Faz reconhecimento antes de atacar: vês onde há muitos canhões e de que lado há uma falha.",
      "Os drones que não usares saem com a expedição da noite: um contentor rende o dobro.",
      "Falta dinheiro? Joga missões: pagam por cada drone repelido.",
      "Melhorar encarece as coisas mas torna-as mais fortes — melhora o que tens em maior número.",
      "Um combate só conta quando termina: recarregaste a meio — podes defender o ataque de novo.",
    ],
  },
];

const fr: RuleSection[] = [
  {
    title: "Pour commencer",
    steps: true,
    lines: [
      "**Bâtis l’entrepôt.** Prends « Surface » et tire un cadre depuis le carré de départ {starter}×{starter} — l’entrepôt peut avoir n’importe quelle taille et forme, tant qu’il est d’un seul tenant. Une case coûte {cell} cr. Plus il est grand, plus il y a de place pour les installations et les conteneurs, mais aussi plus à brûler. À partir de 25 cases, donne-lui un nom et il est fondé.",
      "**Monte la défense.** Sans canons, l’entrepôt ne se défend pas : les drones foncent sur les cases et les embrasent. Le canon ({gun} cr) tire seul sur tout ce qui est à {gunRange} cases ; le lance-roquettes ({rocket} cr) tire un missile qui se dirige vers sa cible. Place-les pour que leurs cercles couvrent les approches. Ils sont aidés par les extincteurs (éteignent le feu autour d’eux), les pièges (retiennent les drones par aimant) et les ballons (un barrage à usage unique sur le chemin de l’essaim). Quand un outil est choisi, les cercles de ses installations s’affichent sur la carte.",
      "**Achète des drones.** L’outil « Drones » pose sur une case libre un conteneur de {perCell} pour {droneBox} cr. Les drones sont à la fois marchandise et arme : chaque minuit, heure de Londres, tout ce qui est stocké se vend au double du prix d’achat — c’est ton revenu. Tu les envoies aussi en raid et en reconnaissance.",
      "**Joue les missions.** Le panneau « Missions », ce sont cent combats sur ton propre entrepôt contre des vagues toujours plus fortes : gratuit, quand tu veux, avec une prime par drone repoussé. En combat, les canons tirent seuls, et toi tu achèves les drones à la souris et éteins les incendies à la lance. Le numéro de ta dernière mission réussie est ton niveau, et les rivaux le voient.",
      "**Ajoute des rivaux et lance des raids.** Saisis l’e-mail d’un rival dans « Rivaux », repère son entrepôt avec un drone, puis compose un raid de vagues et de charges. Chaque case brûlée rapporte {loot} cr, et davantage plus le saccage est grand. Le rival se défend de son côté, et tu reçois un rapport et la rediffusion.",
    ],
  },
  {
    title: "L’entrepôt et l’argent",
    lines: [
      "Tu commences avec {credits} cr et un entrepôt de {starter}×{starter} au milieu du terrain — il est à toi gratuitement.",
      "Chaque minuit, heure de Londres, part l’expédition : tout ce qui est stocké se vend au double du prix d’achat — un conteneur de drones part pour {droneBoxSale} cr avec des drones de niveau 0 et jusqu’à {droneBoxSaleTop} au niveau 10. C’est le revenu de l’entrepôt : les cases ne rapportent pas de loyer. Ce que tu n’as pas envoyé au combat est vendu. Le serveur fait l’expédition lui-même et en informe sur Telegram, si le bot est relié.",
      "À court d’argent ? La banque prête {loanMin}–{loanMax} cr pour {loanHours} heures à {loanRate} %. La marchandise achetée peut brûler dans un raid, la dette non.",
      "Stratégie de caisse : le gros de l’argent vient des entrepôts rivaux ({loot} cr par case brûlée). La prime de défense est plus petite — un rejet propre d’un gros essaim rapporte des centaines ou environ mille, en moyenne deux à trois fois moins qu’une bonne attaque ; les missions la donnent aussi. À zéro — emprunt, une mission, ou wipe avec un plancher d’au moins {credits} cr.",
    ],
  },
  {
    title: "Construction",
    lines: [
      "« Surface » — tire un cadre ou clique une case. Une case neuve coûte {cell} cr et doit toucher l’existant.",
      "« Réparer » — pareil, {repair} cr par case brûlée.",
      "« Démolir » — rase des cases vides de l’entrepôt, intactes ou brûlées, à {scrap} cr pièce. Il reste de la terre nue ; une case portant une installation ou un conteneur ne se rase pas, l’entrepôt doit rester d’un seul tenant et garder au moins {minCells} cases.",
      "« Canon » — {gun} cr sur une case intacte libre.",
      "« Lance-roquettes » — {rocket} cr, posé et déplacé comme un canon. Il porte à {rocketRange} cases, comme un canon, et tire large, mais le missile se dirige seul vers la cible sur laquelle il a été tiré et vole plus vite qu’un obus de canon. Un seul missile en l’air par lanceur, {rocketReload} s de recharge.",
      "« Extincteur » — {spray} cr, il se pose et se déplace comme un canon. Il ne tire pas : dès qu’une case s’enflamme à moins de {sprayRange}, l’installation se met à tourner et projette huit jets autour d’elle. Un jet bute sur le premier foyer et met un temps à l’éteindre. Il est branché sur le réseau d’eau et ne tarit jamais, mais un grand incendie peut encore déborder un anneau serré.",
      "« Piège » — {trap} cr, posé et déplacé comme un canon. Il retient magnétiquement jusqu’à {trapCap} drones dans un rayon de {trapRange} cases ; les autres passent. Les canons peuvent encore abattre les capturés ; si le piège brûle, la prise tombe.",
      "« Drones » — un conteneur de {perCell} pièces pour {droneBox} cr. Il renchérit avec le niveau des drones, jusqu’à {droneBoxTop} cr au dixième.",
      "« Ballons » — {balloon} cr, un lanceur à usage unique posé comme un canon. Dès qu’un drone entre dans son cercle de {balloonRange} cases, il lâche presque d’un coup {balloonCount} ballons de barrage, répartis sur tout le cercle, puis disparaît — il ne reste rien sur sa case. Ensuite les ballons dérivent lentement, et le drone qui en percute un meurt avec lui, sans incendie ni dégât pour l’entrepôt ni pour le sol. Mais un obus de canon ou une roquette crèvent tout aussi bien le ballon sur leur trajectoire. Chaque niveau élargit le cercle et ajoute deux ballons.",
      "Installations et conteneurs se déplacent dans l’entrepôt dans n’importe quel mode, gratuitement. Lâche-en un sur une case occupée et ils échangent leur place. Un double-clic vend une installation ou un conteneur au prix d’achat actuel.",
      "« Plans » — enregistre ton entrepôt actuel sous un nom pour y revenir plus tard. Reconstruire rase l’entrepôt actuel et le vend — cases intactes au prix de construction, cases brûlées à la casse, installations, drones et ballons au prix d’achat — et bâtit le plan à sa place. Tu ne paies que la différence ; un plan ne contient pas de drones.",
    ],
  },
  {
    title: "Défense",
    lines: [
      "Les raids font la queue et se jouent strictement dans l’ordre — pas de saut ni de réordonnancement.",
      "Prends le temps qu’il te faut : le premier attend, mais seul lui peut être combattu.",
      "Un combat ne compte que s’il est joué jusqu’au bout. Recharge la page ou ferme l’onglet en plein combat et il ne compte pas : le raid reste premier dans la file, l’entrepôt est intact et tu peux te défendre à nouveau.",
      "Au combat les canons agissent seuls — {gunRange} cases de portée, {reload} s de recharge. Un drone dans le viseur et la souris tire à la mitrailleuse, même au-dessus de l’entrepôt ; sinon c’est la lance sur l’entrepôt et la mitrailleuse au sol. L’obus du canon n’est pas guidé : le canon vise en avance et ne tire qu’une fois la tourelle tournée. Les installations agissent ensemble — aucune ne tire sur une cible déjà visée par un obus ou un missile, et un raté la libère à nouveau.",
      "Le feu gagne les cases voisines toutes les {spread} s. Un conteneur sur une case en feu est perdu avec ses drones ; un canon y meurt aussi.",
    ],
  },
  {
    title: "Raids",
    lines: [
      "Ajoute un rival par e-mail — il doit jouer lui aussi.",
      "Compose le raid en vagues : chacune a son schéma, son côté et sa charge (vide, explosif, brouilleur de canons, d’extincteurs ou de pièges, furtive, souffleur, turbo, blindé, tireur). Jusqu’à {maxRaid} drones. Un plus gros essaim densifie la formation — le raid s’allonge à peine. Les drones quittent l’entrepôt aussitôt ; les charges coûtent un surcoût en crédits. L’anneau et la spirale ont une rotation au lieu d’un côté : horaire, antihoraire ou, pour l’anneau, aucune.",
      "La charge souffleuse explose comme une charge simple et, à l’approche, écarte les ballons de barrage : le ballon dérive de plusieurs cases loin du drone sans crever. Quelques souffleurs dans l’essaim réduisent déjà nettement ce que prennent les ballons ; un tiers de l’essaim ramène cela presque à zéro.",
      "Le brouilleur de pièges fonctionne pareil, mais son cercle vaut la moitié de celui du piège : il doit venir tout près, sous les canons. Tant que le cercle couvre l’aimant, celui-ci ne retient personne et lâche ses prises.",
      "La charge furtive explose comme une charge simple, mais canons et lance-roquettes ne la voient pas du tout : ni visée, ni guidage. Contre elle il ne reste que tes mains, les pièges et les ballons : elle s’écrase sur un ballon comme n’importe quel drone et déclenche aussi le lanceur de ballons.",
      "La charge turbo explose comme une charge simple, mais le drone vole une fois et demie plus vite — moins de temps sous le feu.",
      "Le drone blindé explose comme un simple, mais il faut deux coups de canon : après le premier, il continue en fumant. Le missile du lance-roquettes et ta mitrailleuse l’abattent d’un coup.",
      "Le tireur porte un missile et le tire sur l’entrepôt à {shooterRange} cases — plus loin que ne porte un canon de niveau moyen. Le missile embrase une case, comme un drone ; puis le tireur fonce s’écraser sur l’entrepôt. Le missile est plus rapide qu’un drone mais plus lent que le nôtre, et un canon peut l’abattre.",
      "Le défenseur mène le combat chez lui. Tu reçois un rapport — et le replay complet de la bataille.",
      "Pour chaque case brûlée tu touches une prime de {loot} cr. Le défenseur reçoit une prime de défense : {defendClean} cr par drone si rien ne brûle, ou {defendDirty} cr par drone moins {defendBurn} cr par case brûlée. L’assurance lui verse {insureCell} cr par case — juste la réparation. La police de base s’arrête là ; chaque niveau ajoute {insureShare} % de couverture de la marchandise et des canons perdus, jusqu’à la valeur entière.",
      "La prime n’est pas plate : elle croît avec la part de l’entrepôt que tu brûles. La moitié paie un quart de plus par case, les quatre cinquièmes le double, la totalité le triple — jusqu’à {lootMax} cr la case. Achever un rival rapporte plus que grignoter chez dix.",
      "Après un wipe total l’entrepôt repart, mais le compte est remis au moins à {credits} cr pour reconstruire.",
      "Personne n’est payé pour les drones abattus : l’argent vient de la marchandise, pas des tirs.",
      "Chaque combat terminé va au journal : on peut le revoir ou copier un lien pour le montrer.",
    ],
  },
  {
    title: "Missions",
    lines: [
      "Les missions sont une campagne en solo : 100 combats sur ton propre entrepôt, sans rival, quand tu veux et gratuitement.",
      "Chaque mission compte 8 à 10 vagues : les premières arrivent l’une après l’autre, petites et simples ; vers la fin elles grossissent, se resserrent et se chevauchent. Avec le numéro, tout grandit : de 120 drones à la première à 1000 à la centième, drones améliorés et toutes les charges mêlées.",
      "Le score d’une mission est la part de l’entrepôt qui a survécu : tout sauvé, 100. Le meilleur score de chaque numéro est gardé.",
      "La mission suivante s’ouvre si une partie de l’entrepôt survit. Celles déjà passées se rejouent : un numéro amène toujours le même essaim, les scores se comparent donc honnêtement.",
      "Une mission rapporte la prime de défense — {defendClean} cr par drone si rien ne brûle —, donc plus le numéro est haut et l’essaim gros, plus la récompense grimpe. Ce qui brûle en mission brûle pour de vrai, mais l’assurance le couvre comme dans tout combat.",
    ],
  },
  {
    title: "Reconnaissance",
    lines: [
      "La reconnaissance dépense les drones des mêmes conteneurs d’entrepôt que les raids.",
      "Le vol t’emmène au-dessus de la carte du rival sous brouillard de guerre. L’avion entre par un bord au hasard et dégage un cercle autour de lui ; tu diriges avec les flèches. Ou garde le doigt sur la carte et l’avion tourne vers lui.",
      "Ses canons peuvent l’abattre. Plus d’avions, la sortie est finie.",
      "Ce que tu as cartographié reste à toi, trous compris — bouton « Carte » sur la fiche du rival. Mais cela vieillit : là où il a rebâti depuis ton vol, le brouillard revient sur la zone.",
    ],
  },
  {
    title: "Améliorations",
    lines: [
      "Les classes coûtent {upgrade} cr le niveau. Les niveaux vont de zéro à dix ; la police s’arrête au quatrième, la couverture y est déjà totale.",
      "Les drones volent plus vite et voient plus loin en reconnaissance, les canons portent plus loin et tirent plus vite, la mitrailleuse vise mieux, la lance couvre plus, les extincteurs arrosent un cercle plus large, les pièges attrapent plus loin. Ballons — un cercle plus large et deux ballons de plus par niveau.",
      "Les lance-roquettes progressent pareil : plus de portée et un missile plus rapide à chaque niveau.",
      "Le niveau vaut pour toute la classe d’un coup : ce que tu as déjà et ce que tu achèteras ensuite.",
    ],
  },
  {
    title: "Conseils",
    lines: [
      "Fais se chevaucher les cercles des canons : un seul canon sur une approche ne suit pas un essaim.",
      "N’entasse pas tout au même endroit : le feu passe aux cases voisines et dévore conteneurs et canons.",
      "Place les extincteurs vers l’intérieur : ils sauvent ce qui perce la défense.",
      "Mets les ballons sur les approches, pas au centre — là leur cercle se déclenche avant que l’essaim n’atteigne l’entrepôt.",
      "Fais une reconnaissance avant un raid : tu vois où les canons sont serrés et de quel côté il y a une faille.",
      "Les drones que tu n’utilises pas partent avec l’expédition de la nuit : un conteneur rapporte le double.",
      "Pas assez d’argent ? Joue les missions : elles paient chaque drone repoussé.",
      "Les améliorations renchérissent les objets mais les rendent plus forts — améliore ce que tu as le plus.",
      "Un combat ne compte que s’il va au bout : recharge en plein combat et tu peux défendre le raid à nouveau.",
    ],
  },
];

const de: RuleSection[] = [
  {
    title: "So fängst du an",
    steps: true,
    lines: [
      "**Bau das Lager.** Nimm «Fläche» und zieh einen Rahmen vom Startquadrat {starter}×{starter} aus — das Lager kann jede Größe und Form haben, solange es zusammenhängt. Ein Feld kostet {cell} Cr. Ein größeres Lager hat mehr Platz für Anlagen und Container, aber auch mehr, was brennen kann. Ab 25 Feldern gib ihm einen Namen, dann ist es gegründet.",
      "**Stell die Verteidigung auf.** Ohne Geschütze ist das Lager nicht zu halten: Drohnen fliegen auf die Felder und setzen sie in Brand. Das Geschütz ({gun} Cr) schießt von selbst auf alles im Umkreis von {gunRange} Feldern; der Raketenwerfer ({rocket} Cr) feuert eine Rakete, die auf ihr Ziel lenkt. Stell sie so, dass ihre Kreise die Zugänge abdecken. Helfen können Löschanlagen (löschen das Feuer ringsum), Fallen (halten Drohnen per Magnet) und Ballons (eine Einweg-Sperre im Weg des Schwarms). Ist ein Werkzeug gewählt, zeigt die Karte die Kreise seiner Anlagen.",
      "**Kauf Drohnen.** Das Werkzeug «Drohnen» stellt einen Container mit {perCell} Stück für {droneBox} Cr auf ein freies Feld. Drohnen sind Ware und Waffe zugleich: jede Mitternacht Londoner Zeit wird alles Eingelagerte zum doppelten Einkaufspreis verkauft — das ist dein Einkommen. Du schickst sie auch auf Angriffe und zur Aufklärung.",
      "**Spiel die Missionen.** Das Panel «Missionen» sind hundert Kämpfe auf deinem eigenen Lager gegen immer stärkere Wellen: kostenlos, jederzeit, mit Prämie für jede abgewehrte Drohne. Im Kampf schießen die Geschütze selbst, du erledigst Drohnen mit der Maus und löschst Brände mit dem Wasserwerfer. Die Nummer deiner letzten bestandenen Mission ist deine Stufe, und Gegner sehen sie.",
      "**Füg Gegner hinzu und greif an.** Trag die E-Mail eines Gegners unter «Gegner» ein, klär sein Lager mit einer Drohne auf und stell dann einen Angriff aus Wellen und Ladungen zusammen. Jedes verbrannte Feld bringt {loot} Cr, und mehr, je härter der Schlag. Der Gegner verteidigt sich bei sich, du bekommst einen Bericht und die Wiederholung.",
    ],
  },
  {
    title: "Lager und Geld",
    lines: [
      "Du startest mit {credits} Cr und einem {starter}×{starter}-Lager mitten im Feld — es gehört dir umsonst.",
      "Jede Mitternacht Londoner Zeit geht der Versand raus: alles Eingelagerte wird zum doppelten Einkaufspreis verkauft — ein Drohnencontainer bringt {droneBoxSale} Cr bei Drohnenstufe 0 und bis {droneBoxSaleTop} auf Stufe 10. Das ist das Einkommen des Lagers: Felder bringen keine Miete. Was du nicht in den Kampf geschickt hast, ist verkauft. Der Server erledigt den Versand selbst und meldet ihn in Telegram, wenn der Bot verknüpft ist.",
      "Zu wenig Geld? Die Bank leiht {loanMin}–{loanMax} Cr für {loanHours} Stunden zu {loanRate} %. Die dafür gekaufte Ware kann bei einem Angriff verbrennen — die Schuld nicht.",
      "Geldstrategie: das große Geld kommt von fremden Lagern ({loot} Cr je abgebranntem Feld). Die Abwehrprämie ist kleiner — saubere Abwehr eines großen Schwarms bringt Hunderte oder etwa tausend, im Schnitt zwei- bis dreimal weniger als ein guter Angriff; Missionen zahlen sie auch. Bei null — Kredit, eine Mission oder Totalverlust mit Boden von mindestens {credits} Cr.",
    ],
  },
  {
    title: "Bauen",
    lines: [
      "«Fläche» — Rahmen ziehen oder Feld antippen. Ein neues Feld kostet {cell} Cr und muss ans Bestehende grenzen.",
      "«Reparieren» — genauso, {repair} Cr je abgebranntem Feld.",
      "«Abriss» — leere Lagerfelder abreißen, heile wie verbrannte, für je {scrap} Cr. Zurück bleibt nackter Boden; ein Feld mit Anlage oder Container lässt sich nicht abreißen, das Lager muss ein Stück bleiben und mindestens {minCells} Felder behalten.",
      "«Geschütz» — {gun} Cr auf ein freies heiles Feld.",
      "«Raketenwerfer» — {rocket} Cr, wird wie ein Geschütz gesetzt und gezogen. Er reicht {rocketRange} Felder, so weit wie ein Geschütz, und schießt ungenau, doch die Rakete lenkt selbst auf das Ziel, auf das sie abgefeuert wurde, und fliegt schneller als ein Geschoss. Eine Rakete je Werfer in der Luft, {rocketReload} s Nachladen.",
      "«Löschanlage» — {spray} Cr, wird wie ein Geschütz gesetzt und gezogen. Sie schießt nicht: brennt ein Feld im Umkreis von {sprayRange}, dreht sie auf und schleudert acht Strahlen um sich. Ein Strahl bleibt am ersten Brandherd hängen und braucht Zeit, ihn zu löschen. Sie hängt an der Wasserleitung und läuft nie leer, doch ein großes Feuer kann auch einen dichten Ring überrennen.",
      "«Falle» — {trap} Cr, wird wie ein Geschütz gesetzt und gezogen. Sie hält magnetisch bis zu {trapCap} Drohnen im Umkreis von {trapRange} Feldern; Überschuss fliegt weiter. Geschütze können gefangene Drohnen weiter abschießen; brennt die Falle, endet der Halt.",
      "«Drohnen» — ein Container mit {perCell} Stück für {droneBox} Cr. Er wird mit der Drohnenstufe teurer, bis {droneBoxTop} Cr auf Stufe zehn.",
      "«Ballons» — {balloon} Cr, ein Einweg-Werfer, wird wie ein Geschütz gesetzt. Sobald eine Drohne seinen Kreis von {balloonRange} Feldern betritt, wirft er fast gleichzeitig {balloonCount} Sperrballons aus, gleichmäßig über den ganzen Kreis verteilt, und ist weg — auf dem Feld bleibt nichts. Danach treiben die Ballons langsam, und eine Drohne, die hineinfliegt, stirbt mit dem Ballon — ohne Feuer, ohne Schaden am Lager und am Boden. Doch ein Geschoss oder eine Rakete zerplatzt den Ballon im Weg ebenso bereitwillig. Jede Stufe weitet den Kreis und bringt zwei Ballons mehr.",
      "Anlagen und Container lassen sich in jedem Modus kostenlos über das Lager ziehen. Lässt du eines auf ein belegtes Feld fallen, tauschen beide die Plätze. Ein Doppelklick verkauft eine Anlage oder einen Container zum heutigen Einkaufspreis.",
      "«Baupläne» — speichere dein jetziges Lager unter einem Namen, um später dahin zurückzukehren. Ein Umbau reißt das jetzige Lager ab und verkauft es — heile Felder zum Baupreis, verbrannte als Schrott, Anlagen, Drohnen und Ballons zum Einkaufspreis — und stellt den Bauplan an seine Stelle. Du zahlst nur die Differenz; ein Bauplan enthält keine Drohnen.",
    ],
  },
  {
    title: "Verteidigung",
    lines: [
      "Angriffe stellen sich in eine Schlange und werden streng der Reihe nach abgewehrt — überspringen oder umsortieren geht nicht.",
      "Nimm dir die Vorbereitungszeit, die du brauchst: der Erste in der Schlange wartet, aber nur ihn kannst du abwehren.",
      "Ein Kampf zählt erst, wenn er zu Ende gespielt ist. Lädst du die Seite neu oder schließt den Tab mitten im Kampf, zählt er nicht: der Angriff bleibt an erster Stelle, das Lager bleibt heil, und du kannst erneut verteidigen.",
      "Im Gefecht arbeiten die Geschütze allein — {gunRange} Felder Reichweite, {reload} s Nachladen. Ist eine Drohne im Fadenkreuz, feuert die Maus das MG — auch über dem Lager; sonst über dem Lager der Löschschlauch, über dem Boden das MG. Das Geschoss ist ungelenkt: das Geschütz hält vor und feuert erst, wenn der Turm herumgeschwenkt ist. Die Anlagen arbeiten zusammen — keine schießt auf ein Ziel, zu dem schon ein Geschoss oder eine Rakete unterwegs ist, und ein Fehlschuss gibt es wieder frei.",
      "Feuer springt alle {spread} s auf Nachbarfelder über. Ein Container auf brennendem Feld geht mit seinen Drohnen verloren, ein Geschütz dort ebenfalls.",
    ],
  },
  {
    title: "Angriffe",
    lines: [
      "Füge einen Gegner per E-Mail hinzu — er muss ebenfalls spielen.",
      "Baue den Angriff aus Wellen: jede mit eigenem Muster, Seite und Ladung (leer, Sprengstoff, Geschütz-, Sprinkler- oder Fallenstörer, Tarnkappe, Bläser, Turbo, Panzerung, Schütze). Bis {maxRaid} Drohnen. Ein größerer Schwarm macht die Formation dichter — der Angriff dauert kaum länger. Die Drohnen verlassen das Lager sofort; Ladungen kosten einen Kreditaufschlag. Ring und Spirale haben statt einer Seite einen Drehsinn: im, gegen den Uhrzeigersinn oder, beim Ring, gar keinen.",
      "Der Bläser-Sprengkopf explodiert wie ein einfacher und schiebt im Anflug Sperrballons beiseite: der Ballon treibt mehrere Felder von der Drohne weg, ohne zu zerplatzen. Schon ein paar Bläser im Schwarm senken deutlich, was die Ballons holen; ein Drittel des Schwarms bringt es nahe null.",
      "Der Fallenstörer arbeitet genauso, doch sein Kreis ist halb so groß wie der der Falle: er muss dicht heran, unter die Geschütze. Solange der Kreis den Magneten deckt, hält dieser niemanden und lässt die Gefangenen los.",
      "Der Tarnkappen-Sprengkopf explodiert wie ein einfacher, doch Geschütze und Werfer sehen ihn gar nicht: kein Zielen, kein Lenken. Gegen ihn bleiben deine Hände, die Fallen und die Ballons: an einem Ballon zerschellt er wie jede Drohne, und auch den Ballonwerfer löst er aus.",
      "Der Turbo-Sprengkopf explodiert wie ein einfacher, doch die Drohne fliegt anderthalbmal so schnell — weniger Zeit unter Beschuss.",
      "Eine gepanzerte Drohne explodiert wie eine einfache, doch ein Geschütz braucht zwei Treffer: nach dem ersten fliegt sie qualmend weiter. Die Rakete des Werfers und dein MG holen sie mit einem herunter.",
      "Der Schütze trägt eine Rakete und feuert sie aus {shooterRange} Feldern aufs Lager — weiter, als ein Geschütz mittlerer Stufe reicht. Die Rakete setzt ein Feld in Brand, wie eine Drohne; danach rammt der Schütze selbst das Lager. Die Rakete ist schneller als eine Drohne, aber langsamer als unsere, und ein Geschütz kann sie abschießen.",
      "Der Verteidiger schlägt den Angriff bei sich. Du bekommst einen Bericht — und die vollständige Wiederholung des Gefechts.",
      "Für jedes abgebrannte Feld bekommst du eine Prämie von {loot} Cr. Der Verteidiger bekommt eine Abwehrprämie: {defendClean} Cr je Drohne bei sauberer Abwehr, sonst {defendDirty} Cr je Drohne minus {defendBurn} Cr je abgebranntem Feld. Die Versicherung zahlt {insureCell} Cr je Feld — genau die Reparatur. Die Grundpolice endet dort; jede Stufe deckt zusätzlich {insureShare} % von verbrannter Ware und Geschützen, bis zum vollen Wert.",
      "Die Prämie ist nicht flach: sie wächst mit dem Anteil des niedergebrannten Lagers. Die Hälfte zahlt ein Viertel mehr je Feld, vier Fünftel das Doppelte, alles das Dreifache — bis {lootMax} Cr je Feld. Einen Gegner fertigzumachen bringt mehr, als bei zehn zu knabbern.",
      "Nach einem Totalverlust startet das Lager neu, das Konto wird aber auf mindestens {credits} Cr aufgefüllt, damit du wieder bauen kannst.",
      "Für abgeschossene Drohnen zahlt niemand: Geld bringt die Ware, nicht das Schießen.",
      "Jedes beendete Gefecht landet im Buch: dort lässt es sich noch einmal ansehen oder als Link weitergeben.",
    ],
  },
  {
    title: "Missionen",
    lines: [
      "Missionen sind eine Einzelspieler-Kampagne: 100 Kämpfe auf deinem eigenen Lager, ohne Rivalen, jederzeit und kostenlos.",
      "Jede Mission hat 8–10 Wellen: die ersten kommen nacheinander, klein und einfach; gegen Ende werden sie größer, dichter und überlappen sich. Mit der Nummer wächst alles: von 120 Drohnen in der ersten bis 1000 in der hundertsten, mit aufgewerteten Drohnen und allen Ladungen gemischt.",
      "Die Punktzahl einer Mission ist der Anteil des Lagers, der übersteht: alles gerettet — 100. Die beste Punktzahl jeder Nummer bleibt gespeichert.",
      "Die nächste Mission öffnet sich, wenn etwas vom Lager übersteht. Geschaffte lassen sich wiederholen: eine Nummer bringt immer denselben Schwarm, die Punkte sind also fair vergleichbar.",
      "Eine Mission zahlt die Abwehrprämie — {defendClean} Cr pro Drohne, wenn nichts brennt —, je höher also die Nummer und größer der Schwarm, desto höher die Belohnung. Was in einer Mission brennt, brennt wirklich, aber die Versicherung deckt es wie in jedem Kampf.",
    ],
  },
  {
    title: "Aufklärung",
    lines: [
      "Aufklärung verbraucht dieselben Lagerdrohnen in Containern wie Angriffe.",
      "Ein Flug führt dich über die Karte des Gegners im Nebel des Krieges. Das Flugzeug kommt von einer zufälligen Kante und deckt einen Kreis um sich auf; gesteuert wird mit den Pfeiltasten. Oder halte den Finger auf der Karte, und das Flugzeug dreht dorthin.",
      "Seine Geschütze können es abschießen. Sind die Drohnen alle, ist der Einsatz vorbei.",
      "Das Kartierte bleibt deins, samt Lücken — Knopf «Karte» beim Gegner. Es veraltet aber: wo er seit deinem Flug umgebaut hat, kriecht der Nebel über dieses Feld zurück.",
    ],
  },
  {
    title: "Ausbau",
    lines: [
      "Klassen kosten {upgrade} Cr pro Stufe. Die Stufen zählen von null bis zehn; die Police endet bei vier, dort ist die Deckung schon voll.",
      "Drohnen fliegen schneller und sehen in der Aufklärung weiter, Geschütze reichen weiter und schießen zügiger, das MG trifft besser, der Schlauch deckt mehr ab, Löschanlagen begießen einen größeren Kreis, Fallen greifen weiter. Ballons — ein weiterer Kreis und zwei Ballons mehr je Stufe.",
      "Raketenwerfer wachsen genauso: mehr Reichweite und eine schnellere Rakete je Stufe.",
      "Eine Stufe gilt für die ganze Klasse auf einmal — für Vorhandenes und für später Gekauftes.",
    ],
  },
  {
    title: "Tipps",
    lines: [
      "Lass die Kreise der Geschütze überlappen: ein einzelnes Geschütz an einem Zugang kommt gegen einen Schwarm nicht an.",
      "Stapel nicht alles auf einen Haufen — Feuer springt auf Nachbarfelder über und frisst Container wie Geschütze.",
      "Stell Löschanlagen ins Innere: sie retten, was durch die Verteidigung bricht.",
      "Setz Ballons an die Zugänge, nicht in die Mitte — dort löst ihr Kreis aus, bevor der Schwarm das Lager erreicht.",
      "Klär vor einem Angriff auf: du siehst, wo die Geschütze dicht stehen und auf welcher Seite eine Lücke ist.",
      "Drohnen, die du nicht einsetzt, gehen mit dem nächtlichen Versand raus: ein Container bringt das Doppelte.",
      "Knapp bei Kasse? Spiel Missionen: sie zahlen für jede abgewehrte Drohne.",
      "Upgrades verteuern die Dinge, machen sie aber stärker — rüste auf, wovon du am meisten hast.",
      "Ein Kampf zählt nur zu Ende gespielt: lädst du mittendrin neu, kannst du den Angriff noch einmal abwehren.",
    ],
  },
];

const it: RuleSection[] = [
  {
    title: "Da dove cominciare",
    steps: true,
    lines: [
      "**Costruisci il magazzino.** Prendi «Superficie» e trascina un riquadro dal quadrato iniziale {starter}×{starter} — il magazzino può avere qualsiasi grandezza e forma, purché tutto d’un pezzo. Una cella costa {cell} cr. Un magazzino più grande ha più spazio per installazioni e container, ma anche più roba che brucia. Con almeno 25 celle dagli un nome ed è fondato.",
      "**Prepara la difesa.** Senza cannoni il magazzino non si difende: i droni volano sulle celle e le incendiano. Il cannone ({gun} cr) spara da solo a tutto ciò che è entro {gunRange} celle; il lanciarazzi ({rocket} cr) lancia un missile che vira sul bersaglio. Mettili in modo che i cerchi coprano gli accessi. Li aiutano gli estintori (spengono il fuoco intorno), le trappole (trattengono i droni con una calamita) e i palloni (uno sbarramento monouso sul cammino dello sciame). Con uno strumento scelto, i cerchi delle sue installazioni compaiono sulla mappa.",
      "**Compra droni.** Lo strumento «Droni» mette su una cella libera un container da {perCell} per {droneBox} cr. I droni sono merce e arma insieme: ogni mezzanotte, ora di Londra, tutto ciò che è stoccato si vende al doppio dell’acquisto — è il tuo reddito. Li mandi anche negli attacchi e in ricognizione.",
      "**Gioca le missioni.** Il pannello «Missioni» sono cento combattimenti sul tuo magazzino contro ondate sempre più forti: gratis, quando vuoi, con un premio per ogni drone respinto. In battaglia i cannoni sparano da soli, e tu finisci i droni col mouse e spegni gli incendi con la lancia. Il numero dell’ultima missione superata è il tuo livello, e i rivali lo vedono.",
      "**Aggiungi rivali e attaccali.** Scrivi l’e-mail di un rivale in «Rivali», esplora il suo magazzino con un drone, poi componi un attacco di ondate e cariche. Ogni cella bruciata paga {loot} cr, e di più quanto più forte è la distruzione. Il rivale si difende dalla sua parte, e tu ricevi un resoconto e il replay.",
    ],
  },
  {
    title: "Il magazzino e i soldi",
    lines: [
      "Parti con {credits} cr e un magazzino {starter}×{starter} in mezzo al campo: è tuo gratis.",
      "Ogni mezzanotte, ora di Londra, parte la spedizione: tutto ciò che è stoccato si vende al doppio dell’acquisto — un container di droni va via per {droneBoxSale} cr con droni di livello 0 e fino a {droneBoxSaleTop} al livello 10. È questo il reddito del magazzino: le celle non rendono affitto. Quello che non hai mandato in battaglia è venduto. Il server fa la spedizione da sé e lo comunica su Telegram, se il bot è collegato.",
      "Soldi finiti? La banca presta {loanMin}–{loanMax} cr per {loanHours} ore al {loanRate}%. La merce comprata può bruciare in un attacco, il debito no.",
      "Strategia di cassa: i soldi grossi vengono dai magazzini rivali ({loot} cr per cella bruciata). Il premio di difesa è minore — un respingimento pulito di uno sciame grande dà centinaia o circa mille, in media due-tre volte meno di un buon attacco; anche le missioni lo pagano. A zero — prestito, una missione o wipe con un pavimento di almeno {credits} cr.",
    ],
  },
  {
    title: "Costruzione",
    lines: [
      "«Area» — trascina una cornice o tocca una cella. Una cella nuova costa {cell} cr e deve toccare ciò che c’è già.",
      "«Riparare» — lo stesso, {repair} cr per cella bruciata.",
      "«Demolisci» — abbatti celle vuote del magazzino, intatte o bruciate, a {scrap} cr l’una. Resta terra nuda; una cella con installazione o container non si abbatte, il magazzino deve restare tutto d’un pezzo e non scendere sotto le {minCells} celle.",
      "«Cannone» — {gun} cr su una cella intatta libera.",
      "«Lanciarazzi» — {rocket} cr, si piazza e si trascina come un cannone. Arriva a {rocketRange} celle, come un cannone, e spara largo, ma il missile vira da solo sul bersaglio contro cui è stato lanciato e vola più veloce della granata del cannone. Un missile per lanciarazzi in aria e {rocketReload} s di ricarica.",
      "«Estintore» — {spray} cr, si posa e si trascina come un cannone. Non spara: appena una cella entro {sprayRange} prende fuoco, l’impianto gira e lancia otto getti attorno a sé. Un getto si ferma sul primo focolaio e ci mette un po’ a spegnerlo. È allacciato all’acquedotto e non resta mai a secco, ma un incendio grosso può ancora travolgere un anello fitto.",
      "«Trappola» — {trap} cr, si posa e si trascina come un cannone. Tiene magneticamente fino a {trapCap} droni entro {trapRange} celle; gli altri passano. I cannoni possono ancora abbattere i catturati; se la trappola brucia, la presa cade.",
      "«Droni» — un container da {perCell} pezzi per {droneBox} cr. Rincara con il livello dei droni, fino a {droneBoxTop} cr al decimo.",
      "«Palloni» — {balloon} cr, un lanciatore monouso che si piazza come un cannone. Appena un drone entra nel suo cerchio di {balloonRange} celle, lancia quasi insieme {balloonCount} palloni di sbarramento, sparsi su tutto il cerchio, e scompare: sulla cella non resta nulla. Poi i palloni vanno alla deriva lenti, e il drone che ne colpisce uno muore con lui, senza incendio né danni al magazzino o al terreno. Ma una granata del cannone o un missile fanno scoppiare con la stessa facilità il pallone sulla loro traiettoria. Ogni livello allarga il cerchio e aggiunge due palloni.",
      "Installazioni e container si trascinano per il magazzino in qualsiasi modalità, gratis. Lasciane uno su una cella occupata e si scambiano di posto. Un doppio clic vende un’installazione o un container al prezzo d’acquisto attuale.",
      "«Progetti» — salva il magazzino attuale con un nome per tornarci più tardi. Ricostruire demolisce il magazzino attuale e lo vende — celle intatte al prezzo di costruzione, quelle bruciate come rottame, installazioni, droni e palloni al prezzo d’acquisto — e mette il progetto al suo posto. Paghi solo la differenza; un progetto non contiene droni.",
    ],
  },
  {
    title: "Difesa",
    lines: [
      "Gli attacchi si mettono in coda e si affrontano rigorosamente in ordine — non si salta né si riordina.",
      "Prenditi tutto il tempo che ti serve: il primo in coda aspetta, ma si può affrontare solo quello.",
      "Un combattimento conta solo se giocato fino alla fine. Ricarichi la pagina o chiudi la scheda a metà e non conta: l’attacco resta primo in coda, il magazzino è intatto e puoi difenderti di nuovo.",
      "In battaglia i cannoni lavorano da soli — {gunRange} celle di gittata, {reload} s di ricarica. Con un drone nel mirino il mouse spara la mitragliatrice, anche sopra il magazzino; senza drone, sul magazzino c’è la manichetta e sul terreno la mitragliatrice. La granata del cannone non è guidata: il cannone mira in anticipo e spara solo dopo aver girato la torretta. Le installazioni lavorano insieme — nessuna spara a un bersaglio verso cui vola già una granata o un missile, e un colpo mancato lo libera di nuovo.",
      "Il fuoco passa alle celle vicine ogni {spread} s. Un container su una cella in fiamme si perde con i suoi droni; anche un cannone lì muore.",
    ],
  },
  {
    title: "Attacchi",
    lines: [
      "Aggiungi un rivale per e-mail: deve giocare anche lui.",
      "Componi l’attacco a ondate: ognuna con schema, lato e carica (vuota, esplosivo, disturbatore di cannoni, di estintori o di trappole, invisibile, soffiatore, turbo, corazzato, tiratore). Fino a {maxRaid} droni. Uno sciame più grande rende la formazione più fitta — l’attacco quasi non si allunga. I droni lasciano subito il magazzino; le cariche costano un sovrapprezzo in crediti. Anello e spirale hanno una rotazione invece di un lato: oraria, antioraria o, per l’anello, nessuna.",
      "La carica soffiante esplode come quella semplice e, in avvicinamento, scosta i palloni di sbarramento: il pallone si allontana di qualche cella dal drone senza scoppiare. Bastano pochi soffiatori nello sciame per ridurre molto quel che prendono i palloni; un terzo dello sciame lo porta quasi a zero.",
      "Il disturbatore di trappole funziona allo stesso modo, ma il suo cerchio è metà di quello della trappola: deve avvicinarsi molto, sotto i cannoni. Finché il cerchio copre il magnete, questo non trattiene nessuno e libera i catturati.",
      "La carica invisibile esplode come quella semplice, ma cannoni e lanciarazzi non la vedono affatto: niente mira, niente guida. Contro di lei restano le tue mani, le trappole e i palloni: si schianta su un pallone come qualsiasi drone e fa scattare anche il lanciatore di palloni.",
      "La carica turbo esplode come quella semplice, ma il drone vola una volta e mezza più veloce — meno tempo sotto il fuoco.",
      "Il drone corazzato esplode come quello semplice, ma al cannone servono due colpi: dopo il primo continua a volare fumando. Il missile del lanciarazzi e la tua mitragliatrice lo abbattono con uno.",
      "Il tiratore porta un missile e lo lancia sul magazzino da {shooterRange} celle, più lontano di quanto arrivi un cannone di livello medio. Il missile incendia una cella, come un drone; poi il tiratore va a schiantarsi sul magazzino. Il missile è più veloce di un drone ma più lento del nostro, e un cannone può abbatterlo.",
      "Il difensore affronta l’attacco da sé. A te arriva un rapporto — e la replica completa della battaglia.",
      "Per ogni cella bruciata ricevi un premio di {loot} cr. Al difensore, un premio di difesa: {defendClean} cr per drone se non brucia nulla, oppure {defendDirty} cr per drone meno {defendBurn} cr per cella bruciata. L’assicurazione paga {insureCell} cr per cella: esattamente la riparazione. La polizza base finisce lì; ogni livello aggiunge il {insureShare}% di copertura di merce e cannoni perduti, fino al valore pieno.",
      "Il premio non è piatto: cresce con la quota di magazzino che bruci. Per metà pagano un quarto in più a cella, per quattro quinti il doppio, per tutto il triplo — fino a {lootMax} cr a cella. Finire uno rende più che spiluccare da dieci.",
      "Dopo un wipe totale il magazzino riparte, ma il conto viene portato almeno a {credits} cr per ricostruire.",
      "Nessuno viene pagato per i droni abbattuti: i soldi li porta la merce, non gli spari.",
      "Ogni combattimento finito finisce nel diario: lo si può rivedere o copiarne il link per mostrarlo.",
    ],
  },
  {
    title: "Missioni",
    lines: [
      "Le missioni sono una campagna in solitario: 100 battaglie sul tuo magazzino, senza rivali, quando vuoi e gratis.",
      "Ogni missione ha 8–10 ondate: le prime arrivano una dopo l’altra, piccole e semplici; verso la fine crescono, si infittiscono e si sovrappongono. Con il numero cresce tutto: da 120 droni nella prima a 1000 nella centesima, con droni potenziati e ogni tipo di carica mescolata.",
      "Il punteggio di una missione è la quota del magazzino sopravvissuta: salvi tutto, 100. Il miglior punteggio di ogni numero resta salvato.",
      "La missione successiva si apre se qualcosa del magazzino sopravvive. Quelle superate si possono rigiocare: un numero porta sempre lo stesso sciame, quindi i punteggi si confrontano onestamente.",
      "Una missione paga il premio di difesa — {defendClean} cr per drone se non brucia nulla —, quindi più alto è il numero e più grande lo sciame, più alta la ricompensa. Ciò che brucia in missione brucia davvero, ma l’assicurazione lo copre come in ogni battaglia.",
    ],
  },
  {
    title: "Ricognizione",
    lines: [
      "La ricognizione spende gli stessi droni di magazzino usati negli attacchi.",
      "Il volo ti porta sulla mappa del rivale sotto la nebbia di guerra. L’aereo entra da un bordo a caso e scopre un cerchio attorno a sé; si guida con le frecce. Oppure tieni il dito sulla mappa e l’aereo gira verso di esso.",
      "I suoi cannoni possono abbatterlo. Finiti i ricognitori, la sortita è chiusa.",
      "Quello che hai mappato resta tuo, buchi compresi — pulsante «Mappa» nella scheda del rivale. Ma invecchia: dove lui ha ricostruito dopo il tuo volo, la nebbia torna su quella zona.",
    ],
  },
  {
    title: "Potenziamenti",
    lines: [
      "Le classi costano {upgrade} cr per livello. I livelli vanno da zero a dieci; la polizza si ferma al quarto, dove la copertura è già piena.",
      "I droni volano più veloci e vedono più lontano in ricognizione, i cannoni arrivano più lontano e sparano prima, la mitragliatrice mira meglio, la manichetta copre di più, gli estintori bagnano un cerchio più ampio, le trappole afferrano più lontano. Palloni — un cerchio più ampio e due palloni in più per livello.",
      "I lanciarazzi crescono allo stesso modo: più gittata e missile più veloce a ogni livello.",
      "Il livello vale per tutta la classe in una volta: per ciò che hai già e per ciò che comprerai poi.",
    ],
  },
  {
    title: "Consigli",
    lines: [
      "Sovrapponi i cerchi dei cannoni: uno solo su un accesso non regge uno sciame.",
      "Non ammucchiare tutto insieme — il fuoco passa alle celle vicine e divora container e cannoni.",
      "Metti gli estintori verso l’interno: salvano ciò che sfonda la difesa.",
      "Piazza i palloni sugli accessi, non al centro — lì il loro cerchio scatta prima che lo sciame arrivi al magazzino.",
      "Esplora prima di attaccare: vedi dove i cannoni sono fitti e da che parte c’è un buco.",
      "I droni che non usi partono con la spedizione notturna: un container rende il doppio.",
      "Mancano soldi? Gioca le missioni: pagano ogni drone respinto.",
      "I potenziamenti rincarano le cose ma le rendono più forti — potenzia ciò che hai di più.",
      "Un combattimento conta solo se finito: ricarichi a metà e puoi difendere di nuovo l’attacco.",
    ],
  },
];

export const RULES: Record<Locale, RuleSection[]> = { en, ru, es, pt, fr, de, it };
