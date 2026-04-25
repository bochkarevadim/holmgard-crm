-- ============================================================
-- ЗАЩИТА event_instructors / event_admins ОТ СЛУЧАЙНОГО УДАЛЕНИЯ
-- Применить через Supabase Dashboard → SQL Editor
-- ============================================================

-- Функция-триггер: после удаления строки из event_instructors
-- или event_admins, если у события уже есть shift_event_bonuses,
-- сразу возвращает удалённую строку обратно.
-- Это защищает прошлые события (у которых уже посчитаны бонусы)
-- от случайного wipe кодом без ON CONFLICT DO NOTHING.

CREATE OR REPLACE FUNCTION protect_event_staff_fn()
RETURNS TRIGGER AS $$
BEGIN
  -- Проверяем: есть ли у события уже начисленные бонусы?
  IF EXISTS (
    SELECT 1 FROM shift_event_bonuses
    WHERE event_id = OLD.event_id
  ) THEN
    -- Событие завершено и бонусы начислены — восстанавливаем строку
    IF TG_TABLE_NAME = 'event_instructors' THEN
      INSERT INTO event_instructors (event_id, employee_id)
      VALUES (OLD.event_id, OLD.employee_id)
      ON CONFLICT (event_id, employee_id) DO NOTHING;
    ELSE
      INSERT INTO event_admins (event_id, employee_id)
      VALUES (OLD.event_id, OLD.employee_id)
      ON CONFLICT (event_id, employee_id) DO NOTHING;
    END IF;
  END IF;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Удаляем старые триггеры если есть
DROP TRIGGER IF EXISTS protect_event_instructors_trigger ON event_instructors;
DROP TRIGGER IF EXISTS protect_event_admins_trigger ON event_admins;

-- Создаём триггеры
CREATE TRIGGER protect_event_instructors_trigger
  AFTER DELETE ON event_instructors
  FOR EACH ROW EXECUTE FUNCTION protect_event_staff_fn();

CREATE TRIGGER protect_event_admins_trigger
  AFTER DELETE ON event_admins
  FOR EACH ROW EXECUTE FUNCTION protect_event_staff_fn();

-- Проверка:
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers
WHERE trigger_name IN ('protect_event_instructors_trigger', 'protect_event_admins_trigger');
