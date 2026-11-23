// Даты в интерфейсе. Форматы — в одном месте, чтобы одно и то же событие не
// выглядело по-разному в соседних окнах.

/** «23 нояб., 14:05» — на языке браузера: когда был налёт, когда снимали разведку. */
export const whenLong = (at: number) =>
  new Date(at).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** «23.11, 14:05» — плотно, для ленты сообщений. */
export const whenShort = (at: number) =>
  new Date(at).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** «23.11.25» — дата боя в журнале. */
export const dayShort = (at: number) =>
  new Date(at).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
