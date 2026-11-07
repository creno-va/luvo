import { useEffect, useRef, useState } from "react";

import { briefingContext, contextHash } from "@/lib/household";

import { localDate, type AppState, type HealthBriefing } from "@/lib/domain";

type Commit = (
  id: string,
  signature: string,
  briefing?: HealthBriefing,
  error?: string,
) => Promise<boolean>;
export function useHealthAnalysis(pet: AppState | null, onCommit: Commit) {
  const [day, setDay] = useState(localDate());
  const [retry, setRetry] = useState(0);
  const handledRetry = useRef(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hash, setHash] = useState("");
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const petRef = useRef(pet);
  petRef.current = pet;
  const signature = pet ? JSON.stringify(briefingContext(pet, day)) : "";
  useEffect(() => {
    const check = () => setDay(localDate());
    const interval = window.setInterval(check, 60000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  useEffect(() => {
    setHash("");
    setError("");
    setLoading(false);
    if (
      !petRef.current?.documents.length ||
      petRef.current.sample ||
      !petRef.current.analysisConsent
    )
      return;
    const petId = petRef.current.id;
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      const fingerprint = await contextHash(JSON.parse(signature));
      if (cancelled) return;
      setHash(fingerprint);
      const force = retry > handledRetry.current;
      handledRetry.current = retry;
      if (!force && petRef.current?.briefing?.contextHash === fingerprint)
        return;
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/briefings/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contextHash: fingerprint,
            context: JSON.parse(signature),
          }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (cancelled) return;
        if (!response.ok)
          throw new Error(data.error || "브리핑을 마치지 못했어요.");
        await commit.current(petId, signature, data as HealthBriefing);
      } catch (cause) {
        if (cancelled) return;
        const message =
          cause instanceof Error ? cause.message : "브리핑을 마치지 못했어요.";
        setError(message);
        await commit.current(petId, signature, undefined, message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 1600);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [signature, retry, pet?.id, pet?.analysisConsent]);
  return { loading, error, hash, refresh: () => setRetry((n) => n + 1) };
}
