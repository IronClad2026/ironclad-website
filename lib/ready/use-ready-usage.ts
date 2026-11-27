"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { isReadyUsageUuid, type ReadyUsageChoice, type ReadyUsageInput, type ReadyUsageRequest } from "./usage-events";

const endpoint = "/api/ready/usage";
const browserKey = "ironclad:ready:usage-browser:v1";
const withdrawalKey = "ironclad:ready:usage-withdrawal:v1";
const choiceError = "Ready is still available. The analytics choice could not be saved. Please try again.";

type ActiveChoice = { epoch: string; browserId: string };

function readKey(key: string) {
  try { return sessionStorage.getItem(key); } catch { return null; }
}

function saveKey(key: string, value: string | null) {
  try {
    if (value) sessionStorage.setItem(key, value);
    else sessionStorage.removeItem(key);
  } catch {
    // Consent stays server-side when tab storage is unavailable.
  }
}

async function readChoice(response: Response): Promise<ReadyUsageChoice> {
  if (!response.ok) throw new Error("Unavailable");
  const data = await response.json() as Partial<ReadyUsageChoice>;
  if (data.enabled === false) return { enabled: false, epoch: null };
  if (data.enabled === true && isReadyUsageUuid(data.epoch)) return { enabled: true, epoch: data.epoch };
  throw new Error("Unavailable");
}

function post(input: ReadyUsageRequest, signal: AbortSignal, keepalive = false) {
  return fetch(endpoint, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
    cache: "no-store", signal, keepalive,
  });
}

export function useReadyUsage(signedIn: boolean) {
  const [enabled, setLocalEnabled] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [withdrawalPending, setWithdrawalPending] = useState(false);
  const current = useRef<ActiveChoice | null>(null);
  const change = useRef<AbortController | null>(null);
  const inFlight = useRef(new Set<AbortController>());
  const displays = useRef(new Map<string, Promise<boolean>>());

  const stop = useCallback(() => {
    current.current = null;
    for (const request of inFlight.current) request.abort();
    inFlight.current.clear();
    displays.current.clear();
  }, []);

  const accept = useCallback((choice: ReadyUsageChoice) => {
    if (!choice.enabled || !choice.epoch) {
      stop();
      setLocalEnabled(false);
      setWithdrawalPending(false);
      return;
    }
    if (readKey(withdrawalKey) === choice.epoch) {
      setError("Tracking is paused in this tab. Choose Turn off to retry saving withdrawal.");
      setWithdrawalPending(true);
      return;
    }
    const [epoch, saved] = readKey(browserKey)?.split(":") ?? [];
    const browserId = epoch === choice.epoch && isReadyUsageUuid(saved) ? saved : crypto.randomUUID();
    current.current = { epoch: choice.epoch, browserId };
    saveKey(browserKey, `${choice.epoch}:${browserId}`);
    setLocalEnabled(true);
  }, [stop]);

  useEffect(() => {
    if (!signedIn) return;
    const request = new AbortController();
    void fetch(endpoint, { cache: "no-store", signal: request.signal })
      .then(async (response) => {
        if (response.status === 403) return;
        const choice = await readChoice(response);
        if (request.signal.aborted) return;
        accept(choice);
        setLoaded(true);
      })
      .catch(() => {
        if (request.signal.aborted) return;
        setError("Ready analytics is unavailable.");
        setLoaded(true);
      });
    return () => {
      request.abort();
      change.current?.abort();
      stop();
    };
  }, [accept, signedIn, stop]);

  const setEnabled = useCallback(async (allow: boolean) => {
    if (!loaded || change.current) return;
    const request = new AbortController();
    change.current = request;
    setSaving(true);
    setError(null);
    if (!allow) {
      if (current.current) saveKey(withdrawalKey, current.current.epoch);
      stop();
      setLocalEnabled(false);
      setWithdrawalPending(true);
      saveKey(browserKey, null);
    }
    try {
      const choice = await post({ kind: "choice", enabled: allow }, request.signal).then(readChoice);
      if (request.signal.aborted) return;
      saveKey(withdrawalKey, null);
      accept(choice);
    } catch {
      if (!request.signal.aborted) setError(choiceError);
    } finally {
      if (change.current === request) change.current = null;
      if (!request.signal.aborted) setSaving(false);
    }
  }, [accept, loaded, stop]);

  const track = useCallback((event: ReadyUsageInput) => {
    const active = current.current;
    if (!active || inFlight.current.size >= 24) return;
    const payload: ReadyUsageRequest = { kind: "event", ...active, eventId: crypto.randomUUID(), event };
    const transmit = async (): Promise<boolean> => {
      if (current.current !== active || inFlight.current.size >= 24) return false;
      const request = new AbortController();
      inFlight.current.add(request);
      try {
        // One retry reuses the identifier and exists only in memory.
        for (let attempt = 0; attempt < 2 && current.current === active && !request.signal.aborted; attempt++) {
          const response = await post(payload, request.signal, true).catch(() => null);
          if (response?.ok) return true;
          if (response?.status === 403) {
            if (current.current === active) {
              stop();
              setLocalEnabled(false);
            }
            return false;
          }
          if (response && response.status < 500) return false;
        }
        return false;
      } finally {
        inFlight.current.delete(request);
      }
    };
    if (event.type === "answer_display") {
      if (displays.current.size >= 24) displays.current.delete(displays.current.keys().next().value!);
      displays.current.set(event.answerInstanceId, transmit());
    } else if (event.type === "helpfulness") {
      const displayed = displays.current.get(event.answerInstanceId);
      void displayed?.then((sent) => { if (sent) return transmit(); });
    } else {
      void transmit();
    }
  }, [stop]);

  return { enabled, loaded, saving, error, withdrawalPending, setEnabled, track };
}
