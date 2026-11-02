// Public demo (#/demo): the sample TaxStreem video playing in the real renderer, no sign-in.
import { useEffect, useMemo, useRef, useState } from "react";
import { Playback } from "../lib/audio";
import { Renderer, type Loaded } from "../lib/renderer";
import type { Format, VideoSpec } from "../runtime/types";
import { Player } from "./Player";

export function Demo() {
  const renderer = useMemo(() => new Renderer(), []);
  const playback = useMemo(() => new Playback(), []);
  const tRef = useRef(0);
  const [spec, setSpec] = useState<VideoSpec | null>(null);
  const [format, setFormat] = useState<Format>("9:16");
  const [info, setInfo] = useState<Loaded | null>(null);
  const [exp, setExp] = useState<string>("");
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      const s = (await (await fetch("/demo/spec.json")).json()) as VideoSpec;
      const bmp = await createImageBitmap(await (await fetch("/demo/dashboard.png")).blob());
      renderer.sendImages({ "demo-dashboard": bmp });
      setSpec(s);
    })();
    return () => renderer.destroy();
  }, [renderer]);
  useEffect(() => {
    if (spec) renderer.load(spec, format, { t: tRef.current, scale: 0.7 }).then(setInfo, () => {});
  }, [spec, format, renderer]);
  const run = async () => {
    setUrl(null);
    const job = renderer.export(format, null, (p) => setExp(`Rendering ${Math.round(p * 100)}%`));
    try {
      const out = await job.promise;
      setUrl(URL.createObjectURL(new Blob([out.buffer], { type: out.mime })));
      setExp(`Done · ${(out.buffer.byteLength / 1e6).toFixed(1)} MB ${out.ext.toUpperCase()}`);
    } catch (e) {
      setExp((e as Error).message);
    }
  };
  return (
    <div className="studio">
      <header className="topbar">
        <a href="#/" className="brand"><img src="/brand/icon-brand.svg" alt="" /><span>Motion · demo</span></a>
        <div className="topbar-mid">
          <div className="seg-ctl">
            {(["9:16", "1:1", "16:9"] as Format[]).map((f) => (
              <button key={f} className={format === f ? "on" : ""} onClick={() => setFormat(f)}>{f}</button>
            ))}
          </div>
          <button className="btn small" onClick={run} id="demo-export">Export MP4</button>
          <span className="small muted" id="demo-status">{exp}</span>
          {url && <a className="btn small" href={url} download={`taxstreem-demo-${format.replace(":", "x")}.mp4`}>Download</a>}
        </div>
      </header>
      <section className="stage">
        <Player renderer={renderer} duration={info?.duration ?? 0} timings={info?.timings ?? []} format={format} playback={playback} tRef={tRef} />
      </section>
    </div>
  );
}
