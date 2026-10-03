// Тексты бота на языке игрока. Язык клиент сообщает серверу сам (set_locale)
// — тот, что выбран в игре; до первого входа берём язык из самого телеграма.
// Ключи у всех языков одни и те же: не хватит перевода — TypeScript не соберёт.

export const TG_LOCALES = ["ru", "en", "es", "pt", "fr", "de", "it"] as const;
export type TgLocale = (typeof TG_LOCALES)[number];

/** Язык из профиля или из телеграма; незнакомый — английский. */
export function tgLocale(...wanted: (string | null | undefined)[]): TgLocale {
  for (const w of wanted) {
    const base = (w ?? "").toLowerCase().split(/[-_]/)[0];
    const hit = TG_LOCALES.find((l) => l === base);
    if (hit) return hit;
  }
  return "en";
}

const en = {
  base: "warehouse",
  sentRaid: "A raid is flying at your warehouse from «{attacker}» — {drones} drones. Defend when you are ready: the queue cannot be skipped.",
  testRaid: "A raid on your warehouse — {drones} drones in the queue.",
  resolvedDestroyed: "«{defender}» fought off the defence — the warehouse burned to the ground. Bonus {loot} cr. Replay: {replay}",
  resolvedClean: "«{defender}» beat off your raid without losses. Replay: {replay}",
  resolvedBurned: "«{defender}» fought the defence. Cells burned: {burned}, bonus {loot} cr. Replay: {replay}",
  raidComment: "«{author}» wrote about the raid: «{text}» {replay}",
  rivalAdded: "Warehouse «{from}» added you as a rival — now they see your address and can send raids. They are in your list too, so you can strike back.",
  rivalMessage: "Message from warehouse «{from}»:\n\n{text}",
  noCode: "Open the game, go to the menu and press «Telegram» — the link is there.",
  badCode: "I do not know this link. Get a fresh one from the game menu.",
  linked: "Done. I will write here about raids on «{name}» and how yours went.",
  shipmentSold: "{drones} drones shipped from «{base}» for {credits} cr.",
};
type Dict = typeof en;

const DICTS: Record<TgLocale, Dict> = {
  en,
  ru: {
    base: "склад",
    sentRaid: "На твой склад летит налёт от «{attacker}» — {drones} дронов. Отбивай, когда готов: очередь не пропускается.",
    testRaid: "Налёт на твой склад — {drones} дронов в очереди.",
    resolvedDestroyed: "«{defender}» отыграл защиту — склад выгорел дотла. Премия {loot} кр. Повтор боя: {replay}",
    resolvedClean: "«{defender}» отбил твой налёт без потерь. Повтор боя: {replay}",
    resolvedBurned: "«{defender}» отыграл защиту. Сгорело клеток: {burned}, премия {loot} кр. Повтор боя: {replay}",
    raidComment: "«{author}» написал по налёту: «{text}» {replay}",
    rivalAdded: "Склад «{from}» добавил тебя во враги — теперь он видит твой адрес и может слать налёты. Он же появился и в твоём списке: ответить есть чем.",
    rivalMessage: "Сообщение от склада «{from}»:\n\n{text}",
    noCode: "Открой игру, зайди в меню и нажми «Телеграм» — там будет ссылка.",
    badCode: "Такой ссылки не знаю. Возьми свежую в меню игры.",
    linked: "Готово. Буду писать сюда про налёты на «{name}» и про исход твоих.",
    shipmentSold: "Со склада «{base}» отгружено {drones} дронов на {credits} кр.",
  },
  es: {
    base: "almacén",
    sentRaid: "Un ataque de «{attacker}» vuela hacia tu almacén — {drones} drones. Defiéndete cuando quieras: la cola no se salta.",
    testRaid: "Ataque a tu almacén — {drones} drones en la cola.",
    resolvedDestroyed: "«{defender}» jugó su defensa — el almacén ardió por completo. Premio {loot} cr. Repetición: {replay}",
    resolvedClean: "«{defender}» rechazó tu ataque sin pérdidas. Repetición: {replay}",
    resolvedBurned: "«{defender}» jugó su defensa. Celdas quemadas: {burned}, premio {loot} cr. Repetición: {replay}",
    raidComment: "«{author}» escribió sobre el ataque: «{text}» {replay}",
    rivalAdded: "El almacén «{from}» te añadió como rival: ahora ve tu dirección y puede enviarte ataques. También aparece en tu lista, así que puedes responder.",
    rivalMessage: "Mensaje del almacén «{from}»:\n\n{text}",
    noCode: "Abre el juego, entra en el menú y pulsa «Telegram»: ahí está el enlace.",
    badCode: "No conozco ese enlace. Pide uno nuevo en el menú del juego.",
    linked: "Listo. Escribiré aquí sobre los ataques a «{name}» y el resultado de los tuyos.",
    shipmentSold: "Del almacén «{base}» se enviaron {drones} drones por {credits} cr.",
  },
  pt: {
    base: "armazém",
    sentRaid: "Um ataque de «{attacker}» voa para o teu armazém — {drones} drones. Defende quando estiveres pronto: a fila não se salta.",
    testRaid: "Ataque ao teu armazém — {drones} drones na fila.",
    resolvedDestroyed: "«{defender}» jogou a defesa — o armazém ardeu por completo. Prémio {loot} cr. Repetição: {replay}",
    resolvedClean: "«{defender}» repeliu o teu ataque sem perdas. Repetição: {replay}",
    resolvedBurned: "«{defender}» jogou a defesa. Células queimadas: {burned}, prémio {loot} cr. Repetição: {replay}",
    raidComment: "«{author}» escreveu sobre o ataque: «{text}» {replay}",
    rivalAdded: "O armazém «{from}» adicionou-te como rival — agora vê o teu endereço e pode mandar ataques. Também está na tua lista, por isso podes responder.",
    rivalMessage: "Mensagem do armazém «{from}»:\n\n{text}",
    noCode: "Abre o jogo, vai ao menu e carrega em «Telegram» — a ligação está lá.",
    badCode: "Não conheço essa ligação. Pede uma nova no menu do jogo.",
    linked: "Feito. Vou escrever aqui sobre os ataques a «{name}» e o resultado dos teus.",
    shipmentSold: "Do armazém «{base}» foram expedidos {drones} drones por {credits} cr.",
  },
  fr: {
    base: "entrepôt",
    sentRaid: "Un raid de « {attacker} » vole vers ton entrepôt — {drones} drones. Défends-toi quand tu es prêt : la file ne se saute pas.",
    testRaid: "Raid sur ton entrepôt — {drones} drones dans la file.",
    resolvedDestroyed: "« {defender} » a joué sa défense — l’entrepôt a brûlé entièrement. Prime {loot} cr. Rediffusion : {replay}",
    resolvedClean: "« {defender} » a repoussé ton raid sans pertes. Rediffusion : {replay}",
    resolvedBurned: "« {defender} » a joué sa défense. Cases brûlées : {burned}, prime {loot} cr. Rediffusion : {replay}",
    raidComment: "« {author} » a écrit sur le raid : « {text} » {replay}",
    rivalAdded: "L’entrepôt « {from} » t’a ajouté comme rival — il voit désormais ton adresse et peut t’envoyer des raids. Il est aussi dans ta liste : tu peux riposter.",
    rivalMessage: "Message de l’entrepôt « {from} » :\n\n{text}",
    noCode: "Ouvre le jeu, va dans le menu et appuie sur « Telegram » — le lien s’y trouve.",
    badCode: "Je ne connais pas ce lien. Prends-en un nouveau dans le menu du jeu.",
    linked: "C’est fait. J’écrirai ici sur les raids contre « {name} » et l’issue des tiens.",
    shipmentSold: "{drones} drones expédiés depuis « {base} » pour {credits} cr.",
  },
  de: {
    base: "Lager",
    sentRaid: "Ein Angriff von „{attacker}“ fliegt auf dein Lager zu — {drones} Drohnen. Wehr dich, wenn du bereit bist: die Warteschlange lässt sich nicht überspringen.",
    testRaid: "Angriff auf dein Lager — {drones} Drohnen in der Warteschlange.",
    resolvedDestroyed: "„{defender}“ hat verteidigt — das Lager ist bis auf den Grund abgebrannt. Prämie {loot} Cr. Wiederholung: {replay}",
    resolvedClean: "„{defender}“ hat deinen Angriff ohne Verluste abgewehrt. Wiederholung: {replay}",
    resolvedBurned: "„{defender}“ hat verteidigt. Verbrannte Felder: {burned}, Prämie {loot} Cr. Wiederholung: {replay}",
    raidComment: "„{author}“ schrieb zum Angriff: „{text}“ {replay}",
    rivalAdded: "Das Lager „{from}“ hat dich als Rivalen hinzugefügt — es sieht jetzt deine Adresse und kann Angriffe schicken. Es steht auch in deiner Liste: du kannst zurückschlagen.",
    rivalMessage: "Nachricht vom Lager „{from}“:\n\n{text}",
    noCode: "Öffne das Spiel, geh ins Menü und tippe auf „Telegram“ — dort ist der Link.",
    badCode: "Diesen Link kenne ich nicht. Hol dir einen neuen im Spielmenü.",
    linked: "Fertig. Ich schreibe hier über Angriffe auf „{name}“ und wie deine ausgehen.",
    shipmentSold: "Aus dem Lager „{base}“ wurden {drones} Drohnen für {credits} Cr verschickt.",
  },
  it: {
    base: "magazzino",
    sentRaid: "Un attacco di «{attacker}» vola verso il tuo magazzino — {drones} droni. Difenditi quando sei pronto: la coda non si salta.",
    testRaid: "Attacco al tuo magazzino — {drones} droni in coda.",
    resolvedDestroyed: "«{defender}» ha giocato la difesa — il magazzino è bruciato del tutto. Premio {loot} cr. Replay: {replay}",
    resolvedClean: "«{defender}» ha respinto il tuo attacco senza perdite. Replay: {replay}",
    resolvedBurned: "«{defender}» ha giocato la difesa. Celle bruciate: {burned}, premio {loot} cr. Replay: {replay}",
    raidComment: "«{author}» ha scritto sull’attacco: «{text}» {replay}",
    rivalAdded: "Il magazzino «{from}» ti ha aggiunto come rivale — ora vede il tuo indirizzo e può mandarti attacchi. È anche nella tua lista: puoi rispondere.",
    rivalMessage: "Messaggio dal magazzino «{from}»:\n\n{text}",
    noCode: "Apri il gioco, vai nel menu e premi «Telegram» — lì trovi il link.",
    badCode: "Non conosco questo link. Prendine uno nuovo dal menu del gioco.",
    linked: "Fatto. Scriverò qui degli attacchi a «{name}» e dell’esito dei tuoi.",
    shipmentSold: "Dal magazzino «{base}» sono partiti {drones} droni per {credits} cr.",
  },
};

/** Текст бота на языке l. Числа форматируются по тому же языку. */
export function tg(
  l: TgLocale,
  key: keyof Dict,
  vars: Record<string, string | number> = {}
): string {
  return DICTS[l][key].replace(/\{(\w+)\}/g, (whole, name: string) => {
    const v = vars[name];
    if (v === undefined) return whole;
    return typeof v === "number" ? v.toLocaleString(l) : v;
  });
}
