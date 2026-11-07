import { ArrowUpRight, FileText } from "lucide-react";
import { carePlan, careReferences } from "@/lib/care-plan";
import type { AppState, DocumentRecord } from "@/lib/domain";
export function CarePreparation({
  pet,
  date,
  onDocument,
}: {
  pet: AppState;
  date: string;
  onDocument: (record: DocumentRecord) => void;
}) {
  const cards = carePlan(pet, date);
  return (
    <section className="care-preparation" aria-label="다음 변화를 위한 준비">
      <div className="section-top watch-heading">
        <h2>다음 변화를 위한 준비</h2>
        <span className="tiny-pill">기록에 맞춘 관리</span>
      </div>
      <p className="care-preparation-intro">
        {pet.profile.name}의 최근 기록을 바탕으로 지금 챙길 일을 정리했어요.
      </p>
      <ul className="personal-care-list">
        {cards.map((card) => (
          <li key={card.id}>
            <strong>{card.title}</strong>
            <ul className="personal-care-actions">
              {card.actions.map((action) => (
                <li key={action}>{action}</li>
              ))}
            </ul>
            {card.contact && (
              <p className="personal-care-contact">{card.contact}</p>
            )}
            <small>{card.reason}</small>
            <div className="care-guidance-sources">
              {card.sourceIds.map((id) => {
                const record = pet.documents.find((d) => d.id === id);
                return record ? (
                  <button key={id} onClick={() => onDocument(record)}>
                    <FileText size={12} />
                    {record.date}{" "}
                    {record.source === "manual" ? "직접 입력" : "진료 기록"}
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
          </li>
        ))}
      </ul>
    </section>
  );
}
