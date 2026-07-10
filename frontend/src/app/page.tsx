"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4600";

type Platform = "youtube" | "tiktok" | "instagram";
type Status = "processing" | "completed" | "failed";
type Source = "captions" | "whisper" | null;

interface Transcript {
  id: number;
  url: string;
  platform: Platform;
  title: string | null;
  status: Status;
  source: Source;
  text: string | null;
  error: string | null;
  durationSeconds: number | null;
  createdAt: string;
  updatedAt: string;
}

const PLATFORM_LABEL: Record<Platform, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  instagram: "Instagram",
};

function formatDuration(seconds: number | null): string | null {
  if (seconds == null) return null;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function toParagraphs(text: string): string[] {
  const blocks = text
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  if (blocks.length > 1) return blocks;
  const sentences = text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?…])\s+/);
  const paragraphs: string[] = [];
  for (let i = 0; i < sentences.length; i += 5) {
    paragraphs.push(sentences.slice(i, i + 5).join(" "));
  }
  return paragraphs.filter(Boolean);
}

function stageLine(platform: Platform, elapsed: number): string {
  if (elapsed < 4) return "Reaching the video…";
  if (platform === "youtube") {
    return elapsed < 14 ? "Pulling captions…" : "Setting the type…";
  }
  return elapsed < 20 ? "Listening to the audio…" : "Writing it all down…";
}

export default function Home() {
  const [url, setUrl] = useState("");
  const [current, setCurrent] = useState<Transcript | null>(null);
  const [history, setHistory] = useState<Transcript[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch(`${API}/transcripts`);
      if (res.ok) setHistory(await res.json());
    } catch {
      // API not reachable — history stays empty.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/transcripts`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((rows: Transcript[]) => {
        if (!cancelled) setHistory(rows);
      })
      .catch(() => {
        // API not reachable — history stays empty.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!current || current.status !== "processing") return;
    const started = Date.now();
    const clock = setInterval(
      () => setElapsed(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`${API}/transcripts/${current.id}`);
        if (!res.ok) return;
        const next: Transcript = await res.json();
        if (next.status !== "processing") {
          setCurrent(next);
          loadHistory();
        }
      } catch {
        // Keep polling; the API may come back.
      }
    }, 1500);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [current, loadHistory]);

  useEffect(() => {
    return () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    };
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) return;
    setSubmitError(null);
    setCopied(false);
    try {
      const res = await fetch(`${API}/transcripts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = Array.isArray(data?.message)
          ? data.message.join(" ")
          : data?.message;
        setSubmitError(
          typeof message === "string" && message
            ? message
            : "That link did not take. Check it and try again."
        );
        return;
      }
      setElapsed(0);
      setCurrent(data);
      setUrl("");
      loadHistory();
    } catch {
      setSubmitError(
        "The Clipscript API is not answering. Start the backend on port 4600 and try again."
      );
    }
  }

  async function copyTranscript() {
    if (!current?.text) return;
    await navigator.clipboard.writeText(current.text);
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }

  async function removeItem(id: number) {
    try {
      await fetch(`${API}/transcripts/${id}`, { method: "DELETE" });
      setHistory((h) => h.filter((t) => t.id !== id));
      if (current?.id === id) setCurrent(null);
    } catch {
      // Leave the row; a refresh will reconcile.
    }
  }

  function openItem(item: Transcript) {
    setSubmitError(null);
    setCopied(false);
    setElapsed(0);
    setCurrent(item);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  const words = current?.text ? current.text.trim().split(/\s+/).length : 0;
  const readingMinutes = Math.max(1, Math.round(words / 220));

  return (
    <div className="mx-auto max-w-2xl px-6 pb-24 pt-16 sm:px-10 sm:pt-24">
      <header>
        <h1 className="font-display text-5xl font-semibold leading-none tracking-tight sm:text-6xl">
          Clipscript
        </h1>
        <p className="mt-3 font-serif text-lg italic text-ink-soft">
          Every word, lifted from the video.
        </p>
      </header>

      <form onSubmit={submit} className="mt-14">
        <label htmlFor="url" className="micro block text-ink-faint">
          Paste a video link
        </label>
        <div className="mt-3 flex items-baseline gap-4 border-b border-ink/40 pb-3">
          <input
            id="url"
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=…"
            spellCheck={false}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent font-display text-xl outline-none placeholder:text-ink-faint/70 sm:text-2xl"
          />
          <button
            type="submit"
            className="micro shrink-0 cursor-pointer text-ink-soft transition-colors hover:text-vermillion"
          >
            Transcribe
          </button>
        </div>
        {submitError && (
          <p className="mt-4 font-serif italic text-vermillion">
            — {submitError}
          </p>
        )}
      </form>

      <main className="mt-16">
        {!current && (
          <section className="reveal">
            <p className="micro text-ink-faint">Takes links from</p>
            <ul className="mt-4 space-y-3 border-l border-rule pl-5">
              <li>
                <span className="font-display font-medium">YouTube</span>{" "}
                <span className="font-serif italic text-ink-faint">
                  — youtube.com/watch?v=… , youtu.be/… , shorts
                </span>
              </li>
              <li>
                <span className="font-display font-medium">TikTok</span>{" "}
                <span className="font-serif italic text-ink-faint">
                  — tiktok.com/@name/video/…
                </span>
              </li>
              <li>
                <span className="font-display font-medium">Instagram</span>{" "}
                <span className="font-serif italic text-ink-faint">
                  — instagram.com/reel/…
                </span>
              </li>
            </ul>
          </section>
        )}

        {current?.status === "processing" && (
          <p className="breathe font-serif text-lg italic text-ink-soft">
            {stageLine(current.platform, elapsed)}
            <span className="cursor-blink not-italic">▍</span>
          </p>
        )}

        {current?.status === "failed" && (
          <article key={current.id} className="reveal">
            <p className="micro text-ink-faint">
              {PLATFORM_LABEL[current.platform]} · editor&apos;s note
            </p>
            <p className="mt-4 max-w-[65ch] font-serif text-lg italic leading-relaxed text-vermillion">
              {current.error ??
                "Something went wrong with this one, and the video kept its words."}
            </p>
            <p className="mt-3 break-all font-serif text-sm text-ink-faint">
              {current.url}
            </p>
          </article>
        )}

        {current?.status === "completed" && current.text && (
          <article key={current.id}>
            <h2
              className="reveal font-display text-3xl font-medium leading-tight sm:text-4xl"
              style={{ animationDelay: "0ms" }}
            >
              {current.title ?? current.url}
            </h2>
            <div
              className="reveal mt-4 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-rule pb-4"
              style={{ animationDelay: "80ms" }}
            >
              <span className="micro text-ink-faint">
                {[
                  PLATFORM_LABEL[current.platform],
                  formatDuration(current.durationSeconds),
                  `${words.toLocaleString()} words`,
                  `~${readingMinutes} min read`,
                  current.source === "captions"
                    ? "source: captions"
                    : current.source === "whisper"
                      ? "source: audio"
                      : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <button
                type="button"
                onClick={copyTranscript}
                className={`micro cursor-pointer transition-colors ${
                  copied
                    ? "text-vermillion"
                    : "text-ink-soft hover:text-vermillion"
                }`}
              >
                {copied ? "Copied" : "Copy transcript"}
              </button>
            </div>
            <div className="mt-8 max-w-[65ch] space-y-6">
              {toParagraphs(current.text).map((paragraph, i) => (
                <p
                  key={i}
                  className="reveal font-serif text-[1.125rem] leading-[1.7]"
                  style={{ animationDelay: `${160 + Math.min(i, 8) * 70}ms` }}
                >
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        )}
      </main>

      {history.length > 0 && (
        <aside className="mt-20">
          <h2 className="micro border-b border-rule pb-3 text-ink-faint">
            Previously
          </h2>
          <ul>
            {history.map((item) => (
              <li
                key={item.id}
                className="group flex items-baseline gap-3 border-b border-rule/60 py-3"
              >
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="min-w-0 flex-1 cursor-pointer text-left"
                >
                  <span className="block truncate font-serif text-base transition-colors group-hover:text-vermillion">
                    {item.title ?? item.url}
                  </span>
                  <span className="micro mt-1 block text-ink-faint">
                    {PLATFORM_LABEL[item.platform]} ·{" "}
                    {formatDate(item.createdAt)}
                    {item.status !== "completed" ? ` · ${item.status}` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  aria-label={`Delete ${item.title ?? item.url}`}
                  className="cursor-pointer text-ink-faint opacity-0 transition-opacity hover:text-vermillion focus-visible:opacity-100 group-hover:opacity-100"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </div>
  );
}
