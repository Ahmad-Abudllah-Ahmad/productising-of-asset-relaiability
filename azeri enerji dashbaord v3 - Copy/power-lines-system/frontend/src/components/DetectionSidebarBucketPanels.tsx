import React from "react";
import { formatDetectionSidebarLabel, type DetectionSidebarPartition } from "../utils/detectionSidebarBuckets";
import { useLanguage } from "../context/LanguageContext";

export function DetectionSidebarBucketPanels({
  partition,
  hideRowCounts = false,
}: {
  partition: DetectionSidebarPartition;
  hideRowCounts?: boolean;
}) {
  const { t, language } = useLanguage();
  const { components, defects } = partition;
  const rowCls = "flex items-center justify-between gap-2 py-1 text-xs";
  const colHead = "text-xs font-semibold dash-text-body mb-1.5";
  const emptyNote = "text-xs dash-text-muted py-0.5";

  const renderRows = (
    items: typeof components,
    prefix: "c" | "d",
    labelClass: string
  ) =>
    items.length === 0 ? (
      <div className={emptyNote}>—</div>
    ) : (
      <div className="space-y-1">
        {items.map(({ key, count }) => (
          <div key={`${prefix}-${key}`} className={rowCls}>
            <span className={`min-w-0 truncate font-medium ${labelClass}`} title={formatDetectionSidebarLabel(key, language)}>
              {formatDetectionSidebarLabel(key, language)}
            </span>
            {!hideRowCounts && (
              <span className="shrink-0 dash-text-muted font-semibold tabular-nums">{count}</span>
            )}
          </div>
        ))}
      </div>
    );

  return (
    <div className="shrink-0 border-b border-[var(--dash-panel-border)] p-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="min-w-0 border-r border-[var(--dash-panel-border)] pr-3">
          <div className={colHead}>{t("detectionSidebar.components")}</div>
          {renderRows(components, "c", "text-emerald-500")}
        </div>
        <div className="min-w-0">
          <div className={colHead}>{t("detectionSidebar.defects")}</div>
          {renderRows(defects, "d", "text-red-500")}
        </div>
      </div>
    </div>
  );
}
