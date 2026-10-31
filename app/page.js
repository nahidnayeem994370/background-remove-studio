"use client";

import { useEffect, useRef, useState } from "react";

const tools = [
  { id: "remove", title: "Background Remove", description: "Remove image backgrounds automatically with AI.", icon: "✂", tag: "AI POWERED" },
  { id: "change", title: "Background Changer", description: "Replace the background with a color you love.", icon: "◐", tag: "CREATIVE" },
  { id: "resize", title: "Image Resize", description: "Set the exact dimensions for any platform.", icon: "↗", tag: "PRECISE" },
  { id: "compress", title: "Image Compress", description: "Reduce image file size while keeping it clear.", icon: "⇣", tag: "LIGHTWEIGHT" },
];

export default function Home() {
  const [active, setActive] = useState("remove");
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(800);
  const [quality, setQuality] = useState(80);
  const [bg, setBg] = useState("#eaf3ff");
  const [keepRatio, setKeepRatio] = useState(true);
  const inputRef = useRef(null);
  const imageRef = useRef(null);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
    if (result) URL.revokeObjectURL(result);
  }, [preview, result]);

  function chooseFile(f) {
    if (!f) return;
    if (!f.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (f.size > 20 * 1024 * 1024) { setError("Please choose an image smaller than 20 MB."); return; }
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult("");
    setError("");
    setProgress("");
    const img = new Image();
    img.onload = () => { setWidth(img.naturalWidth); setHeight(img.naturalHeight); };
    img.src = URL.createObjectURL(f);
  }

  function selectTool(id) {
    setActive(id);
    setResult("");
    setError("");
    setProgress("");
  }

  function canvasFromImage() {
    return new Promise((resolve, reject) => {
      const img = imageRef.current;
      if (!img) return reject(new Error("Please upload an image first."));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Number(width));
      canvas.height = Math.max(1, Number(height));
      const ctx = canvas.getContext("2d");
      if (active === "change") {
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not process this image.")), "image/png");
    });
  }

  async function processImage() {
    if (!file) { setError("Upload an image to get started."); return; }
    setBusy(true); setError(""); setResult(""); setProgress("Preparing your image...");
    try {
      let blob;
      if (active === "remove") {
        setProgress("Loading the AI model. The first run may take a little longer...");
        const { removeBackground } = await import("@imgly/background-removal");
        blob = await removeBackground(file, {
          progress: (key, current, total) => {
            if (total) setProgress("Removing background: " + Math.round(current / total * 100) + "%");
          }
        });
      } else if (active === "compress") {
        const img = imageRef.current;
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext("2d").drawImage(img, 0, 0);
        blob = await new Promise(resolve => canvas.toBlob(resolve, "image/jpeg", Number(quality) / 100));
      } else {
        blob = await canvasFromImage();
      }
      if (!blob) throw new Error("Image processing failed. Please try another image.");
      setResult(URL.createObjectURL(blob));
      setProgress("Your image is ready!");
    } catch (e) {
      setError(e?.message || "Something went wrong. Please try again.");
      setProgress("");
    } finally { setBusy(false); }
  }

  function downloadResult() {
    if (!result) return;
    const a = document.createElement("a");
    a.href = result;
    a.download = "background-remove-studio-" + active + (active === "remove" ? ".png" : active === "compress" ? ".jpg" : ".png");
    document.body.appendChild(a); a.click(); a.remove();
  }

  const current = tools.find(t => t.id === active);
  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-mark">B</span><span>Background Remove <b>Studio</b></span></a>
        <nav><a href="#tools">Tools</a><a href="#how">How it works</a><a className="nav-cta" href="#editor">Try it free <span>↗</span></a></nav>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span className="spark">✦</span> YOUR FREE ONLINE IMAGE STUDIO</div>
          <h1>Make every image<br/><span>stand out.</span></h1>
          <p>Powerful image tools, made simple. Remove backgrounds, create clean visuals, resize and compress — all in one place.</p>
          <a className="primary-btn" href="#editor">Start creating for free <span>→</span></a>
          <div className="trust"><span>✓</span> No sign-up <i/> <span>✓</span> Free to use <i/> <span>✓</span> No paid API</div>
        </div>
        <div className="hero-art" aria-label="Image editing preview">
          <div className="art-glow"/>
          <div className="art-card back-card"><div className="mini-label">BEFORE</div><div className="sample-person">✿</div></div>
          <div className="art-card front-card"><div className="mini-label">AFTER</div><div className="checker"><div className="cutout">✿</div></div><div className="success-dot">✓</div></div>
          <div className="float-chip"><span>✦</span> Background removed</div>
        </div>
      </section>

      <section className="tools-section" id="tools">
        <div className="section-heading"><div><div className="eyebrow">ALL THE TOOLS YOU NEED</div><h2>One studio. Four smart tools.</h2></div><p>Everything you need to make your images<br className="desktop"/> look their best.</p></div>
        <div className="tool-grid">
          {tools.map((tool, i) => <button key={tool.id} className={"tool-card " + (active === tool.id ? "selected" : "")} onClick={() => {selectTool(tool.id); document.getElementById("editor")?.scrollIntoView({behavior:"smooth"});}}>
            <div className={"tool-icon icon-" + tool.id}>{tool.icon}</div><div className="tool-tag">{tool.tag}</div><h3>{tool.title}</h3><p>{tool.description}</p><span className="tool-link">Use tool <b>→</b></span>
          </button>)}
        </div>
      </section>

      <section className="editor-section" id="editor">
        <div className="editor-heading"><div className="eyebrow">LET'S CREATE SOMETHING</div><h2>{current.title}</h2><p>{current.description}</p></div>
        <div className="editor">
          <div className="editor-tabs">{tools.map(t => <button key={t.id} className={active===t.id?"tab active":"tab"} onClick={()=>selectTool(t.id)}>{t.title}</button>)}</div>
          <div className="work-area">
            <div className="upload-panel">
              <input ref={inputRef} type="file" accept="image/*" hidden onChange={e=>chooseFile(e.target.files?.[0])}/>
              <div className={"dropzone " + (file?"has-file":"")} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();chooseFile(e.dataTransfer.files?.[0]);}}>
                {preview ? <><img ref={imageRef} src={preview} alt="Uploaded preview"/><div className="file-name">{file?.name}</div><button className="change-file" onClick={()=>inputRef.current?.click()}>Choose another image</button></> :
                <><div className="upload-icon">↑</div><h3>Drop your image here</h3><p>or click to browse files</p><button className="browse-btn" onClick={()=>inputRef.current?.click()}>Choose an image</button><small>JPG, PNG, WEBP · Max 20 MB</small></>}
              </div>
              {active==="resize" && <div className="settings"><label>Image dimensions</label><div className="dimension-row"><input type="number" min="1" max="8000" value={width} onChange={e=>{const v=Number(e.target.value);setWidth(v);if(keepRatio&&imageRef.current)setHeight(Math.round(v*imageRef.current.naturalHeight/imageRef.current.naturalWidth));}}/><span>×</span><input type="number" min="1" max="8000" value={height} onChange={e=>setHeight(Number(e.target.value))}/></div><label className="check-label"><input type="checkbox" checked={keepRatio} onChange={e=>setKeepRatio(e.target.checked)}/> Keep aspect ratio</label></div>}
              {active==="compress" && <div className="settings"><label>Image quality <b>{quality}%</b></label><input className="range" type="range" min="20" max="95" value={quality} onChange={e=>setQuality(e.target.value)}/><small>Lower quality creates a smaller file.</small></div>}
              {active==="change" && <div className="settings"><label>Choose background color</label><div className="color-row"><input type="color" value={bg} onChange={e=>setBg(e.target.value)}/><span>{bg.toUpperCase()}</span><button onClick={()=>setBg("#eaf3ff")}>Reset</button></div><small>Note: this fills behind the full image; it does not isolate the foreground.</small></div>}
              {active==="remove" && <div className="settings info-note">✦ AI-powered background removal runs in your browser. The AI model may need to download on first use.</div>}
              <button className="process-btn" disabled={busy||!file} onClick={processImage}>{busy?<><span className="spinner"/> Processing...</>:<> {active==="remove"?"Remove background":active==="change"?"Change background":active==="resize"?"Resize image":"Compress image"} <span>→</span></>}</button>
              {progress && <div className="progress-text">{progress}</div>}
              {error && <div className="error-text">{error}</div>}
            </div>
            <div className="result-panel"><div className="result-top"><b>Preview</b><span>{result?"READY":"YOUR RESULT"}</span></div><div className="result-preview">{result?<img src={result} alt="Processed result"/>:<div className="empty-result"><div className="empty-icon">▧</div><b>Your result will appear here</b><span>Upload an image and choose a tool to begin.</span></div>}</div><button className="download-btn" disabled={!result} onClick={downloadResult}>↓ Download image</button></div>
          </div>
        </div>
      </section>

      <section className="how-section" id="how"><div className="eyebrow">SIMPLE AS 1, 2, 3</div><h2>Great results in a few clicks.</h2><div className="steps"><div><span>01</span><h3>Upload</h3><p>Choose an image from your device.</p></div><div><span>02</span><h3>Make it yours</h3><p>Pick a tool and adjust your settings.</p></div><div><span>03</span><h3>Download</h3><p>Save your finished image instantly.</p></div></div></section>
      <footer><a className="brand" href="#"><span className="brand-mark">B</span><span>Background Remove <b>Studio</b></span></a><p>Free image tools. Made for everyone.</p><small>© 2026 Background Remove Studio. All rights reserved.</small></footer>
    </main>
  );
}
