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
    ],
  },
  {
    title: "Building",
    lines: [
      "«Area» — drag a frame or tap a cell. A new cell costs {cell} cr and must touch what already stands.",
      "«Repair» — the same, {repair} cr per burnt cell.",
      "«Gun» — {gun} cr on a free intact cell; clicking a gun in this mode sells it back for {refund} cr.",
      "«Drones» and «Recon» — a container of {perCell} for {droneBox} and {scoutBox} cr.",
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
      "For every cell you burn down you take {loot} cr straight from the defender's account. The defender's insurance pays them {insureCell} cr per burnt cell and another {insureDepot} if goods were stored there.",
      "Nobody is paid for downed drones: money comes from goods, not from shooting.",
    ],
  },
  {
    title: "Recon",
    lines: [
      "Recon planes live in their own containers and are spent by flying.",
      "A flight takes you over the rival's map under fog of war. The plane comes in from a random edge and uncovers a circle around itself; steer with the left and right arrows.",
      "Their guns can shoot it down. Out of planes — the sortie is over.",
      "What you mapped stays yours, gaps and all. Look at it later with the «Map» button on the rival's card.",
    ],
  },
  {
    title: "Upgrades",
    lines: [
      "Five classes, ten levels each, {upgrade} cr per level.",
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
    ],
  },
  {
    title: "Стройка",
    lines: [
      "«Площадь» — тяни рамку или ткни в клетку. Новая клетка стоит {cell} кр и должна примыкать к тому, что уже стоит.",
      "«Ремонт» — так же, {repair} кр за сгоревшую клетку.",
      "«Пушка» — {gun} кр на свободную целую клетку; клик по пушке в этом режиме продаёт её обратно за {refund} кр.",
      "«Дроны» и «Разведка» — контейнер на {perCell} штук за {droneBox} и {scoutBox} кр.",
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
      "За каждую сожжённую клетку ты снимаешь {loot} кр прямо со счёта защитника. Ему страховая платит {insureCell} кр за клетку и ещё {insureDepot}, если на ней лежал товар.",
      "За сбитых дронов не платят никому: деньги приносит товар, а не стрельба.",
    ],
  },
  {
    title: "Разведка",
    lines: [
      "Разведчики лежат в своих контейнерах и тратятся вылетом.",
      "Вылет уносит тебя на карту соперника под туманом войны. Самолёт заходит со случайного края и открывает круг вокруг себя; рулишь стрелками влево-вправо.",
      "Его могут сбить чужие пушки. Кончились разведчики — вылет окончен.",
      "Снятое остаётся твоим вместе с пробелами. Посмотреть потом — кнопкой «Карта» в карточке соперника.",
    ],
  },
  {
    title: "Прокачка",
    lines: [
      "Пять классов, по десять уровней, {upgrade} кр за уровень.",
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
    ],
  },
  {
    title: "Construcción",
    lines: [
      "«Área»: arrastra un marco o toca una celda. Una celda nueva cuesta {cell} cr y debe tocar lo ya construido.",
      "«Reparar»: igual, {repair} cr por celda quemada.",
      "«Cañón»: {gun} cr en una celda intacta libre; pulsar un cañón en este modo lo revende por {refund} cr.",
      "«Drones» y «Exploración»: un contenedor de {perCell} por {droneBox} y {scoutBox} cr.",
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
      "Por cada celda quemada te llevas {loot} cr directamente de la cuenta del defensor. A él el seguro le paga {insureCell} cr por celda y {insureDepot} más si allí había mercancía.",
      "Nadie cobra por drones derribados: el dinero lo trae la mercancía, no los disparos.",
    ],
  },
  {
    title: "Exploración",
    lines: [
      "Los aviones de reconocimiento están en sus contenedores y se gastan al volar.",
      "El vuelo te lleva sobre el mapa del rival bajo niebla de guerra. El avión entra por un borde al azar y descubre un círculo a su alrededor; guía con las flechas.",
      "Sus cañones pueden derribarlo. Sin aviones, la salida termina.",
      "Lo cartografiado es tuyo, huecos incluidos. Míralo después con el botón «Mapa» en la ficha del rival.",
    ],
  },
  {
    title: "Mejoras",
    lines: [
      "Cinco clases, diez niveles cada una, {upgrade} cr por nivel.",
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
    ],
  },
  {
    title: "Construção",
    lines: [
      "«Área» — arrasta uma moldura ou toca numa célula. Uma célula nova custa {cell} cr e tem de tocar no que já está de pé.",
      "«Reparar» — igual, {repair} cr por célula queimada.",
      "«Canhão» — {gun} cr numa célula intacta livre; clicar num canhão neste modo revende-o por {refund} cr.",
      "«Drones» e «Reconhecimento» — um contentor de {perCell} por {droneBox} e {scoutBox} cr.",
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
      "Por cada célula queimada levas {loot} cr diretamente da conta do defensor. A ele o seguro paga {insureCell} cr por célula e mais {insureDepot} se lá estivesse mercadoria.",
      "Ninguém é pago por drones abatidos: o dinheiro vem da mercadoria, não dos tiros.",
    ],
  },
  {
    title: "Reconhecimento",
    lines: [
      "Os aviões de reconhecimento ficam nos seus contentores e gastam-se a voar.",
      "O voo leva-te sobre o mapa do rival sob nevoeiro de guerra. O avião entra por um bordo ao acaso e descobre um círculo à sua volta; guia com as setas.",
      "Os canhões dele podem abatê-lo. Sem aviões, a saída acaba.",
      "O que mapeaste fica teu, falhas incluídas. Vês depois com o botão «Mapa» na ficha do rival.",
    ],
  },
  {
    title: "Melhorias",
    lines: [
      "Cinco classes, dez níveis cada, {upgrade} cr por nível.",
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
    ],
  },
  {
    title: "Construction",
    lines: [
      "« Surface » — tire un cadre ou clique une case. Une case neuve coûte {cell} cr et doit toucher l’existant.",
      "« Réparer » — pareil, {repair} cr par case brûlée.",
      "« Canon » — {gun} cr sur une case intacte libre ; cliquer un canon dans ce mode le revend {refund} cr.",
      "« Drones » et « Reconnaissance » — un conteneur de {perCell} pour {droneBox} et {scoutBox} cr.",
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
      "Pour chaque case brûlée tu prends {loot} cr directement sur le compte du défenseur. Lui, son assurance lui verse {insureCell} cr par case et {insureDepot} de plus si de la marchandise y était stockée.",
      "Personne n’est payé pour les drones abattus : l’argent vient de la marchandise, pas des tirs.",
    ],
  },
  {
    title: "Reconnaissance",
    lines: [
      "Les avions de reconnaissance tiennent dans leurs conteneurs et se dépensent en vol.",
      "Le vol t’emmène au-dessus de la carte du rival sous brouillard de guerre. L’avion entre par un bord au hasard et dégage un cercle autour de lui ; tu diriges avec les flèches.",
      "Ses canons peuvent l’abattre. Plus d’avions, la sortie est finie.",
      "Ce que tu as cartographié reste à toi, trous compris. À revoir avec le bouton « Carte » sur la fiche du rival.",
    ],
  },
  {
    title: "Améliorations",
    lines: [
      "Cinq classes, dix niveaux chacune, {upgrade} cr le niveau.",
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
    ],
  },
  {
    title: "Bauen",
    lines: [
      "«Fläche» — Rahmen ziehen oder Feld antippen. Ein neues Feld kostet {cell} Cr und muss ans Bestehende grenzen.",
      "«Reparieren» — genauso, {repair} Cr je abgebranntem Feld.",
      "«Geschütz» — {gun} Cr auf ein freies heiles Feld; ein Klick auf ein Geschütz in diesem Modus verkauft es für {refund} Cr zurück.",
      "«Drohnen» und «Aufklärung» — ein Container mit {perCell} Stück für {droneBox} bzw. {scoutBox} Cr.",
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
      "Für jedes abgebrannte Feld nimmst du {loot} Cr direkt vom Konto des Verteidigers. Ihm zahlt die Versicherung {insureCell} Cr je Feld und weitere {insureDepot}, wenn dort Ware lag.",
      "Für abgeschossene Drohnen zahlt niemand: Geld bringt die Ware, nicht das Schießen.",
    ],
  },
  {
    title: "Aufklärung",
    lines: [
      "Aufklärer liegen in eigenen Containern und werden durch Flüge verbraucht.",
      "Ein Flug führt dich über die Karte des Gegners im Nebel des Krieges. Das Flugzeug kommt von einer zufälligen Kante und deckt einen Kreis um sich auf; gesteuert wird mit den Pfeiltasten.",
      "Seine Geschütze können es abschießen. Sind die Aufklärer alle, ist der Einsatz vorbei.",
      "Das Kartierte bleibt deins, samt Lücken. Später anzusehen über «Karte» in der Karte des Gegners.",
    ],
  },
  {
    title: "Ausbau",
    lines: [
      "Fünf Klassen, je zehn Stufen, {upgrade} Cr pro Stufe.",
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
    ],
  },
  {
    title: "Costruzione",
    lines: [
      "«Area» — trascina una cornice o tocca una cella. Una cella nuova costa {cell} cr e deve toccare ciò che c’è già.",
      "«Riparare» — lo stesso, {repair} cr per cella bruciata.",
      "«Cannone» — {gun} cr su una cella intatta libera; cliccare un cannone in questa modalità lo rivende a {refund} cr.",
      "«Droni» e «Ricognizione» — un container da {perCell} per {droneBox} e {scoutBox} cr.",
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
      "Per ogni cella bruciata prendi {loot} cr direttamente dal conto del difensore. A lui l’assicurazione paga {insureCell} cr per cella e altri {insureDepot} se lì c’era merce.",
      "Nessuno viene pagato per i droni abbattuti: i soldi li porta la merce, non gli spari.",
    ],
  },
  {
    title: "Ricognizione",
    lines: [
      "I ricognitori stanno nei loro container e si consumano volando.",
      "Il volo ti porta sulla mappa del rivale sotto la nebbia di guerra. L’aereo entra da un bordo a caso e scopre un cerchio attorno a sé; si guida con le frecce.",
      "I suoi cannoni possono abbatterlo. Finiti i ricognitori, la sortita è chiusa.",
      "Quello che hai mappato resta tuo, buchi compresi. Si rivede con il pulsante «Mappa» nella scheda del rivale.",
    ],
  },
  {
    title: "Potenziamenti",
    lines: [
      "Cinque classi, dieci livelli ciascuna, {upgrade} cr per livello.",
      "I droni volano più veloci, i cannoni arrivano più lontano e sparano prima, i ricognitori vedono di più e volano più veloci, la mitragliatrice mira meglio, la manichetta copre di più.",
      "Il livello vale per tutta la classe in una volta: per ciò che hai già e per ciò che comprerai poi.",
    ],
  },
];

export const RULES: Record<Locale, RuleSection[]> = { en, ru, es, pt, fr, de, it };
