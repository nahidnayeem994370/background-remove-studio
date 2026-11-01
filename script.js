const $=s=>document.querySelector(s);
const toolNames={remove:"Background Remove",change:"Background Changer",resize:"Image Resize",compress:"Image Compress"};
const toolDescriptions={remove:"Remove image background automatically",change:"Cut out your subject and choose a new background",resize:"Resize your image to exact dimensions",compress:"Make your image file smaller"};
let activeTool="remove",sourceFile=null,sourceUrl=null,resultUrl=null,sourceImage=null,outputBlob=null;
const fileInput=$("#file-input"),upload=$("#upload-panel"),edit=$("#edit-panel"),preview=$("#preview"),sourcePreview=$("#source-preview"),processBtn=$("#process-btn");
function setTool(tool){const previousTool=activeTool;activeTool=tool;if(tool==="compress"&&previousTool!=="compress")$("#output-format").value="image/jpeg";else if(previousTool==="compress"&&tool!=="compress"&&$("#output-format").value==="image/jpeg")$("#output-format").value="image/png";document.querySelectorAll("[data-tool]").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));document.querySelectorAll(".tool-card").forEach(b=>b.classList.toggle("selected",b.dataset.tool===tool));$("#active-title").textContent=toolNames[tool];$("#active-desc").textContent=toolDescriptions[tool];$("#setting-heading").textContent=tool==="remove"?"Ready to remove?":tool==="change"?"Choose a new background":"Ready to edit?";$("#setting-help").textContent=tool==="remove"?"AI will detect the subject and remove the background.":tool==="change"?"AI will isolate the subject before applying your chosen color.": "Your original image will be kept unchanged.";$("#change-settings").classList.toggle("hidden",tool!=="change");$("#resize-settings").classList.toggle("hidden",tool!=="resize");$("#compress-settings").classList.toggle("hidden",tool!=="compress");processBtn.innerHTML=({remove:"Remove background",change:"Change background",resize:"Resize image",compress:"Compress image"}[tool])+" <span>→</span>";$("#result-actions").classList.add("hidden");$("#error-message").classList.add("hidden");if(outputBlob){outputBlob=null;if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;}}
async function decodeToPng(file){
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  const mime=(file.type||"").toLowerCase();
  let input=file;

  // Convert HEIC/HEIF first; many Android browsers cannot decode these natively.
  if(["heic","heif"].includes(ext)||/image\/(heic|heif)/i.test(mime)){
    const mod=await import("https://esm.sh/heic2any@0.0.4");
    const convert=mod.default||mod;
    const converted=await convert({blob:file,toType:"image/png",quality:1});
    input=Array.isArray(converted)?converted[0]:converted;
  }

  // Decode TIFF locally because native mobile-browser support is uncommon.
  if(["tif","tiff"].includes(ext)||/image\/tiff/i.test(mime)){
    const mod=await import("https://esm.sh/utif@3.1.0");
    const bytes=new Uint8Array(await input.arrayBuffer());
    const ifds=mod.decode(bytes);
    if(!ifds||!ifds.length)throw new Error("TIFF decoder found no image data.");
    mod.decodeImage(bytes,ifds[0]);
    const rgba=mod.toRGBA8(ifds[0]);
    const c=document.createElement("canvas");c.width=ifds[0].width;c.height=ifds[0].height;
    c.getContext("2d").putImageData(new ImageData(new Uint8ClampedArray(rgba),c.width,c.height),0,0);
    return await canvasBlob(c,"image/png");
  }

  // Always normalize the decoded image to PNG before sending it to the AI.
  // This avoids format/MIME mismatches inside the model's image decoder.
  if(typeof createImageBitmap==="function"){
    try{
      const bitmap=await createImageBitmap(input);
      const c=document.createElement("canvas");c.width=bitmap.width;c.height=bitmap.height;
      const ctx=c.getContext("2d");
      if(!ctx)throw new Error("Canvas is unavailable in this browser.");
      ctx.drawImage(bitmap,0,0);bitmap.close?.();
      return await canvasBlob(c,"image/png");
    }catch(bitmapError){
      console.warn("Native bitmap decoding failed; trying HTML image decoder.",bitmapError);
    }
  }

  return await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(input),img=new Image();
    img.onload=async()=>{
      try{
        if(!img.naturalWidth||!img.naturalHeight)throw new Error("Image has no readable dimensions.");
        const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;
        const ctx=c.getContext("2d");if(!ctx)throw new Error("Canvas is unavailable in this browser.");
        ctx.drawImage(img,0,0);URL.revokeObjectURL(url);
        resolve(await canvasBlob(c,"image/png"));
      }catch(e){URL.revokeObjectURL(url);reject(e);}
    };
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("Your browser cannot decode this image. Try a JPG or PNG copy."));};
    img.src=url;
  });
}
async function showFile(file){
  if(!file)return;
  if(file.size>25*1024*1024)return showError("This image is larger than 25 MB. Please choose a smaller file.");
  if(!file.type.startsWith("image/")&&!/\.(jpe?g|jfif|png|webp|gif|bmp|dib|avif|heic|heif|tiff?|svg|ico)$/i.test(file.name))return showError("Please choose an image file.");
  showError("Loading and converting your image…");
  try{
    const normalized=await decodeToPng(file);
    sourceFile=normalized instanceof File ? normalized : new File([normalized],(file.name.replace(/\.[^.]+$/,"")||"image")+".png",{type:"image/png"});
    sourceUrl&&URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(sourceFile);
    preview.src="";sourcePreview.src=sourceUrl;$("#result-placeholder").classList.remove("hidden");$(".compare-grid").classList.remove("has-result");sourceImage=new Image();
    await new Promise((resolve,reject)=>{sourceImage.onload=resolve;sourceImage.onerror=()=>reject(new Error("This image format is not supported by your browser."));sourceImage.src=sourceUrl;});
    $("#width-input").value=sourceImage.naturalWidth;$("#height-input").value=sourceImage.naturalHeight;$("#output-width").value=sourceImage.naturalWidth;$("#output-height").value=sourceImage.naturalHeight;
    upload.classList.add("hidden");edit.classList.remove("hidden");
    $("#result-actions").classList.add("hidden");$("#error-message").classList.add("hidden");
  }catch(err){console.error("Image decoding/opening failed:",err);showError("Could not open this image in the browser. Try another copy of the file, or export it as JPG/PNG. Details: "+(err?.message||"unknown decoding error"));}
}
function showError(msg){const el=$("#error-message");el.textContent=msg;el.classList.remove("hidden");}
fileInput.addEventListener("change",e=>showFile(e.target.files[0]));
$("#choose-another").addEventListener("click",()=>fileInput.click());
["dragenter","dragover"].forEach(ev=>upload.addEventListener(ev,e=>{e.preventDefault();upload.classList.add("drag")}));
["dragleave","drop"].forEach(ev=>upload.addEventListener(ev,e=>{e.preventDefault();upload.classList.remove("drag")}));
upload.addEventListener("drop",e=>showFile(e.dataTransfer.files[0]));
document.querySelectorAll("[data-tool]").forEach(b=>b.addEventListener("click",()=>{setTool(b.dataset.tool);if(b.classList.contains("tool-card"))$("#workspace").scrollIntoView({behavior:"smooth"});}));
$("#bg-color").addEventListener("input",e=>$("#color-value").textContent=e.target.value.toUpperCase());
$("#quality-input").addEventListener("input",e=>$("#quality-value").textContent=e.target.value+"%");
$("#width-input").addEventListener("input",()=>{if($("#keep-ratio").checked&&sourceImage?.naturalWidth){$("#height-input").value=Math.round(+$("#width-input").value*sourceImage.naturalHeight/sourceImage.naturalWidth)}});
$("#height-input").addEventListener("input",()=>{if($("#keep-ratio").checked&&sourceImage?.naturalHeight){$("#width-input").value=Math.round(+$("#height-input").value*sourceImage.naturalWidth/sourceImage.naturalHeight)}});
$("#resize-output").addEventListener("change",e=>$("#output-dimensions").classList.toggle("hidden",!e.target.checked));
$("#output-width").addEventListener("input",()=>{if($("#keep-ratio").checked&&sourceImage?.naturalWidth)$("#output-height").value=Math.round(+$("#output-width").value*sourceImage.naturalHeight/sourceImage.naturalWidth)});
$("#output-height").addEventListener("input",()=>{if($("#keep-ratio").checked&&sourceImage?.naturalHeight)$("#output-width").value=Math.round(+$("#output-height").value*sourceImage.naturalWidth/sourceImage.naturalHeight)});

function progress(show,msg="Processing image…",percent=0){
  $("#progress").classList.toggle("hidden",!show);
  $("#progress-text").textContent=msg;
  $("#progress-bar").style.width=percent+"%";
  const placeholder=$("#result-placeholder");
  if(placeholder&&activeTool==="remove"&&show){
    placeholder.classList.remove("hidden");
    placeholder.innerHTML='<span class="loading-spinner" aria-hidden="true"></span><b>Loading…</b><small>'+msg+'</small>';
  }
}
const AI_CONFIG={model:"isnet_fp16",output:{format:"image/png",type:"foreground"},progress:(key,current,total)=>{if(total){const pct=Math.round(current/total*100);progress(true,"Loading backup AI model… "+pct+"%",Math.min(95,pct));}}};
async function hasTransparentPixels(blob){
  const bitmap=await createImageBitmap(blob);
  try{
    const scale=Math.min(1,256/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    const ctx=canvas.getContext("2d",{willReadFrequently:true});ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);
    const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let transparent=0,visible=0;
    for(let i=3;i<pixels.length;i+=4){if(pixels[i]<250)transparent++;if(pixels[i]>8)visible++;}
    const total=pixels.length/4;
    return transparent/total>0.0001 && visible/total>0.001;
  }finally{bitmap.close?.();}
}
async function removeBg(file){
  // If the page is already warming the model, reuse that session instead of
  // starting a second inference at the same time on a memory-limited phone.
  if(aiPreloadPromise) await aiPreloadPromise;
  // BiRefNet runs locally. BG0 automatically chooses full or lite weights
  // for the visitor's hardware and falls back to WASM where necessary.
  const mod=await import("https://esm.sh/@bg0/browser");
  const result=await mod.removeBackground(file,{
    model:"auto",
    quality:"quality",
    onProgress:p=>{
      const labels={preparing:"Preparing AI…",downloading:"Downloading AI model…",processing:"Detecting subject and removing background…",finishing:"Refining edges…"};
      const pct=p.progress==null?35:Math.max(8,Math.min(95,Math.round(p.progress*100)));
      progress(true,labels[p.stage]||p.message||"Processing image…",pct);
    }
  });
  if(!result?.blob)throw new Error("The AI did not return an image. Please reload the page and try again.");
  console.info("Background removal engine:",result.model,result.provider,"in",result.durationMs,"ms","output:",result.blob.type,result.blob.size,"bytes");
  // Do not reject a valid model result based only on a strict alpha-pixel check.
  // Some browsers/providers encode edge pixels differently; let the user inspect the preview.
  if(!(await hasTransparentPixels(result.blob)))console.warn("The AI output contains no detectable transparent pixels; showing the model result for inspection.");
  return result.blob;
}
function canvasBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not create image. Try another format.")),type,quality));}
async function run(){if(!sourceFile)return showError("Choose an image first.");processBtn.disabled=true;processBtn.style.opacity=".65";$("#result-actions").classList.add("hidden");$("#error-message").classList.add("hidden");
if(activeTool==="remove"){$("#result-placeholder").classList.remove("hidden");$("#result-placeholder").innerHTML='<span class="loading-spinner" aria-hidden="true"></span><b>Loading…</b><small>Preparing AI background removal</small>';}
progress(true,"Preparing image…",5);try{let blob,filename="edited-image.png";
if(activeTool==="remove"||activeTool==="change"){progress(true,"Loading free AI background remover…",8);const cutout=await removeBg(sourceFile);if(activeTool==="remove"){blob=cutout;filename="background-removed.png";}else{progress(true,"Applying new background…",88);const cutImage=await createImageBitmap(cutout);const c=document.createElement("canvas");c.width=cutImage.width;c.height=cutImage.height;const ctx=c.getContext("2d");ctx.fillStyle=$("#bg-color").value;ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(cutImage,0,0);blob=await canvasBlob(c,"image/png");filename="background-changed.png";}}
else{progress(true,"Editing your image…",30);const c=document.createElement("canvas"),ctx=c.getContext("2d");if(activeTool==="resize"){const w=Math.round(+$("#width-input").value),h=Math.round(+$("#height-input").value);if(!w||!h||w>8000||h>8000)throw new Error("Enter a width and height between 1 and 8000 pixels.");c.width=w;c.height=h;ctx.drawImage(sourceImage,0,0,w,h);blob=await canvasBlob(c,"image/png");filename="resized-image.png";}else{c.width=sourceImage.naturalWidth;c.height=sourceImage.naturalHeight;ctx.drawImage(sourceImage,0,0);blob=await canvasBlob(c,"image/jpeg",+$("#quality-input").value/100);filename="compressed-image.jpg";}}
// Apply optional output dimensions and selected export format after any tool.
const outBitmap=await createImageBitmap(blob);
const requestedW=$("#resize-output").checked?Math.round(+$("#output-width").value):outBitmap.width;
const requestedH=$("#resize-output").checked?Math.round(+$("#output-height").value):outBitmap.height;
if(!requestedW||!requestedH||requestedW>8000||requestedH>8000){outBitmap.close?.();throw new Error("Output width and height must be between 1 and 8000 pixels.");}
const exportType=$("#output-format").value;
const exportCanvas=document.createElement("canvas");exportCanvas.width=requestedW;exportCanvas.height=requestedH;
const exportCtx=exportCanvas.getContext("2d");
if(exportType==="image/jpeg"){exportCtx.fillStyle="#ffffff";exportCtx.fillRect(0,0,requestedW,requestedH);}
exportCtx.drawImage(outBitmap,0,0,requestedW,requestedH);outBitmap.close?.();
const exportQuality=activeTool==="compress"?Math.max(.1,Math.min(1,+$("#quality-input").value/100)):.92;
blob=await canvasBlob(exportCanvas,exportType,exportQuality);
const ext=exportType==="image/jpeg"?"jpg":exportType==="image/webp"?"webp":"png";
filename="edited-image."+ext;
if(resultUrl)URL.revokeObjectURL(resultUrl);outputBlob=blob;resultUrl=URL.createObjectURL(blob);preview.src=resultUrl;$("#result-placeholder").classList.add("hidden");$(".compare-grid").classList.add("has-result");$("#download-btn").href=resultUrl;$("#download-btn").download=filename;$("#result-actions").classList.remove("hidden");$("#preview").alt="Processed image result";$("#preview").scrollIntoView({behavior:"smooth",block:"nearest"});progress(false);$("#setting-heading").textContent="Your image is ready";$("#setting-help").textContent="Choose another format or resolution any time, then download."; }catch(err){console.error(err);progress(false);if(activeTool==="remove"){$("#result-placeholder").classList.remove("hidden");$("#result-placeholder").innerHTML='<b>Background removal did not finish</b><small>Please try again with another photo.</small>';}showError((err?.message||"The image could not be processed. Please try another image or a smaller file.")+" (See browser console for technical details.)");}finally{processBtn.disabled=false;processBtn.style.opacity="1";}}
processBtn.addEventListener("click",run);
$("#download-btn").addEventListener("click",()=>{if(!outputBlob)return;});
document.querySelector(".menu-toggle").addEventListener("click",()=>document.querySelector(".site-header nav").classList.toggle("open"));
setTool("remove");

// Preload the background-removal engines after the page opens.
// Model files are cached by the browser; first-time visitors may download
// a substantial amount of data. Engines are warmed sequentially to reduce
// memory pressure on Android devices.
let aiPreloadPromise = null;
const preloadStatus = document.getElementById("ai-preload-status");
function setPreloadStatus(message) {
  if (preloadStatus) preloadStatus.textContent = message;
}
async function warmBg0Model() {
  // Warm the same automatic BiRefNet path and quality pipeline used for
  // real photos. This loads the selected model/runtime into this page session.
  const mod=await import("https://esm.sh/@bg0/browser");
  const canvas=document.createElement("canvas");
  canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext("2d");
  ctx.fillStyle="#e9eef5";ctx.fillRect(0,0,256,256);
  ctx.fillStyle="#243b53";ctx.beginPath();ctx.arc(128,128,58,0,Math.PI*2);ctx.fill();
  const sample=await canvasBlob(canvas,"image/png");
  await mod.removeBackground(
    new File([sample],"model-warmup.png",{type:"image/png"}),
    {model:"auto",quality:"quality"}
  );
}
async function preloadAiModels() {
  setPreloadStatus("Loading the background-removal AI…");
  try {
    await warmBg0Model();
    setPreloadStatus("AI is ready. Upload an image.");
  } catch (error) {
    console.warn("BiRefNet preloading failed; it will retry when you remove a background.", error);
    setPreloadStatus("AI will finish loading when you start Background Remove.");
  }
}
// Start model download as soon as the document is ready; do not wait for
// every page asset. The browser caches model files for later visits.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => { aiPreloadPromise = preloadAiModels(); }, { once: true });
} else {
  aiPreloadPromise = preloadAiModels();
}
