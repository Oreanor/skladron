/**
 * Префикс адреса, под которым живёт игра. На Vercel игра в корне сайта (""),
 * на домашнем сервере — под /skladron. Задаётся при сборке (BASE_PATH в
 * next.config.ts). Next сам дописывает его к ссылкам, маршрутам и своим
 * бандлам, но не к обычным fetch, <img src> и адресам, которые мы собираем
 * руками, — их ведём через withBase.
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

/** "/api/x" → "/skladron/api/x" (или как было, если игра в корне). */
export const withBase = (path: string) => `${BASE_PATH}${path}`;
