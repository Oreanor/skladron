"use client";

/*
 * Пробный налёт на свой склад. Панель та же, что и у настоящего налёта, но
 * складом и кошельком он не ограничен: это песочница, чтобы посмотреть, как
 * выглядит волна на своей карте.
 */

import { useState } from "react";
import { raidTotal, type WavePlan } from "@/lib/attack";
import RaidPlanner, { newWave } from "../RaidPlanner";
import { Button, Modal } from "../ui";
import { useT } from "@/lib/i18n";
import { TEST_RAID_MAX } from "./limits";

export default function TestRaidDialog({
  initial,
  level,
  onCancel,
  onSend,
}: {
  /** Сколько дронов предложить с ходу: рой под нынешнюю оборону. */
  initial: number;
  /** Свой уровень дронов — от него и пляшем. */
  level: number;
  onCancel: () => void;
  onSend: (waves: WavePlan[], droneLevel: number) => string | null;
}) {
  const t = useT();
  const [waves, setWaves] = useState<WavePlan[]>(() => [newWave(initial)]);
  const [droneLevel, setDroneLevel] = useState(level);
  const [error, setError] = useState<string | null>(null);
  const total = raidTotal(waves);

  return (
    <Modal
      title={t("raid.testTitle")}
      subtitle={t("raid.testSubtitle")}
      onClose={onCancel}
      footer={
        <div className="flex gap-2">
          <Button
            variant="danger"
            className="flex-1"
            disabled={total < 1}
            onClick={() => setError(onSend(waves, droneLevel))}
          >
            {t("raid.testSend")}
          </Button>
          <Button onClick={onCancel}>{t("common.cancel")}</Button>
        </div>
      }
    >
      <RaidPlanner
        waves={waves}
        onChange={setWaves}
        stock={TEST_RAID_MAX}
        max={TEST_RAID_MAX}
        unitCost={0}
        free
        droneLevel={droneLevel}
        onDroneLevel={setDroneLevel}
      />
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Modal>
  );
}
