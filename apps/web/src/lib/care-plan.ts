import { isPrescribed, localDate, type AppState } from "./domain.ts";

export const careReferences = {
  routine: {
    title: "Merck · 반려견 건강 관찰과 생활 관리",
    url: "https://www.merckvetmanual.com/dog-owners/routine-care-of-dogs/routine-health-care-of-dogs",
  },
  vomiting: {
    title: "Merck · 구토 시 확인할 점",
    url: "https://www.merckvetmanual.com/dog-owners/digestive-disorders-of-dogs/vomiting-in-dogs",
  },
  medication: {
    title: "FDA · 반려동물 약 사용 전 확인",
    url: "https://www.fda.gov/animal-veterinary/animal-health-literacy/get-facts-about-pain-relievers-pets",
  },
  mobility: {
    title: "AAHA · 통증이 있는 반려동물의 생활환경",
    url: "https://www.aaha.org/resources/2023-aaha-senior-care-guidelines-for-dogs-and-cats/pain-management/",
  },
  bathing: {
    title: "Virginia Tech 동물병원 · 안전한 목욕 관리",
    url: "https://vth.vetmed.vt.edu/animal-care-tips/bathing-tips.html",
  },
  emergency: {
    title: "Merck · 응급 진료 안내",
    url: "https://www.merckvetmanual.com/special-pet-topics/emergencies/evaluation-and-initial-treatment-of-dog-and-cat-emergencies",
  },
};
export type CareCard = {
  id: string;
  category: "observe" | "home" | "vet";
  title: string;
  reason: string;
  actions: string[];
  contact?: string;
  sourceIds: string[];
  referenceIds: (keyof typeof careReferences)[];
};

// Curated care guidance stays available while AI is pending or unavailable.
// Record matches explain relevance, never establish a current symptom or diagnosis.
export function carePlan(pet: AppState, date = localDate()): CareCard[] {
  if (pet.sample) return [];
  const records = pet.documents
    .filter((d) => d.date <= date)
    .toSorted(
      (a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id),
    );
  const latest = records[0];
  const recent = records.filter(
    (d) =>
      d.date >=
      new Date(new Date(`${date}T12:00:00Z`).getTime() - 30 * 86400000)
        .toISOString()
        .slice(0, 10),
  );
  const topic = (pattern: RegExp) =>
    recent.filter((d) => {
      const text = [
        d.diagnosis,
        d.summary,
        ...(d.conditions || [])
          .filter((c) => c.status !== "resolved")
          .map((c) => c.name + " " + c.note),
      ].join(" ");
      const positive = text.replace(
        /(?:구토|설사|기침|가려움|절뚝거림|호흡\s*곤란)(?:은|는|이|가|도)?\s*(?:없(?:음|어요|다)?|안\s*(?:함|해요)|하지\s*않(?:음|아요))|(?:no|without|denies)\s+(?:vomiting|diarrhea|cough(?:ing)?)/gi,
        "",
      );
      return pattern.test(positive);
    });
  const why = (matches: typeof records) =>
    `${matches[0].date} ${matches[0].source === "manual" ? "보호자 메모" : "진료 기록"}에 관련 내용이 있어요. 지금도 같은 변화가 있는지 살펴보세요.`;
  const cards: CareCard[] = [];
  const digestive = topic(/구토|설사|vomit|diarrh/i);
  if (digestive.length)
    cards.push({
      id: "digestive",
      category: "observe",
      title: "구토·배변 변화를 구체적으로 남겨요",
      reason: why(digestive),
      actions: [
        "언제 시작됐는지, 반복 횟수와 식사·물 섭취의 변화를 함께 메모해요.",
        "토한 내용물·변의 상태를 사진으로 남기고, 새로 먹은 음식이나 약이 있는지 정리해요.",
      ],
      contact:
        "구토가 반복되거나 피·복통·기력 저하가 함께 보이면 병원에 바로 연락해요. 물이나 음식 제한은 임의로 정하지 말고 수의사의 안내를 확인해요.",
      sourceIds: digestive.slice(0, 3).map((d) => d.id),
      referenceIds: ["vomiting"],
    });
  const breathing = topic(/기침|호흡|심장|승모판|cough|breath|heart|mitral/i);
  if (breathing.length)
    cards.push({
      id: "breathing",
      category: "observe",
      title: "기침·호흡이 평소와 다른지 살펴요",
      reason: why(breathing),
      actions: [
        "기침이 생기는 상황과 활동량의 변화를 메모하고, 증상이 보이면 가능한 범위에서 영상을 남겨요.",
        "이전 검사 결과와 현재 약 목록을 함께 준비해 담당 병원에 변화를 설명해요.",
      ],
      contact:
        "지금 호흡이 힘들거나 의식이 떨어지면 관찰을 이어가기보다 즉시 응급 동물병원에 연락해요.",
      sourceIds: breathing.slice(0, 3).map((d) => d.id),
      referenceIds: ["routine", "emergency"],
    });
  const skin = topic(/피부|가려|긁|skin|itch/i);
  const mobility = topic(/관절|절뚝|다리|보행|joint|limp/i);
  const visible = skin.length ? skin : mobility;
  if (visible.length && cards.length < 2)
    cards.push({
      id: skin.length ? "skin" : "mobility",
      category: "observe",
      title: skin.length
        ? "피부·긁는 행동의 변화를 비교해요"
        : "걷는 모습과 활동 변화를 비교해요",
      reason: why(visible),
      actions: skin.length
        ? [
            "붉은 부위·털 빠짐·긁는 위치를 사진과 메모로 남겨요.",
            "평소보다 자주 긁는지, 다른 부위에도 변화가 생기는지 함께 확인해요.",
          ]
        : [
            "절뚝이는 시점과 다리에 체중을 싣는 모습을 영상으로 남겨요.",
            "움직이기 싫어하거나 평소 활동이 달라졌는지 메모해 병원에 보여주세요.",
          ],
      contact:
        "변화가 계속되거나 심해지면 담당 병원에 연락해 진료 시점을 확인해요.",
      sourceIds: visible.slice(0, 3).map((d) => d.id),
      referenceIds: ["routine"],
    });
  if (!cards.length)
    cards.push({
      id: "daily",
      category: "observe",
      title: "식사·배변·활동을 평소와 비교해요",
      reason: latest
        ? `${latest.date} ${latest.source === "manual" ? "직접 입력한 메모" : "진료 기록"} 이후의 변화를 이어서 남길 수 있어요. 메모만으로 건강 상태를 확정하지 않아요.`
        : "아직 건강 기록이 적어요. 평소 모습을 남기면 다음 진료에서 변화를 설명하기 좋아요.",
      actions: [
        "먹는 양, 소변·변, 기침·구토 여부와 활동이 평소와 다른지 짧게 적어요.",
        "달라진 모습은 시작 시점과 함께 사진이나 영상으로 남겨요.",
      ],
      contact:
        "변화가 지속되거나 심해지면 담당 병원에 증상을 설명하고 진료 시점을 확인해요.",
      sourceIds: latest ? [latest.id] : [],
      referenceIds: ["routine"],
    });
  if (mobility.length)
    cards.push({
      id: "mobility-home",
      category: "home",
      title: "미끄럽지 않은 이동 환경을 마련해요",
      reason: why(mobility),
      actions: [
        "자주 다니는 바닥에 밀리지 않는 매트나 러그를 두어 발이 미끄러지지 않게 해요.",
        "평소 쉬는 공간에 안전하게 접근할 수 있게 정리하고, 경사로나 보조 도구가 필요한지는 담당 병원에 확인해요.",
      ],
      sourceIds: mobility.slice(0, 3).map((d) => d.id),
      referenceIds: ["mobility"],
    });
  else if (skin.length)
    cards.push({
      id: "skin-home",
      category: "home",
      title: "피부가 예민할 때 목욕부터 확인해요",
      reason: why(skin),
      actions: [
        "염증·상처가 있거나 만질 때 불편해하면 목욕을 미루고 담당 병원에 먼저 연락해요.",
        "처방받은 약용 목욕은 병원의 지시대로 하고, 새 샴푸·민간요법을 임의로 추가하지 않아요.",
      ],
      sourceIds: skin.slice(0, 3).map((d) => d.id),
      referenceIds: ["bathing"],
    });
  else
    cards.push({
      id: "home",
      category: "home",
      title: "집에서는 안전한 환경과 기존 관리부터",
      reason:
        "기록만으로 새로운 치료나 식이요법을 정할 수는 없어요. 집에서 할 관리도 기존 진료 안내를 기준으로 확인해요.",
      actions: [
        "쓰레기·약·해로운 음식에 닿지 않도록 생활 공간을 정리해요.",
        "금식·새 식단·영양제·민간요법을 시작하기 전에는 현재 질환과 약에 맞는지 병원에 확인해요.",
      ],
      sourceIds: latest ? [latest.id] : [],
      referenceIds: ["routine", "medication"],
    });
  if (pet.medications.length) {
    const current = pet.medications.filter((m) => isPrescribed(m, date));
    cards.push({
      id: "medicine",
      category: "home",
      title: "약을 추가하기 전에 먼저 확인해요",
      reason: current.length
        ? `현재 날짜에 해당하는 처방 이력이 있어요. 복용을 쉬는 약과 함께 먹는 제품도 병원에 알려주세요.`
        : "이전에 기록한 처방약이 있어요. 남은 약이 지금 상태에 맞는지는 별도로 확인해야 해요.",
      actions: [
        "현재 약 이름과 용량, 쉬는 기간, 실제 투약 체크를 정리해요. 미체크는 미복용으로 단정하지 않아요.",
        "사람용 진통제나 다른 강아지의 남은 약을 임의로 먹이지 말고 수의사에게 확인해요.",
      ],
      sourceIds: [
        ...new Set(
          pet.medications.flatMap((m) => m.revisions.map((r) => r.documentId)),
        ),
      ]
        .filter((id) => records.some((d) => d.id === id))
        .slice(0, 3),
      referenceIds: ["medication", "routine"],
    });
  }
  cards.push({
    id: "visit",
    category: "vet",
    title: "병원에 연락할 때 이 내용을 준비해요",
    reason: latest
      ? `가장 최근 기록은 ${latest.date}이에요. 이후 달라진 점과 기존 진료 내용을 함께 설명해요.`
      : "최근 상태와 기존 진료 내용을 한곳에 정리해 상담에 활용해요.",
    actions: [
      "증상 시작 시점·반복 횟수, 사진·영상, 진단서·검사 결과와 복용약 목록을 준비해요.",
      "담당 병원에 현재 변화를 설명하고 재진 시점과 집에서 관찰할 기준을 확인해요.",
    ],
    sourceIds: latest ? [latest.id] : [],
    referenceIds: ["emergency", "routine"],
  });
  cards.push({
    id: "emergency",
    category: "vet",
    title: "이런 모습이 지금 보이면 즉시 연락해요",
    reason:
      "아래는 모든 강아지에게 해당하는 일반 응급 기준이에요. 이 아이에게 현재 발생했다는 뜻은 아니에요.",
    actions: [
      "호흡이 힘듦, 의식 저하, 멈추지 않는 경련이 지금 나타나면 응급 동물병원에 즉시 연락해요.",
      "주치의가 진료 중이 아니면 가까운 응급 동물병원에 진료 가능 여부를 먼저 확인해요.",
    ],
    sourceIds: [],
    referenceIds: ["emergency"],
  });
  return cards;
}
