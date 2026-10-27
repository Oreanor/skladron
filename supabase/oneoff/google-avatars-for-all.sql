-- Разово: всем, у кого в Google-аккаунте есть фото, ставим его аватаром.
-- Кто захочет другое — сменит в окне аватара, а кнопка «Фото из Google»
-- там же вернёт это обратно. Свои загруженные картинки остаются в
-- хранилище и перезапишутся при следующей загрузке.
--
-- Сначала выполнить patches/47-google-avatar.sql (там google_avatar).
-- Выполнять один раз: повторный запуск снова сбросит всем выбранное.

update profiles p
   set avatar = google_avatar(p.id)
 where google_avatar(p.id) is not null
   and p.avatar is distinct from google_avatar(p.id)
returning p.display_name, p.avatar;
