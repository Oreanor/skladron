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
      "Once a day the warehouse pays rent: {income} cr for every intact cell.",
      "The same moment everything stored ships out at double the purchase price: drones at {droneSale} cr, recon planes at {scoutSale} cr. Whatever you did not send into battle is sold.",
      "Away for a while? The rent accrues for at most {capDays} days.",
      "Short of money? The bank lends {loanMin}–{loanMax} cr for {loanHours} hours at {loanRate}%. The goods you buy with it can burn in a raid — the debt will not.",
    ],
  },
  {
    title: "Building",
    lines: [
      "«Area» — drag a frame or tap a cell. A new cell costs {cell} cr and must touch what already stands.",
      "«Repair» — the same, {repair} cr per burnt cell.",
      "«Demolish» — sell the remains of burnt cells for {scrap} cr each. Bare ground is left behind, and the warehouse must stay in one piece.",
      "«Gun» — {gun} cr on a free intact cell. Guns are not sold back, but they can be dragged anywhere on the warehouse.",
      "«Drones» and «Recon» — a container of {perCell} pieces: {droneBox} cr for drones, {scoutBox} for recon planes. Every level makes them {priceStep}% dearer to buy.",
      "Guns and containers can be dragged around the warehouse in any mode, and that costs nothing.",
    ],
  },
  {
    title: "Defence",
    lines: [
      "Raids queue up and are fought strictly in order. The first one has half an hour on the clock.",
      "Miss that window and the raid plays out without you: the guns fire on their own, but there is nobody at the hose or the machine gun.",
      "In battle the guns work by themselves — {gunRange} cells of range, {reload} s to reload. Your mouse over the ground is the machine gun, over the warehouse it is the fire hose.",
      "Fire spreads to neighbouring cells every {spread} s. A container on a burning cell is lost with the drones inside; a gun there dies too.",
    ],
  },
  {
    title: "Raids",
    lines: [
      "Add a rival by e-mail — they have to be playing too.",
      "Choose how many drones to send (up to {maxRaid}), the pattern and the side. The drones leave the warehouse at once.",
      "The defender fights the raid on their own screen. You get a report afterwards — and can watch the whole thing replayed.",
      "For every cell you burn down you get a {loot} cr bonus. The defender's insurance pays them {insureCell} cr per burnt cell — exactly the repair. The basic policy stops there; every level of it adds {insureShare}% cover for goods and guns lost in the fire, up to the full value.",
      "Nobody is paid for downed drones: money comes from goods, not from shooting.",
      "Every finished battle lands in the log: watch the replay or copy a link so others can see how it went.",
    ],
  },
  {
    title: "Recon",
    lines: [
      "Recon planes live in their own containers and are spent by flying.",
      "A flight takes you over the rival's map under fog of war. The plane comes in from a random edge and uncovers a circle around itself; steer with the left and right arrows.",
      "Their guns can shoot it down. Out of planes — the sortie is over.",
      "What you mapped stays yours, gaps and all — the «Map» button on the rival's card. But it goes stale: wherever they have rebuilt since your flight, the fog creeps back over that patch.",
    ],
  },
  {
    title: "Upgrades",
    lines: [
      "Six classes, {upgrade} cr per level. Ten levels each, except the insurance policy: it tops out at five, where cover is already full.",
      "Drones fly faster, guns reach further and shoot quicker, recon planes see more and fly faster, the machine gun aims better, the hose covers more.",
      "A level applies to everything at once — to what is already in stock and to everything bought later.",
    ],
  },
];

const ru: RuleSection[] = [
  {
    title: "Склад и деньги",
    lines: [
      "Начинаешь с {credits} кр и складом {starter}×{starter} посреди поля — он твой даром.",
      "Раз в сутки склад приносит аренду: {income} кр с каждой целой клетки.",
      "Тогда же уходит отгрузка: всё, что лежит, продаётся вдвое дороже закупки — дроны по {droneSale} кр, разведчики по {scoutSale}. Что не пустил в дело, то продано.",
      "Не заходил долго — аренда копится не больше чем за {capDays} суток.",
      "Не хватает денег — банк даёт {loanMin}–{loanMax} кр на {loanHours} часа под {loanRate}%. Купленный на них товар может сгореть в налёте, долг — нет.",
    ],
  },
  {
    title: "Стройка",
    lines: [
      "«Площадь» — тяни рамку или ткни в клетку. Новая клетка стоит {cell} кр и должна примыкать к тому, что уже стоит.",
      "«Ремонт» — так же, {repair} кр за сгоревшую клетку.",
      "«Снос» — сдать остатки сгоревших клеток во вторсырьё, {scrap} кр за клетку. Остаётся голая земля, и склад не должен развалиться надвое.",
      "«Пушка» — {gun} кр на свободную целую клетку. Обратно пушка не продаётся, но её можно перетащить куда угодно по складу.",
      "«Дроны» и «Разведка» — контейнер на {perCell} штук: {droneBox} кр за дронов, {scoutBox} за разведчиков. С каждым уровнем закупка дорожает на {priceStep}%.",
      "Пушки и контейнеры таскаются по складу в любом режиме, и это бесплатно.",
    ],
  },
  {
    title: "Оборона",
    lines: [
      "Налёты встают в очередь и отбиваются строго по порядку. У первого идут часы — полчаса.",
      "Не успел — налёт проходит сам: пушки стреляют, но брандспойт и пулемёт держать некому.",
      "В бою пушки работают сами — радиус {gunRange} клеток, перезарядка {reload} с. Мышь над землёй — пулемётная очередь, над складом — брандспойт.",
      "Огонь перекидывается на соседние клетки каждые {spread} с. Контейнер на горящей клетке пропадает вместе с дронами, пушка там же гибнет.",
    ],
  },
  {
    title: "Налёты",
    lines: [
      "Добавь соперника по почте — он тоже должен играть.",
      "Выбери, сколько дронов послать (до {maxRaid}), схему и сторону. Дроны уходят со склада сразу.",
      "Налёт отбивает защитник у себя. Тебе приходит отчёт — и повтор боя, который можно посмотреть целиком.",
      "За каждую сожжённую клетку тебе идёт премия {loot} кр. Защитнику страховая платит {insureCell} кр за клетку — ровно на ремонт. Базовый полис на этом и кончается; каждый его уровень добавляет {insureShare}% покрытия сгоревшего товара и пушек, до полной стоимости.",
      "За сбитых дронов не платят никому: деньги приносит товар, а не стрельба.",
      "Каждый отгремевший бой попадает в журнал: там его можно пересмотреть или дать ссылку, чтобы посмотрели другие.",
    ],
  },
  {
    title: "Разведка",
    lines: [
      "Разведчики лежат в своих контейнерах и тратятся вылетом.",
      "Вылет уносит тебя на карту соперника под туманом войны. Самолёт заходит со случайного края и открывает круг вокруг себя; рулишь стрелками влево-вправо.",
      "Его могут сбить чужие пушки. Кончились разведчики — вылет окончен.",
      "Снятое остаётся твоим вместе с пробелами — кнопка «Карта» в карточке соперника. Но данные стареют: где враг с тех пор перестраивался, тот участок снова затягивает туманом.",
    ],
  },
  {
    title: "Прокачка",
    lines: [
      "Шесть классов, {upgrade} кр за уровень. У каждого по десять уровней, кроме полиса: у него пять, дальше покрывать нечего.",
      "Дроны летят быстрее, пушки бьют дальше и резвее, разведчики видят дальше и летят быстрее, пулемёт точнее, струя шире.",
      "Уровень достаётся всему классу разом — и тому, что уже на складе, и тому, что купишь потом.",
    ],
  },
];

const es: RuleSection[] = [
  {
    title: "El almacén y el dinero",
    lines: [
      "Empiezas con {credits} cr y un almacén de {starter}×{starter} en medio del campo: es tuyo gratis.",
      "Una vez al día el almacén paga renta: {income} cr por cada celda intacta.",
      "En ese mismo momento se expide todo lo almacenado al doble del precio de compra: drones a {droneSale} cr, aviones a {scoutSale}. Lo que no enviaste al combate, se vende.",
      "¿Estuviste fuera? La renta se acumula como mucho {capDays} días.",
      "¿Falta dinero? El banco presta {loanMin}–{loanMax} cr por {loanHours} horas al {loanRate}%. La mercancía comprada puede arder en un ataque; la deuda no.",
    ],
  },
  {
    title: "Construcción",
    lines: [
      "«Área»: arrastra un marco o toca una celda. Una celda nueva cuesta {cell} cr y debe tocar lo ya construido.",
      "«Reparar»: igual, {repair} cr por celda quemada.",
      "«Demoler»: vende los restos de las celdas quemadas a {scrap} cr cada una. Queda tierra desnuda y el almacén debe seguir de una pieza.",
      "«Cañón»: {gun} cr en una celda intacta libre. Los cañones no se revenden, pero se arrastran a cualquier punto del almacén.",
      "«Drones» y «Exploración»: un contenedor de {perCell} unidades: {droneBox} cr los drones, {scoutBox} los exploradores. Cada nivel encarece la compra un {priceStep}%.",
      "Cañones y contenedores se arrastran por el almacén en cualquier modo, y eso no cuesta nada.",
    ],
  },
  {
    title: "Defensa",
    lines: [
      "Los ataques hacen cola y se combaten en orden estricto. El primero tiene media hora de reloj.",
      "Si no llegas, el ataque se resuelve sin ti: los cañones disparan solos, pero nadie sostiene la manguera ni la ametralladora.",
      "En combate los cañones actúan solos: {gunRange} celdas de alcance, {reload} s de recarga. El ratón sobre el suelo es la ametralladora; sobre el almacén, la manguera.",
      "El fuego pasa a las celdas vecinas cada {spread} s. Un contenedor en una celda ardiendo se pierde con sus drones; un cañón allí también muere.",
    ],
  },
  {
    title: "Ataques",
    lines: [
      "Añade un rival por correo: también tiene que estar jugando.",
      "Elige cuántos drones enviar (hasta {maxRaid}), el patrón y el lado. Los drones salen del almacén enseguida.",
      "El defensor combate el ataque en su pantalla. Tú recibes un informe y la repetición completa del combate.",
      "Por cada celda quemada recibes una prima de {loot} cr. Al defensor el seguro le paga {insureCell} cr por celda: justo la reparación. La póliza básica acaba ahí; cada nivel añade un {insureShare}% de cobertura de la mercancía y los cañones perdidos, hasta el valor total.",
      "Nadie cobra por drones derribados: el dinero lo trae la mercancía, no los disparos.",
      "Cada combate terminado va al registro: puedes volver a verlo o copiar un enlace para que lo vean otros.",
    ],
  },
  {
    title: "Exploración",
    lines: [
      "Los aviones de reconocimiento están en sus contenedores y se gastan al volar.",
      "El vuelo te lleva sobre el mapa del rival bajo niebla de guerra. El avión entra por un borde al azar y descubre un círculo a su alrededor; guía con las flechas.",
      "Sus cañones pueden derribarlo. Sin aviones, la salida termina.",
      "Lo cartografiado es tuyo, huecos incluidos: botón «Mapa» en la ficha del rival. Pero envejece: donde el rival haya reconstruido desde tu vuelo, la niebla vuelve a cubrir esa zona.",
    ],
  },
  {
    title: "Mejoras",
    lines: [
      "Seis clases, {upgrade} cr por nivel. Diez niveles cada una, salvo la póliza: la suya acaba en el quinto, cuando la cobertura ya es total.",
      "Los drones vuelan más rápido, los cañones llegan más lejos y disparan antes, los exploradores ven más y vuelan más, la ametralladora apunta mejor, la manguera cubre más.",
      "El nivel vale para toda la clase a la vez: lo que ya tienes y lo que compres después.",
    ],
  },
];

const pt: RuleSection[] = [
  {
    title: "O armazém e o dinheiro",
    lines: [
      "Começas com {credits} cr e um armazém de {starter}×{starter} no meio do campo — é teu de graça.",
      "Uma vez por dia o armazém paga renda: {income} cr por cada célula intacta.",
      "No mesmo momento sai a expedição: tudo o que está guardado vende-se ao dobro da compra — drones a {droneSale} cr, aviões a {scoutSale}. O que não mandaste ao combate, foi vendido.",
      "Estiveste fora? A renda acumula no máximo {capDays} dias.",
      "Falta dinheiro? O banco empresta {loanMin}–{loanMax} cr por {loanHours} horas a {loanRate}%. A mercadoria comprada pode arder num ataque; a dívida não.",
    ],
  },
  {
    title: "Construção",
    lines: [
      "«Área» — arrasta uma moldura ou toca numa célula. Uma célula nova custa {cell} cr e tem de tocar no que já está de pé.",
      "«Reparar» — igual, {repair} cr por célula queimada.",
      "«Demolir» — vende os restos das células queimadas a {scrap} cr cada. Fica terra nua, e o armazém tem de continuar inteiro.",
      "«Canhão» — {gun} cr numa célula intacta livre. Os canhões não se revendem, mas arrastam-se para onde quiseres no armazém.",
      "«Drones» e «Reconhecimento» — um contentor de {perCell} unidades: {droneBox} cr os drones, {scoutBox} os reconhecedores. Cada nível encarece a compra em {priceStep}%.",
      "Canhões e contentores arrastam-se pelo armazém em qualquer modo, e isso não custa nada.",
    ],
  },
  {
    title: "Defesa",
    lines: [
      "Os ataques formam fila e são travados por ordem estrita. O primeiro tem meia hora no relógio.",
      "Se não chegares a tempo, o ataque decorre sem ti: os canhões disparam sozinhos, mas ninguém segura a mangueira nem a metralhadora.",
      "Em combate os canhões trabalham sozinhos — {gunRange} células de alcance, {reload} s de recarga. O rato sobre o chão é a metralhadora; sobre o armazém, a mangueira.",
      "O fogo passa às células vizinhas a cada {spread} s. Um contentor numa célula a arder perde-se com os drones; um canhão ali também morre.",
    ],
  },
  {
    title: "Ataques",
    lines: [
      "Adiciona um rival por e-mail — ele também tem de estar a jogar.",
      "Escolhe quantos drones enviar (até {maxRaid}), o padrão e o lado. Os drones saem do armazém logo.",
      "O defensor trava o ataque no ecrã dele. Tu recebes um relatório — e a repetição completa do combate.",
      "Por cada célula queimada recebes um prémio de {loot} cr. Ao defensor o seguro paga {insureCell} cr por célula — exatamente a reparação. A apólice básica fica por aí; cada nível acrescenta {insureShare}% de cobertura da mercadoria e dos canhões perdidos, até ao valor total.",
      "Ninguém é pago por drones abatidos: o dinheiro vem da mercadoria, não dos tiros.",
      "Cada combate terminado vai para o registo: podes revê-lo ou copiar uma ligação para outros verem.",
    ],
  },
  {
    title: "Reconhecimento",
    lines: [
      "Os aviões de reconhecimento ficam nos seus contentores e gastam-se a voar.",
      "O voo leva-te sobre o mapa do rival sob nevoeiro de guerra. O avião entra por um bordo ao acaso e descobre um círculo à sua volta; guia com as setas.",
      "Os canhões dele podem abatê-lo. Sem aviões, a saída acaba.",
      "O que mapeaste fica teu, falhas incluídas — botão «Mapa» na ficha do rival. Mas envelhece: onde ele reconstruiu depois do teu voo, o nevoeiro volta a cobrir essa zona.",
    ],
  },
  {
    title: "Melhorias",
    lines: [
      "Seis classes, {upgrade} cr por nível. Dez níveis cada, exceto a apólice: a dela acaba no quinto, quando a cobertura já é total.",
      "Os drones voam mais depressa, os canhões alcançam mais longe e disparam mais rápido, os reconhecedores veem mais e voam mais, a metralhadora acerta melhor, a mangueira cobre mais.",
      "O nível vale para toda a classe de uma vez: o que já tens e o que comprares depois.",
    ],
  },
];

const fr: RuleSection[] = [
  {
    title: "L’entrepôt et l’argent",
    lines: [
      "Tu commences avec {credits} cr et un entrepôt de {starter}×{starter} au milieu du terrain — il est à toi gratuitement.",
      "Une fois par jour l’entrepôt rapporte un loyer : {income} cr par case intacte.",
      "Au même moment part l’expédition : tout ce qui est stocké se vend au double du prix d’achat — drones à {droneSale} cr, avions à {scoutSale}. Ce que tu n’as pas envoyé au combat est vendu.",
      "Absent longtemps ? Le loyer s’accumule sur {capDays} jours au maximum.",
      "À court d’argent ? La banque prête {loanMin}–{loanMax} cr pour {loanHours} heures à {loanRate} %. La marchandise achetée peut brûler dans un raid, la dette non.",
    ],
  },
  {
    title: "Construction",
    lines: [
      "« Surface » — tire un cadre ou clique une case. Une case neuve coûte {cell} cr et doit toucher l’existant.",
      "« Réparer » — pareil, {repair} cr par case brûlée.",
      "« Démolir » — revends les restes des cases brûlées à {scrap} cr pièce. Il reste de la terre nue, et l’entrepôt doit rester d’un seul tenant.",
      "« Canon » — {gun} cr sur une case intacte libre. Un canon ne se revend pas, mais se déplace où tu veux dans l’entrepôt.",
      "« Drones » et « Reconnaissance » — un conteneur de {perCell} pièces : {droneBox} cr les drones, {scoutBox} les éclaireurs. Chaque niveau renchérit l’achat de {priceStep} %.",
      "Canons et conteneurs se déplacent dans l’entrepôt dans n’importe quel mode, et cela ne coûte rien.",
    ],
  },
  {
    title: "Défense",
    lines: [
      "Les raids font la queue et se jouent strictement dans l’ordre. Le premier a une demi-heure au compteur.",
      "Passé ce délai, le raid se déroule sans toi : les canons tirent seuls, mais personne ne tient la lance ni la mitrailleuse.",
      "Au combat les canons agissent seuls — {gunRange} cases de portée, {reload} s de recharge. La souris au sol, c’est la mitrailleuse ; sur l’entrepôt, la lance à incendie.",
      "Le feu gagne les cases voisines toutes les {spread} s. Un conteneur sur une case en feu est perdu avec ses drones ; un canon y meurt aussi.",
    ],
  },
  {
    title: "Raids",
    lines: [
      "Ajoute un rival par e-mail — il doit jouer lui aussi.",
      "Choisis combien de drones envoyer (jusqu’à {maxRaid}), le schéma et le côté. Les drones quittent l’entrepôt aussitôt.",
      "Le défenseur mène le combat chez lui. Tu reçois un rapport — et le replay complet de la bataille.",
      "Pour chaque case brûlée tu touches une prime de {loot} cr. Le défenseur reçoit de son assurance {insureCell} cr par case — juste la réparation. La police de base s’arrête là ; chaque niveau ajoute {insureShare} % de couverture de la marchandise et des canons perdus, jusqu’à la valeur entière.",
      "Personne n’est payé pour les drones abattus : l’argent vient de la marchandise, pas des tirs.",
      "Chaque combat terminé va au journal : on peut le revoir ou copier un lien pour le montrer.",
    ],
  },
  {
    title: "Reconnaissance",
    lines: [
      "Les avions de reconnaissance tiennent dans leurs conteneurs et se dépensent en vol.",
      "Le vol t’emmène au-dessus de la carte du rival sous brouillard de guerre. L’avion entre par un bord au hasard et dégage un cercle autour de lui ; tu diriges avec les flèches.",
      "Ses canons peuvent l’abattre. Plus d’avions, la sortie est finie.",
      "Ce que tu as cartographié reste à toi, trous compris — bouton « Carte » sur la fiche du rival. Mais cela vieillit : là où il a rebâti depuis ton vol, le brouillard revient sur la zone.",
    ],
  },
  {
    title: "Améliorations",
    lines: [
      "Six classes, {upgrade} cr le niveau. Dix niveaux chacune, sauf la police d’assurance : elle s’arrête au cinquième, la couverture y est déjà totale.",
      "Les drones volent plus vite, les canons portent plus loin et tirent plus vite, les éclaireurs voient plus et volent plus vite, la mitrailleuse vise mieux, la lance couvre plus.",
      "Le niveau vaut pour toute la classe d’un coup : ce que tu as déjà et ce que tu achèteras ensuite.",
    ],
  },
];

const de: RuleSection[] = [
  {
    title: "Lager und Geld",
    lines: [
      "Du startest mit {credits} Cr und einem {starter}×{starter}-Lager mitten im Feld — es gehört dir umsonst.",
      "Einmal am Tag bringt das Lager Miete: {income} Cr pro heilem Feld.",
      "Im selben Moment geht die Verladung raus: alles Eingelagerte wird zum doppelten Einkaufspreis verkauft — Drohnen zu {droneSale} Cr, Aufklärer zu {scoutSale}. Was du nicht in den Einsatz geschickt hast, ist verkauft.",
      "Länger weg gewesen? Die Miete läuft höchstens {capDays} Tage auf.",
      "Zu wenig Geld? Die Bank leiht {loanMin}–{loanMax} Cr für {loanHours} Stunden zu {loanRate} %. Die dafür gekaufte Ware kann bei einem Angriff verbrennen — die Schuld nicht.",
    ],
  },
  {
    title: "Bauen",
    lines: [
      "«Fläche» — Rahmen ziehen oder Feld antippen. Ein neues Feld kostet {cell} Cr und muss ans Bestehende grenzen.",
      "«Reparieren» — genauso, {repair} Cr je abgebranntem Feld.",
      "«Abriss» — die Reste abgebrannter Felder für je {scrap} Cr verwerten. Zurück bleibt nackter Boden, und das Lager muss ein Stück bleiben.",
      "«Geschütz» — {gun} Cr auf ein freies heiles Feld. Zurückverkaufen lässt sich ein Geschütz nicht, ziehen dagegen überallhin im Lager.",
      "«Drohnen» und «Aufklärung» — ein Container mit {perCell} Stück: {droneBox} Cr für Drohnen, {scoutBox} für Aufklärer. Jede Stufe verteuert den Einkauf um {priceStep} %.",
      "Geschütze und Container lassen sich in jedem Modus über das Lager ziehen, und das kostet nichts.",
    ],
  },
  {
    title: "Verteidigung",
    lines: [
      "Angriffe stellen sich in eine Schlange und werden streng der Reihe nach abgewehrt. Beim ersten läuft eine halbe Stunde.",
      "Verpasst du sie, läuft der Angriff ohne dich ab: die Geschütze feuern von selbst, aber niemand hält Schlauch oder MG.",
      "Im Gefecht arbeiten die Geschütze allein — {gunRange} Felder Reichweite, {reload} s Nachladen. Die Maus über dem Boden ist das MG, über dem Lager der Löschschlauch.",
      "Feuer springt alle {spread} s auf Nachbarfelder über. Ein Container auf brennendem Feld geht mit seinen Drohnen verloren, ein Geschütz dort ebenfalls.",
    ],
  },
  {
    title: "Angriffe",
    lines: [
      "Füge einen Gegner per E-Mail hinzu — er muss ebenfalls spielen.",
      "Wähle, wie viele Drohnen du schickst (bis {maxRaid}), das Muster und die Seite. Die Drohnen verlassen das Lager sofort.",
      "Der Verteidiger schlägt den Angriff bei sich. Du bekommst einen Bericht — und die vollständige Wiederholung des Gefechts.",
      "Für jedes abgebrannte Feld bekommst du eine Prämie von {loot} Cr. Dem Verteidiger zahlt die Versicherung {insureCell} Cr je Feld — genau die Reparatur. Die Grundpolice endet dort; jede Stufe deckt zusätzlich {insureShare} % von verbrannter Ware und Geschützen, bis zum vollen Wert.",
      "Für abgeschossene Drohnen zahlt niemand: Geld bringt die Ware, nicht das Schießen.",
      "Jedes beendete Gefecht landet im Buch: dort lässt es sich noch einmal ansehen oder als Link weitergeben.",
    ],
  },
  {
    title: "Aufklärung",
    lines: [
      "Aufklärer liegen in eigenen Containern und werden durch Flüge verbraucht.",
      "Ein Flug führt dich über die Karte des Gegners im Nebel des Krieges. Das Flugzeug kommt von einer zufälligen Kante und deckt einen Kreis um sich auf; gesteuert wird mit den Pfeiltasten.",
      "Seine Geschütze können es abschießen. Sind die Aufklärer alle, ist der Einsatz vorbei.",
      "Das Kartierte bleibt deins, samt Lücken — Knopf «Karte» beim Gegner. Es veraltet aber: wo er seit deinem Flug umgebaut hat, kriecht der Nebel über dieses Feld zurück.",
    ],
  },
  {
    title: "Ausbau",
    lines: [
      "Sechs Klassen, {upgrade} Cr pro Stufe. Je zehn Stufen, außer der Police: sie endet bei fünf, dort ist die Deckung schon voll.",
      "Drohnen fliegen schneller, Geschütze reichen weiter und schießen zügiger, Aufklärer sehen mehr und fliegen schneller, das MG trifft besser, der Schlauch deckt mehr ab.",
      "Eine Stufe gilt für die ganze Klasse auf einmal — für Vorhandenes und für später Gekauftes.",
    ],
  },
];

const it: RuleSection[] = [
  {
    title: "Il magazzino e i soldi",
    lines: [
      "Parti con {credits} cr e un magazzino {starter}×{starter} in mezzo al campo: è tuo gratis.",
      "Una volta al giorno il magazzino rende affitto: {income} cr per ogni cella intatta.",
      "Nello stesso momento parte la spedizione: tutto ciò che è stoccato si vende al doppio dell’acquisto — droni a {droneSale} cr, ricognitori a {scoutSale}. Quello che non hai mandato in battaglia è venduto.",
      "Sei stato via? L’affitto si accumula al massimo per {capDays} giorni.",
      "Soldi finiti? La banca presta {loanMin}–{loanMax} cr per {loanHours} ore al {loanRate}%. La merce comprata può bruciare in un attacco, il debito no.",
    ],
  },
  {
    title: "Costruzione",
    lines: [
      "«Area» — trascina una cornice o tocca una cella. Una cella nuova costa {cell} cr e deve toccare ciò che c’è già.",
      "«Riparare» — lo stesso, {repair} cr per cella bruciata.",
      "«Demolisci» — vendi i resti delle celle bruciate a {scrap} cr l’una. Resta terra nuda, e il magazzino deve restare tutto d’un pezzo.",
      "«Cannone» — {gun} cr su una cella intatta libera. Il cannone non si rivende, ma si trascina ovunque nel magazzino.",
      "«Droni» e «Ricognizione» — un container da {perCell} pezzi: {droneBox} cr i droni, {scoutBox} i ricognitori. Ogni livello rincara l’acquisto del {priceStep}%.",
      "Cannoni e container si trascinano per il magazzino in qualsiasi modalità, e non costa nulla.",
    ],
  },
  {
    title: "Difesa",
    lines: [
      "Gli attacchi si mettono in coda e si affrontano rigorosamente in ordine. Il primo ha mezz’ora di orologio.",
      "Se non fai in tempo, l’attacco si svolge senza di te: i cannoni sparano da soli, ma nessuno tiene la manichetta né la mitragliatrice.",
      "In battaglia i cannoni lavorano da soli — {gunRange} celle di gittata, {reload} s di ricarica. Il mouse sul terreno è la mitragliatrice, sul magazzino è la manichetta.",
      "Il fuoco passa alle celle vicine ogni {spread} s. Un container su una cella in fiamme si perde con i suoi droni; anche un cannone lì muore.",
    ],
  },
  {
    title: "Attacchi",
    lines: [
      "Aggiungi un rivale per e-mail: deve giocare anche lui.",
      "Scegli quanti droni mandare (fino a {maxRaid}), lo schema e il lato. I droni lasciano subito il magazzino.",
      "Il difensore affronta l’attacco da sé. A te arriva un rapporto — e la replica completa della battaglia.",
      "Per ogni cella bruciata ricevi un premio di {loot} cr. Al difensore l’assicurazione paga {insureCell} cr per cella: esattamente la riparazione. La polizza base finisce lì; ogni livello aggiunge il {insureShare}% di copertura di merce e cannoni perduti, fino al valore pieno.",
      "Nessuno viene pagato per i droni abbattuti: i soldi li porta la merce, non gli spari.",
      "Ogni combattimento finito finisce nel diario: lo si può rivedere o copiarne il link per mostrarlo.",
    ],
  },
  {
    title: "Ricognizione",
    lines: [
      "I ricognitori stanno nei loro container e si consumano volando.",
      "Il volo ti porta sulla mappa del rivale sotto la nebbia di guerra. L’aereo entra da un bordo a caso e scopre un cerchio attorno a sé; si guida con le frecce.",
      "I suoi cannoni possono abbatterlo. Finiti i ricognitori, la sortita è chiusa.",
      "Quello che hai mappato resta tuo, buchi compresi — pulsante «Mappa» nella scheda del rivale. Ma invecchia: dove lui ha ricostruito dopo il tuo volo, la nebbia torna su quella zona.",
    ],
  },
  {
    title: "Potenziamenti",
    lines: [
      "Sei classi, {upgrade} cr per livello. Dieci livelli ciascuna, tranne la polizza: la sua finisce al quinto, dove la copertura è già piena.",
      "I droni volano più veloci, i cannoni arrivano più lontano e sparano prima, i ricognitori vedono di più e volano più veloci, la mitragliatrice mira meglio, la manichetta copre di più.",
      "Il livello vale per tutta la classe in una volta: per ciò che hai già e per ciò che comprerai poi.",
    ],
  },
];

export const RULES: Record<Locale, RuleSection[]> = { en, ru, es, pt, fr, de, it };
