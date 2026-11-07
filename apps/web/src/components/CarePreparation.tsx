import { useState } from "react";
import { ArrowUpRight, FileText, House, Stethoscope, Eye } from "lucide-react";
import { carePlan, careReferences, type CareCard } from "@/lib/care-plan";
import type { AppState, DocumentRecord } from "@/lib/domain";

const categories = [
  { id: "all", label: "전체" },
  { id: "observe", label: "관찰할 점" },
  { id: "home", label: "집에서 관리" },
  { id: "vet", label: "병원 안내" },
] as const;
const labels = { observe: "관찰할 점", home: "집에서 관리", vet: "병원 안내" };
const icons = { observe: Eye, home: House, vet: Stethoscope };
export function CarePreparation({
  pet,
  date,
  onDocument,
}: {
  pet: AppState;
  date: string;
  onDocument: (record: DocumentRecord) => void;
}) {
  const [filter, setFilter] = useState<"all" | CareCard["category"]>("all");
  const cards = carePlan(pet, date);
  return (
    <section className="care-preparation" aria-label="다음 변화를 위한 준비">
      <div className="section-top watch-heading">
        <h2>다음 변화를 위한 준비</h2>
        <span className="tiny-pill">기록에 맞춘 관리</span>
      </div>
      <p className="care-preparation-intro">
        관찰할 점부터 집에서의 관리, 병원에 연락할 때까지.
        <br />
        기록이 바뀌면 필요한 안내도 함께 정리해요.
      </p>
      <div className="care-filters" aria-label="관리 안내 분류">
        {categories.map((item) => (
          <button
            key={item.id}
            aria-pressed={filter === item.id}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
            <span>
              {item.id === "all"
                ? cards.length
                : cards.filter((c) => c.category === item.id).length}
            </span>
          </button>
        ))}
      </div>
      <div className="care-guidance-list">
        {cards
          .filter((card) => filter === "all" || card.category === filter)
          .map((card) => {
            const Icon = icons[card.category];
            return (
              <article
                key={card.id}
                className={`care-guidance ${card.id === "emergency" ? "care-guidance-emergency" : ""}`}
              >
                <span className="care-guidance-icon">
                  <Icon size={18} />
                </span>
                <div className="care-guidance-body">
                  <span className="care-guidance-category">
                    {labels[card.category]}
                    {!card.sourceIds.length ? " · 일반 안내" : ""}
                  </span>
                  <h3>{card.title}</h3>
                  <p className="care-guidance-reason">{card.reason}</p>
                  <ul>
                    {card.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                  {card.contact && (
                    <p className="care-contact">
                      <Stethoscope size={14} />
                      <span>{card.contact}</span>
                    </p>
                  )}
                  <div className="care-guidance-sources">
                    {card.sourceIds.map((id) => {
                      const record = pet.documents.find((d) => d.id === id);
                      return record ? (
                        <button key={id} onClick={() => onDocument(record)}>
                          <FileText size={12} />
                          {record.date}{" "}
                          {record.source === "manual"
                            ? "직접 입력"
                            : "진료 기록"}
                          <ArrowUpRight size={12} />
                        </button>
                      ) : null;
                    })}
                  </div>
                  <div className="reference-row">
                    {card.referenceIds.map((id) => (
                      <a
                        key={id}
                        href={careReferences[id].url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {careReferences[id].title} ↗
                      </a>
                    ))}
                  </div>
                </div>
              </article>
            );
          })}
      </div>
      <p className="briefing-note">
        기록에 맞춰 고른 일반 관리 안내예요. 현재 상태에 대한 진단이나 새로운
        처방은 담당 수의사와 확인해요.
      </p>
    </section>
  );
}
