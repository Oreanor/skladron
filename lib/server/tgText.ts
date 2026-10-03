// Тексты бота на языке игрока. Язык клиент сообщает серверу сам (set_locale)
// — тот, что выбран в игре; до первого входа берём язык из самого телеграма.
// Ключи у всех языков одни и те же: не хватит перевода — TypeScript не соберёт.

export const TG_LOCALES = ["ru", "en", "es", "pt", "fr", "de", "it", "uk", "pl", "tr", "zh", "ja", "ko"] as const;
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
  uk: {
    base: "склад",
    sentRaid: "На твій склад летить наліт від «{attacker}» — {drones} дронів. Відбивай, коли будеш готовий: черга не пропускається.",
    testRaid: "Наліт на твій склад — {drones} дронів у черзі.",
    resolvedDestroyed: "«{defender}» відіграв оборону — склад вигорів дотла. Премія {loot} кр. Повтор бою: {replay}",
    resolvedClean: "«{defender}» відбив твій наліт без втрат. Повтор бою: {replay}",
    resolvedBurned: "«{defender}» відіграв оборону. Згоріло клітинок: {burned}, премія {loot} кр. Повтор бою: {replay}",
    raidComment: "«{author}» написав про наліт: «{text}» {replay}",
    rivalAdded: "Склад «{from}» додав тебе до ворогів — тепер він бачить твою адресу й може слати нальоти. Він з’явився й у твоєму списку, тож є чим відповісти.",
    rivalMessage: "Повідомлення від складу «{from}»:\n\n{text}",
    noCode: "Відкрий гру, зайди в меню й натисни «Телеграм» — там буде посилання.",
    badCode: "Такого посилання не знаю. Візьми свіже в меню гри.",
    linked: "Готово. Писатиму сюди про нальоти на «{name}» і про результат твоїх.",
    shipmentSold: "Зі складу «{base}» відвантажено {drones} дронів на {credits} кр.",
  },
  pl: {
    base: "magazyn",
    sentRaid: "Na twój magazyn leci nalot od «{attacker}» — {drones} dronów. Broń się, kiedy będziesz gotów: kolejki nie da się pominąć.",
    testRaid: "Nalot na twój magazyn — {drones} dronów w kolejce.",
    resolvedDestroyed: "«{defender}» rozegrał obronę — magazyn spłonął doszczętnie. Premia {loot} kr. Powtórka: {replay}",
    resolvedClean: "«{defender}» odparł twój nalot bez strat. Powtórka: {replay}",
    resolvedBurned: "«{defender}» rozegrał obronę. Spalone pola: {burned}, premia {loot} kr. Powtórka: {replay}",
    raidComment: "«{author}» napisał o nalocie: «{text}» {replay}",
    rivalAdded: "Magazyn «{from}» dodał cię jako rywala — teraz widzi twój adres i może wysyłać naloty. Jest też na twojej liście, więc możesz oddać.",
    rivalMessage: "Wiadomość od magazynu «{from}»:\n\n{text}",
    noCode: "Otwórz grę, wejdź do menu i naciśnij «Telegram» — tam jest link.",
    badCode: "Nie znam tego linku. Weź świeży z menu gry.",
    linked: "Gotowe. Będę tu pisać o nalotach na «{name}» i o wynikach twoich.",
    shipmentSold: "Z magazynu «{base}» wysłano {drones} dronów za {credits} kr.",
  },
  tr: {
    base: "depo",
    sentRaid: "«{attacker}» deponuza bir baskın gönderdi — {drones} dron. Hazır olduğunda savun: sıra atlanamaz.",
    testRaid: "Depona baskın — kuyrukta {drones} dron.",
    resolvedDestroyed: "«{defender}» savunmasını oynadı — depo kül oldu. Ödül {loot} kr. Tekrar: {replay}",
    resolvedClean: "«{defender}» baskınını kayıpsız püskürttü. Tekrar: {replay}",
    resolvedBurned: "«{defender}» savunmasını oynadı. Yanan hücre: {burned}, ödül {loot} kr. Tekrar: {replay}",
    raidComment: "«{author}» baskın hakkında yazdı: «{text}» {replay}",
    rivalAdded: "«{from}» deposu seni rakip olarak ekledi — artık adresini görüyor ve baskın gönderebilir. O da senin listende, yani karşılık verebilirsin.",
    rivalMessage: "«{from}» deposundan mesaj:\n\n{text}",
    noCode: "Oyunu aç, menüye gir ve «Telegram»a bas — bağlantı orada.",
    badCode: "Bu bağlantıyı tanımıyorum. Oyun menüsünden yenisini al.",
    linked: "Tamam. «{name}» deposuna gelen baskınları ve seninkilerin sonucunu buraya yazacağım.",
    shipmentSold: "«{base}» deposundan {drones} dron {credits} kr'ye sevk edildi.",
  },
  zh: {
    base: "仓库",
    sentRaid: "「{attacker}」的空袭正飞向你的仓库——{drones} 架无人机。准备好再防守：队列不能跳过。",
    testRaid: "你的仓库遭到空袭——队列中有 {drones} 架无人机。",
    resolvedDestroyed: "「{defender}」打完了防守——仓库被烧光。奖金 {loot} 币。回放：{replay}",
    resolvedClean: "「{defender}」无损击退了你的空袭。回放：{replay}",
    resolvedBurned: "「{defender}」打完了防守。烧毁格子：{burned}，奖金 {loot} 币。回放：{replay}",
    raidComment: "「{author}」评论了空袭：「{text}」{replay}",
    rivalAdded: "仓库「{from}」把你加为对手——现在对方能看到你的地址并发动空袭。对方也出现在你的列表里，你可以还击。",
    rivalMessage: "来自仓库「{from}」的消息：\n\n{text}",
    noCode: "打开游戏，进入菜单并点击「Telegram」——链接在那里。",
    badCode: "我不认识这个链接。请在游戏菜单里获取新的。",
    linked: "好了。我会在这里通知你「{name}」遭到的空袭以及你发动的空袭结果。",
    shipmentSold: "仓库「{base}」发出 {drones} 架无人机，收入 {credits} 币。",
  },
  ja: {
    base: "倉庫",
    sentRaid: "「{attacker}」からの空襲があなたの倉庫に向かっています — ドローン {drones} 機。準備ができたら防衛を：順番は飛ばせません。",
    testRaid: "あなたの倉庫に空襲 — 列にドローン {drones} 機。",
    resolvedDestroyed: "「{defender}」が防衛を終えました — 倉庫は全焼。報酬 {loot} cr。リプレイ：{replay}",
    resolvedClean: "「{defender}」はあなたの空襲を無傷で撃退しました。リプレイ：{replay}",
    resolvedBurned: "「{defender}」が防衛を終えました。焼けたマス：{burned}、報酬 {loot} cr。リプレイ：{replay}",
    raidComment: "「{author}」が空襲についてコメント：「{text}」{replay}",
    rivalAdded: "倉庫「{from}」があなたをライバルに追加しました — あなたのアドレスが見え、空襲を送れます。相手もあなたのリストに入ったので、反撃できます。",
    rivalMessage: "倉庫「{from}」からのメッセージ：\n\n{text}",
    noCode: "ゲームを開き、メニューで「Telegram」を押してください — リンクはそこにあります。",
    badCode: "そのリンクは知りません。ゲームのメニューから新しいものを取得してください。",
    linked: "完了。「{name}」への空襲と、あなたの空襲の結果をここでお知らせします。",
    shipmentSold: "倉庫「{base}」からドローン {drones} 機を {credits} cr で出荷しました。",
  },
  ko: {
    base: "창고",
    sentRaid: "«{attacker}»의 공습이 당신 창고로 날아옵니다 — 드론 {drones}대. 준비되면 방어하세요: 순서는 건너뛸 수 없습니다.",
    testRaid: "당신 창고에 공습 — 대기열에 드론 {drones}대.",
    resolvedDestroyed: "«{defender}»가 방어를 마쳤습니다 — 창고가 전소했습니다. 보상 {loot} cr. 리플레이: {replay}",
    resolvedClean: "«{defender}»가 당신의 공습을 피해 없이 막았습니다. 리플레이: {replay}",
    resolvedBurned: "«{defender}»가 방어를 마쳤습니다. 탄 칸: {burned}, 보상 {loot} cr. 리플레이: {replay}",
    raidComment: "«{author}»가 공습에 대해 남겼습니다: «{text}» {replay}",
    rivalAdded: "창고 «{from}»이(가) 당신을 라이벌로 추가했습니다 — 이제 당신 주소를 보고 공습을 보낼 수 있습니다. 상대도 당신 목록에 있으니 반격할 수 있습니다.",
    rivalMessage: "창고 «{from}»의 메시지:\n\n{text}",
    noCode: "게임을 열고 메뉴에서 «Telegram»을 누르세요 — 링크가 거기 있습니다.",
    badCode: "모르는 링크입니다. 게임 메뉴에서 새로 받으세요.",
    linked: "완료. «{name}»에 대한 공습과 당신 공습의 결과를 여기로 알려 드리겠습니다.",
    shipmentSold: "창고 «{base}»에서 드론 {drones}대를 {credits} cr에 출고했습니다.",
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
