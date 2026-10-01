// Правила игры. Числа не вписаны в текст, а подставляются из прайса —
// иначе после первой же правки баланса правила начали бы врать.

import type { Locale } from "./dict";

export interface RuleSection {
  title: string;
  lines: string[];
}

const en: RuleSection[] = [
  {
    title: "The warehouse and the money",
    lines: [
      "You start with {credits} cr and a {starter}×{starter} warehouse standing in the middle of the field — it is yours for free.",
      "Every {shift} hours the warehouse pays rent: {income} cr for every intact cell.",
      "The same moment everything stored ships out at double the purchase price: drones at {droneSale} cr. Whatever you did not send into battle is sold.",
      "Away for a while? The rent accrues for at most {capDays} days.",
      "Short of money? The bank lends {loanMin}–{loanMax} cr for {loanHours} hours at {loanRate}%. The goods you buy with it can burn in a raid — the debt will not.",
      "Money strategy: the real income is burning rival warehouses ({loot} cr per cell). Defence bounty is smaller — a clean stop of a big swarm pays hundreds or about a thousand, usually two to three times less than a successful attack; missions earn it too. Flat broke — take a loan, play a mission, or wipe and get a floor of at least {credits} cr.",
    ],
  },
  {
    title: "Building",
    lines: [
      "«Area» — drag a frame or tap a cell. A new cell costs {cell} cr and must touch what already stands.",
      "«Repair» — the same, {repair} cr per burnt cell.",
      "«Demolish» — sell the remains of burnt cells for {scrap} cr each. Bare ground is left behind, and the warehouse must stay in one piece.",
      "«Gun» — {gun} cr on a free intact cell. Guns are not sold back, but they can be dragged anywhere on the warehouse.",
      "«Launcher» — {rocket} cr, placed and dragged like a gun. It reaches {rocketRange} cells — twice a gun — but fires wide: the missile then steers onto whichever drone is nearest to it at that moment. One missile per launcher in the air, {rocketReload} s to reload.",
      "«Sprinkler» — {spray} cr, placed and dragged just like a gun. It does not shoot: when a cell within {sprayRange} catches fire, the sprinkler spins up and sweeps eight jets around itself. A jet stops at the first blaze it meets and needs a moment to douse it, and the tank holds only {sprayTank} s of water per raid — a dense ring of them still loses to a big enough fire.",
      "«Trap» — {trap} cr, placed and dragged like a gun. It magnetically holds up to {trapCap} drones within {trapRange} cells; extras fly past. Guns can still shoot held drones; if the trap burns, the hold drops.",
      "«Drones» — a container of {perCell} pieces for {droneBox} cr. Every drone level makes them {priceStep}% dearer to buy.",
      "«Balloons» — a container of {perCell} barrage balloons for {balloonBox} cr, placed like a drone container. A raid releases every balloon you have at once: they drift slowly over the field, and a drone that flies into one dies with it — no fire, no damage to the warehouse or the ground. But a gun or launcher shell pops a balloon in its way just as readily, so a solid wall of them shields the swarm from your own guns. No upgrades, and a raid spends them all.",
      "Guns and containers can be dragged around the warehouse in any mode, and that costs nothing.",
    ],
  },
  {
    title: "Defence",
    lines: [
      "Raids queue up and are fought strictly in order — you cannot skip or reorder them.",
      "Take as long as you need to prepare; the first raid in the queue waits for you, and only that one can be fought.",
      "In battle the guns work by themselves — {gunRange} cells of range, {reload} s to reload. Your mouse is the machine gun when a drone is in the crosshair — over the warehouse too; otherwise over the warehouse it is the fire hose.",
      "Fire spreads to neighbouring cells every {spread} s. A container on a burning cell is lost with the drones inside; a gun there dies too.",
    ],
  },
  {
    title: "Raids",
    lines: [
      "Add a rival by e-mail — they have to be playing too.",
      "Build the raid from waves: each has its own pattern, side and warheads (empty, explosive, gun, sprinkler or trap jammer, stealth, blower, turbo). Up to {maxRaid} drones. A bigger swarm makes the formation denser — the raid barely lasts longer. Drones leave the warehouse at once; warheads cost an extra credit surcharge.",
      "A blower warhead explodes like a plain one and, on the way in, shoves barrage balloons aside — several cells away from the drone, without popping them. A handful of blowers in the swarm noticeably cuts what the balloons take; a third of the swarm brings it near zero.",
      "The trap jammer works the same way, but its circle is half a trap's — it has to come in close, under the guns. While the circle covers a trap, the trap holds nobody and lets the caught go.",
      "A stealth warhead blows up like a plain one, but guns and launchers do not see it at all — neither will aim, and no missile will lock on. Only your own hands and the traps are left against it.",
      "A turbo warhead blows up like a plain one, but the drone flies half again as fast — less time under fire.",
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
      "A flight takes you over the rival's map under fog of war. The plane comes in from a random edge and uncovers a circle around itself; steer with the left and right arrows.",
      "Their guns can shoot it down. Out of planes — the sortie is over.",
      "What you mapped stays yours, gaps and all — the «Map» button on the rival's card. But it goes stale: wherever they have rebuilt since your flight, the fog creeps back over that patch.",
    ],
  },
  {
    title: "Upgrades",
    lines: [
      "Classes cost {upgrade} cr per level. Ten levels each, except the insurance policy: it tops out at five, where cover is already full.",
      "Drones fly faster and see farther on recon, guns reach further and shoot quicker, the machine gun aims better, the hose covers more, sprinklers douse a wider circle, traps grab farther.",
      "Launchers grow the same way: more range and a faster missile with every level.",
      "A level applies to everything at once — to what is already in stock and to everything bought later.",
    ],
  },
];

const ru: RuleSection[] = [
  {
    title: "Склад и деньги",
    lines: [
      "Начинаешь с {credits} кр и складом {starter}×{starter} посреди поля — он твой даром.",
      "Каждые {shift} часов склад приносит аренду: {income} кр с каждой целой клетки.",
      "Тогда же уходит отгрузка: всё, что лежит, продаётся вдвое дороже закупки — дроны по {droneSale} кр. Что не пустил в дело, то продано.",
      "Не заходил долго — аренда копится не больше чем за {capDays} суток.",
      "Не хватает денег — банк даёт {loanMin}–{loanMax} кр на {loanHours} часа под {loanRate}%. Купленный на них товар может сгореть в налёте, долг — нет.",
      "Стратегия кассы: основные деньги — с чужих складов ({loot} кр за сожжённую клетку). Премия за отбой меньше — при чистом отбое крупного роя это сотни или около тысячи, в среднем вдвое–втрое скромнее атаки; миссии тоже её дают. Упал в ноль — заём, миссия или полный снос с подушкой не меньше {credits} кр.",
    ],
  },
  {
    title: "Стройка",
    lines: [
      "«Площадь» — тяни рамку или ткни в клетку. Новая клетка стоит {cell} кр и должна примыкать к тому, что уже стоит.",
      "«Ремонт» — так же, {repair} кр за сгоревшую клетку.",
      "«Снос» — сдать остатки сгоревших клеток во вторсырьё, {scrap} кр за клетку. Остаётся голая земля, и склад не должен развалиться надвое.",
      "«Пушка» — {gun} кр на свободную целую клетку. Обратно пушка не продаётся, но её можно перетащить куда угодно по складу.",
      "«Ракетница» — {rocket} кр, ставится и таскается как пушка. Достаёт на {rocketRange} клеток — вдвое дальше зенитки, — но пускает неточно: ракета сама доворачивает на того, кто в этот миг к ней ближе. В воздухе держит одну ракету, перезарядка {rocketReload} с.",
      "«Огнетушитель» — {spray} кр, ставится и таскается так же, как пушка. Он не стреляет: как только в радиусе {sprayRange} клеток занимается огонь, установка раскручивается и бьёт восемью струями вокруг себя. Струя упирается в первый же очаг и гасит его не сразу, а бака хватает на {sprayTank} с полива за налёт — так что и плотный ковёр установок большому пожару проигрывает.",
      "«Ловушка» — {trap} кр, ставится и таскается как пушка. Магнитом удерживает до {trapCap} дронов в радиусе {trapRange} клеток; лишние пролетают. Зенитки всё ещё могут сбивать захваченных; если ловушка сгорает — захват сбрасывается.",
      "«Дроны» — контейнер на {perCell} штук за {droneBox} кр. С каждым уровнем дронов закупка дорожает на {priceStep}%.",
      "«Шары» — контейнер на {perCell} аэростатов за {balloonBox} кр, ставится как контейнер с дронами. Налёт выпускает разом все, что лежат на складе: они медленно плывут над полем, и влетевший дрон гибнет вместе с шаром — без пожара, без вреда складу и земле. Но снаряд зенитки или ракета лопнут шар на своём пути с тем же успехом, так что сплошная стена из них прикрывает рой от твоих же пушек. Прокачки нет, и налёт расходует их все.",
      "Пушки и контейнеры таскаются по складу в любом режиме, и это бесплатно.",
    ],
  },
  {
    title: "Оборона",
    lines: [
      "Налёты встают в очередь и отбиваются строго по порядку — переставить и пропустить нельзя.",
      "Готовься сколько нужно: первый в очереди ждёт, но отбить можно только его.",
      "В бою пушки работают сами — радиус {gunRange} клеток, перезарядка {reload} с. Дрон в перекрестье — мышь бьёт очередью, хоть над складом; нет дрона — над складом брандспойт, над землёй пулемёт.",
      "Огонь перекидывается на соседние клетки каждые {spread} с. Контейнер на горящей клетке пропадает вместе с дронами, пушка там же гибнет.",
    ],
  },
  {
    title: "Налёты",
    lines: [
      "Добавь соперника по почте — он тоже должен играть.",
      "Собери налёт из волн: у каждой свой рисунок, сторона и начинка (пустая, взрывчатка, подавление пушек, огнетушителей или ловушек, невидимка, обдув, турбо). До {maxRaid} дронов. Чем больше рой, тем гуще строй — налёт почти не растягивается. Дроны уходят со склада сразу, за начинку доплачиваются кредиты.",
      "Начинка «обдув» взрывается как простая, а на подлёте расталкивает аэростаты: шар отходит на несколько клеток в сторону от дрона, не лопаясь. Несколько таких в рое заметно сокращают потери на заграждении, треть роя — сводит их почти к нулю.",
      "Подавление ловушек работает так же, но круг у него вдвое меньше, чем у самой ловушки: приходится подходить вплотную, под пушки. Пока круг накрывает магнит, тот никого не держит и отпускает захваченных.",
      "Начинка «невидимка» взрывается как обычная, но пушки и ракетницы её не видят вовсе: ни целятся, ни наводят ракету. Против неё остаются только руки игрока и ловушки.",
      "Начинка «турбо» взрывается как простая, но дрон летит в полтора раза быстрее — меньше времени под огнём.",
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
      "Вылет уносит тебя на карту соперника под туманом войны. Самолёт заходит со случайного края и открывает круг вокруг себя; рулишь стрелками влево-вправо.",
      "Его могут сбить чужие пушки. Кончились дроны — вылет окончен.",
      "Снятое остаётся твоим вместе с пробелами — кнопка «Карта» в карточке соперника. Но данные стареют: где враг с тех пор перестраивался, тот участок снова затягивает туманом.",
    ],
  },
  {
    title: "Прокачка",
    lines: [
      "Классы стоят {upgrade} кр за уровень. У каждого по десять уровней, кроме полиса: у него пять, дальше покрывать нечего.",
      "Дроны летят быстрее и на разведке видят дальше, пушки бьют дальше и резвее, пулемёт точнее, струя шире, огнетушители заливают круг побольше, ловушки хватают дальше.",
      "Ракетницы растут так же: с каждым уровнем дальше достают и быстрее гонят ракету.",
      "Уровень достаётся всему классу разом — и тому, что уже на складе, и тому, что купишь потом.",
    ],
  },
];

const es: RuleSection[] = [
  {
    title: "El almacén y el dinero",
    lines: [
      "Empiezas con {credits} cr y un almacén de {starter}×{starter} en medio del campo: es tuyo gratis.",
      "Cada {shift} horas el almacén paga renta: {income} cr por cada celda intacta.",
      "En ese mismo momento se expide todo lo almacenado al doble del precio de compra: drones a {droneSale} cr. Lo que no enviaste al combate, se vende.",
      "¿Estuviste fuera? La renta se acumula como mucho {capDays} días.",
      "¿Falta dinero? El banco presta {loanMin}–{loanMax} cr por {loanHours} horas al {loanRate}%. La mercancía comprada puede arder en un ataque; la deuda no.",
      "Estrategia de caja: el dinero gordo viene de quemar almacenes rivales ({loot} cr por celda). La prima de defensa es menor — un rechazo limpio de un enjambre grande da cientos o cerca de mil, unas dos o tres veces menos que un ataque bueno; las misiones también la pagan. Sin un cr — préstamo, una misión o derribo total con un suelo de al menos {credits} cr.",
    ],
  },
  {
    title: "Construcción",
    lines: [
      "«Área»: arrastra un marco o toca una celda. Una celda nueva cuesta {cell} cr y debe tocar lo ya construido.",
      "«Reparar»: igual, {repair} cr por celda quemada.",
      "«Demoler»: vende los restos de las celdas quemadas a {scrap} cr cada una. Queda tierra desnuda y el almacén debe seguir de una pieza.",
      "«Cañón»: {gun} cr en una celda intacta libre. Los cañones no se revenden, pero se arrastran a cualquier punto del almacén.",
      "«Lanzadera» — {rocket} cr, se coloca y se arrastra como un cañón. Alcanza {rocketRange} celdas, el doble que un cañón, pero dispara con desvío: el misil se dirige solo al dron que en ese instante le quede más cerca. Un misil por lanzadera en el aire y {rocketReload} s de recarga.",
      "«Extintor»: {spray} cr, se coloca y se arrastra igual que un cañón. No dispara: en cuanto arde una celda a menos de {sprayRange}, la instalación gira y lanza ocho chorros a su alrededor. Cada chorro se detiene en el primer foco y tarda en apagarlo, y el depósito da para {sprayTank} s de riego por ataque: ni un anillo denso aguanta un incendio grande.",
      "«Trampa»: {trap} cr, se coloca y se arrastra como un cañón. Retiene magnéticamente hasta {trapCap} drones a {trapRange} celdas; el resto pasa. Los cañones aún pueden derribar a los atrapados; si la trampa arde, la sujeción se pierde.",
      "«Drones»: un contenedor de {perCell} unidades por {droneBox} cr. Cada nivel de drones encarece la compra un {priceStep}%.",
      "«Globos» — un contenedor de {perCell} globos de barrera por {balloonBox} cr, se coloca como el de drones. El ataque suelta de golpe todos los que tengas: flotan despacio sobre el campo y el dron que choca con uno muere con él, sin fuego ni daño al almacén ni al suelo. Pero un proyectil del cañón o un misil revientan igual de bien el globo que se les cruce, así que un muro macizo de globos protege al enjambre de tus propios cañones. No se mejoran y el ataque los gasta todos.",
      "Cañones y contenedores se arrastran por el almacén en cualquier modo, y eso no cuesta nada.",
    ],
  },
  {
    title: "Defensa",
    lines: [
      "Los ataques hacen cola y se combaten en orden estricto: no puedes saltarte ninguno ni cambiar el orden.",
      "Tómate el tiempo que necesites: el primero en la cola espera, pero solo ese se puede combatir.",
      "En combate los cañones actúan solos: {gunRange} celdas de alcance, {reload} s de recarga. Con un dron en el punto de mira el ratón dispara la ametralladora, incluso sobre el almacén; si no hay dron, sobre el almacén va la manguera y sobre el suelo la ametralladora.",
      "El fuego pasa a las celdas vecinas cada {spread} s. Un contenedor en una celda ardiendo se pierde con sus drones; un cañón allí también muere.",
    ],
  },
  {
    title: "Ataques",
    lines: [
      "Añade un rival por correo: también tiene que estar jugando.",
      "Arma el ataque en oleadas: cada una con su patrón, lado y carga (vacía, explosivo, inhibidor de cañones, de extintores o de trampas, invisible, soplador, turbo). Hasta {maxRaid} drones. Un enjambre mayor hace la formación más densa — el ataque casi no se alarga. Los drones salen del almacén enseguida; las cargas cuestan un recargo en créditos.",
      "La carga de soplado estalla como la simple y, de camino, aparta los globos de barrera: el globo se desplaza varias celdas lejos del dron sin reventar. Unos pocos sopladores en el enjambre ya recortan mucho lo que se llevan los globos; un tercio del enjambre lo deja casi en cero.",
      "El inhibidor de trampas funciona igual, pero su círculo es la mitad del de la trampa: tiene que acercarse mucho, bajo los cañones. Mientras el círculo cubre el imán, este no retiene a nadie y suelta a los capturados.",
      "La carga invisible estalla como la simple, pero los cañones y las lanzaderas no la ven en absoluto: ni apuntan ni guían el misil. Contra ella solo quedan tus manos y las trampas.",
      "La carga turbo estalla como la simple, pero el dron vuela una vez y media más rápido — menos tiempo bajo fuego.",
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
      "El vuelo te lleva sobre el mapa del rival bajo niebla de guerra. El avión entra por un borde al azar y descubre un círculo a su alrededor; guía con las flechas.",
      "Sus cañones pueden derribarlo. Sin aviones, la salida termina.",
      "Lo cartografiado es tuyo, huecos incluidos: botón «Mapa» en la ficha del rival. Pero envejece: donde el rival haya reconstruido desde tu vuelo, la niebla vuelve a cubrir esa zona.",
    ],
  },
  {
    title: "Mejoras",
    lines: [
      "Las clases cuestan {upgrade} cr por nivel. Diez niveles cada una, salvo la póliza: la suya acaba en el quinto, cuando la cobertura ya es total.",
      "Los drones vuelan más rápido y ven más lejos en exploración, los cañones llegan más lejos y disparan antes, la ametralladora apunta mejor, la manguera cubre más, los extintores riegan un círculo mayor, las trampas atrapan más lejos.",
      "Las lanzaderas crecen igual: más alcance y misil más rápido con cada nivel.",
      "El nivel vale para toda la clase a la vez: lo que ya tienes y lo que compres después.",
    ],
  },
];

const pt: RuleSection[] = [
  {
    title: "O armazém e o dinheiro",
    lines: [
      "Começas com {credits} cr e um armazém de {starter}×{starter} no meio do campo — é teu de graça.",
      "A cada {shift} horas o armazém paga renda: {income} cr por cada célula intacta.",
      "No mesmo momento sai a expedição: tudo o que está guardado vende-se ao dobro da compra — drones a {droneSale} cr. O que não mandaste ao combate, foi vendido.",
      "Estiveste fora? A renda acumula no máximo {capDays} dias.",
      "Falta dinheiro? O banco empresta {loanMin}–{loanMax} cr por {loanHours} horas a {loanRate}%. A mercadoria comprada pode arder num ataque; a dívida não.",
      "Estratégia de caixa: o dinheiro grosso vem de queimar armazéns rivais ({loot} cr por célula). O prémio de defesa é menor — uma defesa limpa de um enxame grande dá centenas ou cerca de mil, em média duas a três vezes menos que um ataque bom; as missões também o pagam. A zero — empréstimo, uma missão ou derrube total com chão de pelo menos {credits} cr.",
    ],
  },
  {
    title: "Construção",
    lines: [
      "«Área» — arrasta uma moldura ou toca numa célula. Uma célula nova custa {cell} cr e tem de tocar no que já está de pé.",
      "«Reparar» — igual, {repair} cr por célula queimada.",
      "«Demolir» — vende os restos das células queimadas a {scrap} cr cada. Fica terra nua, e o armazém tem de continuar inteiro.",
      "«Canhão» — {gun} cr numa célula intacta livre. Os canhões não se revendem, mas arrastam-se para onde quiseres no armazém.",
      "«Lançador» — {rocket} cr, coloca-se e arrasta-se como um canhão. Alcança {rocketRange} células, o dobro de um canhão, mas dispara torto: o míssil vira sozinho para o drone que nesse momento lhe estiver mais perto. Um míssil por lançador no ar e {rocketReload} s de recarga.",
      "«Extintor» — {spray} cr, coloca-se e arrasta-se tal como um canhão. Não dispara: assim que uma célula a menos de {sprayRange} pega fogo, a instalação gira e lança oito jactos à sua volta. Cada jacto pára no primeiro foco e demora a apagá-lo, e o depósito dá para {sprayTank} s de rega por ataque: nem um anel denso trava um incêndio grande.",
      "«Armadilha» — {trap} cr, coloca-se e arrasta-se como um canhão. Retém magneticamente até {trapCap} drones a {trapRange} células; os demais passam. Os canhões ainda podem abater os capturados; se a armadilha arder, a retenção cai.",
      "«Drones» — um contentor de {perCell} unidades por {droneBox} cr. Cada nível de drones encarece a compra em {priceStep}%.",
      "«Balões» — um contentor de {perCell} balões de barragem por {balloonBox} cr, coloca-se como o de drones. O ataque solta todos de uma vez: flutuam devagar sobre o campo e o drone que bate num morre com ele, sem fogo nem dano ao armazém ou ao chão. Mas um projéctil do canhão ou um míssil rebentam com igual facilidade o balão que lhes aparece à frente, por isso uma parede maciça deles protege o enxame dos teus próprios canhões. Não se melhoram e o ataque gasta-os todos.",
      "Canhões e contentores arrastam-se pelo armazém em qualquer modo, e isso não custa nada.",
    ],
  },
  {
    title: "Defesa",
    lines: [
      "Os ataques formam fila e são travados por ordem estrita — não podes saltar nem reordenar.",
      "Prepara-te o tempo que precisares: o primeiro na fila espera, mas só esse se pode travar.",
      "Em combate os canhões trabalham sozinhos — {gunRange} células de alcance, {reload} s de recarga. Com um drone na mira o rato dispara a metralhadora, mesmo sobre o armazém; sem drone, sobre o armazém vai a mangueira e sobre o chão a metralhadora.",
      "O fogo passa às células vizinhas a cada {spread} s. Um contentor numa célula a arder perde-se com os drones; um canhão ali também morre.",
    ],
  },
  {
    title: "Ataques",
    lines: [
      "Adiciona um rival por e-mail — ele também tem de estar a jogar.",
      "Monta o ataque em vagas: cada uma com o seu padrão, lado e carga (vazia, explosivo, inibidor de canhões, de extintores ou de armadilhas, invisível, soprador, turbo). Até {maxRaid} drones. Um enxame maior torna a formação mais densa — o ataque quase não se alonga. Os drones saem do armazém logo; as cargas custam um extra em créditos.",
      "A carga de sopro explode como a simples e, na aproximação, afasta os balões de barragem: o balão desloca-se várias células para longe do drone sem rebentar. Alguns sopradores no enxame já cortam bastante o que os balões levam; um terço do enxame deixa isso quase em zero.",
      "O inibidor de armadilhas funciona igual, mas o seu círculo é metade do da armadilha: tem de chegar perto, debaixo dos canhões. Enquanto o círculo cobre o íman, este não segura ninguém e larga os capturados.",
      "A carga invisível explode como a simples, mas canhões e lançadores não a veem de todo: não apontam nem guiam o míssil. Contra ela restam só as tuas mãos e as armadilhas.",
      "A carga turbo explode como a simples, mas o drone voa uma vez e meia mais depressa — menos tempo sob fogo.",
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
      "O voo leva-te sobre o mapa do rival sob nevoeiro de guerra. O avião entra por um bordo ao acaso e descobre um círculo à sua volta; guia com as setas.",
      "Os canhões dele podem abatê-lo. Sem aviões, a saída acaba.",
      "O que mapeaste fica teu, falhas incluídas — botão «Mapa» na ficha do rival. Mas envelhece: onde ele reconstruiu depois do teu voo, o nevoeiro volta a cobrir essa zona.",
    ],
  },
  {
    title: "Melhorias",
    lines: [
      "As classes custam {upgrade} cr por nível. Dez níveis cada, exceto a apólice: a dela acaba no quinto, quando a cobertura já é total.",
      "Os drones voam mais depressa e veem mais longe em reconhecimento, os canhões alcançam mais longe e disparam mais rápido, a metralhadora acerta melhor, a mangueira cobre mais, os extintores regam um círculo maior, as armadilhas apanham mais longe.",
      "Os lançadores crescem do mesmo modo: mais alcance e míssil mais rápido a cada nível.",
      "O nível vale para toda a classe de uma vez: o que já tens e o que comprares depois.",
    ],
  },
];

const fr: RuleSection[] = [
  {
    title: "L’entrepôt et l’argent",
    lines: [
      "Tu commences avec {credits} cr et un entrepôt de {starter}×{starter} au milieu du terrain — il est à toi gratuitement.",
      "Toutes les {shift} heures l’entrepôt rapporte un loyer : {income} cr par case intacte.",
      "Au même moment part l’expédition : tout ce qui est stocké se vend au double du prix d’achat — drones à {droneSale} cr. Ce que tu n’as pas envoyé au combat est vendu.",
      "Absent longtemps ? Le loyer s’accumule sur {capDays} jours au maximum.",
      "À court d’argent ? La banque prête {loanMin}–{loanMax} cr pour {loanHours} heures à {loanRate} %. La marchandise achetée peut brûler dans un raid, la dette non.",
      "Stratégie de caisse : le gros de l’argent vient des entrepôts rivaux ({loot} cr par case brûlée). La prime de défense est plus petite — un rejet propre d’un gros essaim rapporte des centaines ou environ mille, en moyenne deux à trois fois moins qu’une bonne attaque ; les missions la donnent aussi. À zéro — emprunt, une mission, ou wipe avec un plancher d’au moins {credits} cr.",
    ],
  },
  {
    title: "Construction",
    lines: [
      "« Surface » — tire un cadre ou clique une case. Une case neuve coûte {cell} cr et doit toucher l’existant.",
      "« Réparer » — pareil, {repair} cr par case brûlée.",
      "« Démolir » — revends les restes des cases brûlées à {scrap} cr pièce. Il reste de la terre nue, et l’entrepôt doit rester d’un seul tenant.",
      "« Canon » — {gun} cr sur une case intacte libre. Un canon ne se revend pas, mais se déplace où tu veux dans l’entrepôt.",
      "« Lance-roquettes » — {rocket} cr, posé et déplacé comme un canon. Il porte à {rocketRange} cases, deux fois plus qu’un canon, mais tire large : le missile se rabat ensuite sur le drone qui lui est alors le plus proche. Un seul missile en l’air par lanceur, {rocketReload} s de recharge.",
      "« Extincteur » — {spray} cr, il se pose et se déplace comme un canon. Il ne tire pas : dès qu’une case s’enflamme à moins de {sprayRange}, l’installation se met à tourner et projette huit jets autour d’elle. Un jet bute sur le premier foyer et met un temps à l’éteindre, et le réservoir ne tient que {sprayTank} s par raid : même un anneau serré cède devant un grand incendie.",
      "« Piège » — {trap} cr, posé et déplacé comme un canon. Il retient magnétiquement jusqu’à {trapCap} drones dans un rayon de {trapRange} cases ; les autres passent. Les canons peuvent encore abattre les capturés ; si le piège brûle, la prise tombe.",
      "« Drones » — un conteneur de {perCell} pièces pour {droneBox} cr. Chaque niveau de drones renchérit l’achat de {priceStep} %.",
      "« Ballons » — un conteneur de {perCell} ballons de barrage pour {balloonBox} cr, posé comme celui des drones. Le raid lâche d’un coup tous ceux que tu as : ils dérivent lentement au-dessus du terrain, et le drone qui en percute un meurt avec lui, sans incendie ni dégât pour l’entrepôt ni pour le sol. Mais un obus de canon ou une roquette crèvent tout aussi bien le ballon sur leur trajectoire : un mur compact de ballons abrite donc l’essaim de tes propres canons. Aucune amélioration, et un raid les consomme tous.",
      "Canons et conteneurs se déplacent dans l’entrepôt dans n’importe quel mode, et cela ne coûte rien.",
    ],
  },
  {
    title: "Défense",
    lines: [
      "Les raids font la queue et se jouent strictement dans l’ordre — pas de saut ni de réordonnancement.",
      "Prends le temps qu’il te faut : le premier attend, mais seul lui peut être combattu.",
      "Au combat les canons agissent seuls — {gunRange} cases de portée, {reload} s de recharge. Un drone dans le viseur et la souris tire à la mitrailleuse, même au-dessus de l’entrepôt ; sinon c’est la lance sur l’entrepôt et la mitrailleuse au sol.",
      "Le feu gagne les cases voisines toutes les {spread} s. Un conteneur sur une case en feu est perdu avec ses drones ; un canon y meurt aussi.",
    ],
  },
  {
    title: "Raids",
    lines: [
      "Ajoute un rival par e-mail — il doit jouer lui aussi.",
      "Compose le raid en vagues : chacune a son schéma, son côté et sa charge (vide, explosif, brouilleur de canons, d’extincteurs ou de pièges, furtive, souffleur, turbo). Jusqu’à {maxRaid} drones. Un plus gros essaim densifie la formation — le raid s’allonge à peine. Les drones quittent l’entrepôt aussitôt ; les charges coûtent un surcoût en crédits.",
      "La charge souffleuse explose comme une charge simple et, à l’approche, écarte les ballons de barrage : le ballon dérive de plusieurs cases loin du drone sans crever. Quelques souffleurs dans l’essaim réduisent déjà nettement ce que prennent les ballons ; un tiers de l’essaim ramène cela presque à zéro.",
      "Le brouilleur de pièges fonctionne pareil, mais son cercle vaut la moitié de celui du piège : il doit venir tout près, sous les canons. Tant que le cercle couvre l’aimant, celui-ci ne retient personne et lâche ses prises.",
      "La charge furtive explose comme une charge simple, mais canons et lance-roquettes ne la voient pas du tout : ni visée, ni guidage. Contre elle il ne reste que tes mains et les pièges.",
      "La charge turbo explose comme une charge simple, mais le drone vole une fois et demie plus vite — moins de temps sous le feu.",
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
      "Le vol t’emmène au-dessus de la carte du rival sous brouillard de guerre. L’avion entre par un bord au hasard et dégage un cercle autour de lui ; tu diriges avec les flèches.",
      "Ses canons peuvent l’abattre. Plus d’avions, la sortie est finie.",
      "Ce que tu as cartographié reste à toi, trous compris — bouton « Carte » sur la fiche du rival. Mais cela vieillit : là où il a rebâti depuis ton vol, le brouillard revient sur la zone.",
    ],
  },
  {
    title: "Améliorations",
    lines: [
      "Les classes coûtent {upgrade} cr le niveau. Dix niveaux chacune, sauf la police d’assurance : elle s’arrête au cinquième, la couverture y est déjà totale.",
      "Les drones volent plus vite et voient plus loin en reconnaissance, les canons portent plus loin et tirent plus vite, la mitrailleuse vise mieux, la lance couvre plus, les extincteurs arrosent un cercle plus large, les pièges attrapent plus loin.",
      "Les lance-roquettes progressent pareil : plus de portée et un missile plus rapide à chaque niveau.",
      "Le niveau vaut pour toute la classe d’un coup : ce que tu as déjà et ce que tu achèteras ensuite.",
    ],
  },
];

const de: RuleSection[] = [
  {
    title: "Lager und Geld",
    lines: [
      "Du startest mit {credits} Cr und einem {starter}×{starter}-Lager mitten im Feld — es gehört dir umsonst.",
      "Alle {shift} Stunden bringt das Lager Miete: {income} Cr pro heilem Feld.",
      "Im selben Moment geht die Verladung raus: alles Eingelagerte wird zum doppelten Einkaufspreis verkauft — Drohnen zu {droneSale} Cr. Was du nicht in den Einsatz geschickt hast, ist verkauft.",
      "Länger weg gewesen? Die Miete läuft höchstens {capDays} Tage auf.",
      "Zu wenig Geld? Die Bank leiht {loanMin}–{loanMax} Cr für {loanHours} Stunden zu {loanRate} %. Die dafür gekaufte Ware kann bei einem Angriff verbrennen — die Schuld nicht.",
      "Geldstrategie: das große Geld kommt von fremden Lagern ({loot} Cr je abgebranntem Feld). Die Abwehrprämie ist kleiner — saubere Abwehr eines großen Schwarms bringt Hunderte oder etwa tausend, im Schnitt zwei- bis dreimal weniger als ein guter Angriff; Missionen zahlen sie auch. Bei null — Kredit, eine Mission oder Totalverlust mit Boden von mindestens {credits} Cr.",
    ],
  },
  {
    title: "Bauen",
    lines: [
      "«Fläche» — Rahmen ziehen oder Feld antippen. Ein neues Feld kostet {cell} Cr und muss ans Bestehende grenzen.",
      "«Reparieren» — genauso, {repair} Cr je abgebranntem Feld.",
      "«Abriss» — die Reste abgebrannter Felder für je {scrap} Cr verwerten. Zurück bleibt nackter Boden, und das Lager muss ein Stück bleiben.",
      "«Geschütz» — {gun} Cr auf ein freies heiles Feld. Zurückverkaufen lässt sich ein Geschütz nicht, ziehen dagegen überallhin im Lager.",
      "«Raketenwerfer» — {rocket} Cr, wird wie ein Geschütz gesetzt und gezogen. Er reicht {rocketRange} Felder, doppelt so weit wie ein Geschütz, schießt aber ungenau: die Rakete dreht danach selbst auf die Drohne ein, die ihr gerade am nächsten ist. Eine Rakete je Werfer in der Luft, {rocketReload} s Nachladen.",
      "«Löschanlage» — {spray} Cr, wird wie ein Geschütz gesetzt und gezogen. Sie schießt nicht: brennt ein Feld im Umkreis von {sprayRange}, dreht sie auf und schleudert acht Strahlen um sich. Ein Strahl bleibt am ersten Brandherd hängen und braucht Zeit, ihn zu löschen, und der Tank reicht für {sprayTank} s je Angriff — auch ein dichter Ring verliert gegen ein großes Feuer.",
      "«Falle» — {trap} Cr, wird wie ein Geschütz gesetzt und gezogen. Sie hält magnetisch bis zu {trapCap} Drohnen im Umkreis von {trapRange} Feldern; Überschuss fliegt weiter. Geschütze können gefangene Drohnen weiter abschießen; brennt die Falle, endet der Halt.",
      "«Drohnen» — ein Container mit {perCell} Stück für {droneBox} Cr. Jede Drohnenstufe verteuert den Einkauf um {priceStep} %.",
      "«Ballons» — ein Behälter mit {perCell} Sperrballons für {balloonBox} Cr, wird wie ein Drohnenbehälter gesetzt. Ein Angriff lässt alle auf einmal steigen: sie treiben langsam über das Feld, und eine Drohne, die hineinfliegt, stirbt mit dem Ballon — ohne Feuer, ohne Schaden am Lager und am Boden. Doch ein Geschoss oder eine Rakete zerplatzt den Ballon im Weg ebenso bereitwillig, eine dichte Wand aus ihnen deckt den Schwarm also vor den eigenen Geschützen. Keine Stufen, und ein Angriff verbraucht sie alle.",
      "Geschütze und Container lassen sich in jedem Modus über das Lager ziehen, und das kostet nichts.",
    ],
  },
  {
    title: "Verteidigung",
    lines: [
      "Angriffe stellen sich in eine Schlange und werden streng der Reihe nach abgewehrt — überspringen oder umsortieren geht nicht.",
      "Nimm dir die Vorbereitungszeit, die du brauchst: der Erste in der Schlange wartet, aber nur ihn kannst du abwehren.",
      "Im Gefecht arbeiten die Geschütze allein — {gunRange} Felder Reichweite, {reload} s Nachladen. Ist eine Drohne im Fadenkreuz, feuert die Maus das MG — auch über dem Lager; sonst über dem Lager der Löschschlauch, über dem Boden das MG.",
      "Feuer springt alle {spread} s auf Nachbarfelder über. Ein Container auf brennendem Feld geht mit seinen Drohnen verloren, ein Geschütz dort ebenfalls.",
    ],
  },
  {
    title: "Angriffe",
    lines: [
      "Füge einen Gegner per E-Mail hinzu — er muss ebenfalls spielen.",
      "Baue den Angriff aus Wellen: jede mit eigenem Muster, Seite und Ladung (leer, Sprengstoff, Geschütz-, Sprinkler- oder Fallenstörer, Tarnkappe, Bläser, Turbo). Bis {maxRaid} Drohnen. Ein größerer Schwarm macht die Formation dichter — der Angriff dauert kaum länger. Die Drohnen verlassen das Lager sofort; Ladungen kosten einen Kreditaufschlag.",
      "Der Bläser-Sprengkopf explodiert wie ein einfacher und schiebt im Anflug Sperrballons beiseite: der Ballon treibt mehrere Felder von der Drohne weg, ohne zu zerplatzen. Schon ein paar Bläser im Schwarm senken deutlich, was die Ballons holen; ein Drittel des Schwarms bringt es nahe null.",
      "Der Fallenstörer arbeitet genauso, doch sein Kreis ist halb so groß wie der der Falle: er muss dicht heran, unter die Geschütze. Solange der Kreis den Magneten deckt, hält dieser niemanden und lässt die Gefangenen los.",
      "Der Tarnkappen-Sprengkopf explodiert wie ein einfacher, doch Geschütze und Werfer sehen ihn gar nicht: kein Zielen, kein Lenken. Gegen ihn bleiben nur deine Hände und die Fallen.",
      "Der Turbo-Sprengkopf explodiert wie ein einfacher, doch die Drohne fliegt anderthalbmal so schnell — weniger Zeit unter Beschuss.",
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
      "Ein Flug führt dich über die Karte des Gegners im Nebel des Krieges. Das Flugzeug kommt von einer zufälligen Kante und deckt einen Kreis um sich auf; gesteuert wird mit den Pfeiltasten.",
      "Seine Geschütze können es abschießen. Sind die Drohnen alle, ist der Einsatz vorbei.",
      "Das Kartierte bleibt deins, samt Lücken — Knopf «Karte» beim Gegner. Es veraltet aber: wo er seit deinem Flug umgebaut hat, kriecht der Nebel über dieses Feld zurück.",
    ],
  },
  {
    title: "Ausbau",
    lines: [
      "Klassen kosten {upgrade} Cr pro Stufe. Je zehn Stufen, außer der Police: sie endet bei fünf, dort ist die Deckung schon voll.",
      "Drohnen fliegen schneller und sehen in der Aufklärung weiter, Geschütze reichen weiter und schießen zügiger, das MG trifft besser, der Schlauch deckt mehr ab, Löschanlagen begießen einen größeren Kreis, Fallen greifen weiter.",
      "Raketenwerfer wachsen genauso: mehr Reichweite und eine schnellere Rakete je Stufe.",
      "Eine Stufe gilt für die ganze Klasse auf einmal — für Vorhandenes und für später Gekauftes.",
    ],
  },
];

const it: RuleSection[] = [
  {
    title: "Il magazzino e i soldi",
    lines: [
      "Parti con {credits} cr e un magazzino {starter}×{starter} in mezzo al campo: è tuo gratis.",
      "Ogni {shift} ore il magazzino rende affitto: {income} cr per ogni cella intatta.",
      "Nello stesso momento parte la spedizione: tutto ciò che è stoccato si vende al doppio dell’acquisto — droni a {droneSale} cr. Quello che non hai mandato in battaglia è venduto.",
      "Sei stato via? L’affitto si accumula al massimo per {capDays} giorni.",
      "Soldi finiti? La banca presta {loanMin}–{loanMax} cr per {loanHours} ore al {loanRate}%. La merce comprata può bruciare in un attacco, il debito no.",
      "Strategia di cassa: i soldi grossi vengono dai magazzini rivali ({loot} cr per cella bruciata). Il premio di difesa è minore — un respingimento pulito di uno sciame grande dà centinaia o circa mille, in media due-tre volte meno di un buon attacco; anche le missioni lo pagano. A zero — prestito, una missione o wipe con un pavimento di almeno {credits} cr.",
    ],
  },
  {
    title: "Costruzione",
    lines: [
      "«Area» — trascina una cornice o tocca una cella. Una cella nuova costa {cell} cr e deve toccare ciò che c’è già.",
      "«Riparare» — lo stesso, {repair} cr per cella bruciata.",
      "«Demolisci» — vendi i resti delle celle bruciate a {scrap} cr l’una. Resta terra nuda, e il magazzino deve restare tutto d’un pezzo.",
      "«Cannone» — {gun} cr su una cella intatta libera. Il cannone non si rivende, ma si trascina ovunque nel magazzino.",
      "«Lanciarazzi» — {rocket} cr, si piazza e si trascina come un cannone. Arriva a {rocketRange} celle, il doppio di un cannone, ma spara largo: il missile poi vira da solo sul drone che in quel momento gli è più vicino. Un missile per lanciarazzi in aria e {rocketReload} s di ricarica.",
      "«Estintore» — {spray} cr, si posa e si trascina come un cannone. Non spara: appena una cella entro {sprayRange} prende fuoco, l’impianto gira e lancia otto getti attorno a sé. Un getto si ferma sul primo focolaio e ci mette un po’ a spegnerlo, e il serbatoio basta per {sprayTank} s a incursione: anche un anello fitto cede a un incendio grosso.",
      "«Trappola» — {trap} cr, si posa e si trascina come un cannone. Tiene magneticamente fino a {trapCap} droni entro {trapRange} celle; gli altri passano. I cannoni possono ancora abbattere i catturati; se la trappola brucia, la presa cade.",
      "«Droni» — un container da {perCell} pezzi per {droneBox} cr. Ogni livello droni rincara l’acquisto del {priceStep}%.",
      "«Palloni» — un contenitore da {perCell} palloni di sbarramento per {balloonBox} cr, si piazza come quello dei droni. L’attacco li libera tutti insieme: vanno alla deriva lenti sopra il campo, e il drone che ne colpisce uno muore con lui, senza incendio né danni al magazzino o al terreno. Ma una granata del cannone o un missile fanno scoppiare con la stessa facilità il pallone sulla loro traiettoria, quindi un muro compatto di palloni ripara lo sciame dai tuoi stessi cannoni. Nessun potenziamento, e un attacco li consuma tutti.",
      "Cannoni e container si trascinano per il magazzino in qualsiasi modalità, e non costa nulla.",
    ],
  },
  {
    title: "Difesa",
    lines: [
      "Gli attacchi si mettono in coda e si affrontano rigorosamente in ordine — non si salta né si riordina.",
      "Prenditi tutto il tempo che ti serve: il primo in coda aspetta, ma si può affrontare solo quello.",
      "In battaglia i cannoni lavorano da soli — {gunRange} celle di gittata, {reload} s di ricarica. Con un drone nel mirino il mouse spara la mitragliatrice, anche sopra il magazzino; senza drone, sul magazzino c’è la manichetta e sul terreno la mitragliatrice.",
      "Il fuoco passa alle celle vicine ogni {spread} s. Un container su una cella in fiamme si perde con i suoi droni; anche un cannone lì muore.",
    ],
  },
  {
    title: "Attacchi",
    lines: [
      "Aggiungi un rivale per e-mail: deve giocare anche lui.",
      "Componi l’attacco a ondate: ognuna con schema, lato e carica (vuota, esplosivo, disturbatore di cannoni, di estintori o di trappole, invisibile, soffiatore, turbo). Fino a {maxRaid} droni. Uno sciame più grande rende la formazione più fitta — l’attacco quasi non si allunga. I droni lasciano subito il magazzino; le cariche costano un sovrapprezzo in crediti.",
      "La carica soffiante esplode come quella semplice e, in avvicinamento, scosta i palloni di sbarramento: il pallone si allontana di qualche cella dal drone senza scoppiare. Bastano pochi soffiatori nello sciame per ridurre molto quel che prendono i palloni; un terzo dello sciame lo porta quasi a zero.",
      "Il disturbatore di trappole funziona allo stesso modo, ma il suo cerchio è metà di quello della trappola: deve avvicinarsi molto, sotto i cannoni. Finché il cerchio copre il magnete, questo non trattiene nessuno e libera i catturati.",
      "La carica invisibile esplode come quella semplice, ma cannoni e lanciarazzi non la vedono affatto: niente mira, niente guida. Contro di lei restano solo le tue mani e le trappole.",
      "La carica turbo esplode come quella semplice, ma il drone vola una volta e mezza più veloce — meno tempo sotto il fuoco.",
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
      "Il volo ti porta sulla mappa del rivale sotto la nebbia di guerra. L’aereo entra da un bordo a caso e scopre un cerchio attorno a sé; si guida con le frecce.",
      "I suoi cannoni possono abbatterlo. Finiti i ricognitori, la sortita è chiusa.",
      "Quello che hai mappato resta tuo, buchi compresi — pulsante «Mappa» nella scheda del rivale. Ma invecchia: dove lui ha ricostruito dopo il tuo volo, la nebbia torna su quella zona.",
    ],
  },
  {
    title: "Potenziamenti",
    lines: [
      "Le classi costano {upgrade} cr per livello. Dieci livelli ciascuna, tranne la polizza: la sua finisce al quinto, dove la copertura è già piena.",
      "I droni volano più veloci e vedono più lontano in ricognizione, i cannoni arrivano più lontano e sparano prima, la mitragliatrice mira meglio, la manichetta copre di più, gli estintori bagnano un cerchio più ampio, le trappole afferrano più lontano.",
      "I lanciarazzi crescono allo stesso modo: più gittata e missile più veloce a ogni livello.",
      "Il livello vale per tutta la classe in una volta: per ciò che hai già e per ciò che comprerai poi.",
    ],
  },
];

export const RULES: Record<Locale, RuleSection[]> = { en, ru, es, pt, fr, de, it };
