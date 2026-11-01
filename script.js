const $=s=>document.querySelector(s);
const toolNames={remove:"Background Remove",change:"Background Changer",resize:"Image Resize",compress:"Image Compress"};
const toolDescriptions={remove:"Remove image background automatically",change:"Cut out your subject and choose a new background",resize:"Resize your image to exact dimensions",compress:"Make your image file smaller"};
let activeTool="remove",sourceFile=null,sourceUrl=null,resultUrl=null,sourceImage=null,outputBlob=null;
const fileInput=$("#file-input"),upload=$("#upload-panel"),edit=$("#edit-panel"),preview=$("#preview"),sourcePreview=$("#source-preview"),processBtn=$("#process-btn");
function setTool(tool){activeTool=tool;document.querySelectorAll("[data-tool]").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));document.querySelectorAll(".tool-card").forEach(b=>b.classList.toggle("selected",b.dataset.tool===tool));$("#active-title").textContent=toolNames[tool];$("#active-desc").textContent=toolDescriptions[tool];$("#setting-heading").textContent=tool==="remove"?"Ready to remove?":tool==="change"?"Choose a new background":"Ready to edit?";$("#setting-help").textContent=tool==="remove"?"AI will detect the subject and remove the background.":tool==="change"?"AI will isolate the subject before applying your chosen color.": "Your original image will be kept unchanged.";$("#change-settings").classList.toggle("hidden",tool!=="change");$("#resize-settings").classList.toggle("hidden",tool!=="resize");$("#compress-settings").classList.toggle("hidden",tool!=="compress");processBtn.innerHTML=({remove:"Remove background",change:"Change background",resize:"Resize image",compress:"Compress image"}[tool])+" <span>→</span>";$("#result-actions").classList.add("hidden");$("#error-message").classList.add("hidden");if(outputBlob){outputBlob=null;if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;}}
async function decodeToPng(file){
  let input=file;
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  if(["heic","heif"].includes(ext)||/image\/(heic|heif)/i.test(file.type)){
    const mod=await import("https://esm.sh/heic2any@0.0.4");
    const convert=mod.default||mod;
    const converted=await convert({blob:file,toType:"image/png",quality:1});
    input=Array.isArray(converted)?converted[0]:converted;
  }
  if(typeof createImageBitmap==="function"){
    try{
      const bitmap=await createImageBitmap(input);
      const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;
      canvas.getContext("2d").drawImage(bitmap,0,0);bitmap.close?.();
      return await canvasBlob(canvas,"image/png");
    }catch(e){}
  }
  return await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(input),img=new Image();
    img.onload=async()=>{try{const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;c.getContext("2d").drawImage(img,0,0);URL.revokeObjectURL(url);resolve(await canvasBlob(c,"image/png"));}catch(e){URL.revokeObjectURL(url);reject(e);}};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error("This image format is not supported by this browser."));};
    img.src=url;
  });
}
async function showFile(file){
  if(!file)return;
  if(file.size>25*1024*1024)return showError("This image is larger than 25 MB. Please choose a smaller file.");
  if(!file.type.startsWith("image/")&&!/\.(jpe?g|png|webp|gif|bmp|avif|heic|heif|tiff?|svg)$/i.test(file.name))return showError("Please choose an image file.");
  showError("Loading and converting your image…");
  try{
    const normalized=await decodeToPng(file);
    sourceFile=new File([normalized],(file.name.replace(/\.[^.]+$/,"")||"image")+".png",{type:"image/png"});
    sourceUrl&&URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(normalized);
    preview.src="";sourcePreview.src=sourceUrl;$("#result-placeholder").classList.remove("hidden");$(".compare-grid").classList.remove("has-result");sourceImage=new Image();
    await new Promise((resolve,reject)=>{sourceImage.onload=resolve;sourceImage.onerror=()=>reject(new Error("This image format is not supported by your browser."));sourceImage.src=sourceUrl;});
    $("#width-input").value=sourceImage.naturalWidth;$("#height-input").value=sourceImage.naturalHeight;
    upload.classList.add("hidden");edit.classList.remove("hidden");
    $("#result-actions").classList.add("hidden");$("#error-message").classList.add("hidden");
  }catch(err){showError("This image format could not be opened on your browser. Try JPG, PNG, WEBP, GIF, BMP, AVIF or HEIC.");}
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
    for(let i=3;i<pixels.length;i+=4){
      if(pixels[i]<245)transparent++;
      if(pixels[i]>16)visible++;
    }
    const total=pixels.length/4;
    // Reject both an opaque full-frame image and an empty/fully transparent mask.
    return transparent/total>0.015 && visible/total>0.002;
  }finally{bitmap.close?.();}
}
async function removeBg(file){
  // BG0 automatically selects WebGPU or WebAssembly, so Android browsers are not
  // forced onto the old low-quality model just because WebGPU is unavailable.
  let firstError=null;
  try{
    const mod=await import("https://esm.sh/@bg0/browser");
    const result=await mod.removeBackground(file,{quality:"quality",onProgress:p=>{
      const labels={preparing:"Preparing AI…",downloading:"Loading AI model…",processing:"Removing background…",finishing:"Smoothing image edges…"};
      const pct=p.progress==null?35:Math.max(8,Math.min(95,Math.round(p.progress*100)));
      progress(true,labels[p.stage]||p.message||"Processing image…",pct);
    }});
    if(result?.blob&&await hasTransparentPixels(result.blob))return result.blob;
    firstError=new Error("The AI did not produce a transparent cutout.");
  }catch(error){firstError=error;console.warn("BG0 AI failed; trying the backup model.",error);}
  try{
    const mod=await import("https://esm.sh/@imgly/background-removal@1.7.0");
    const remove=mod.removeBackground||mod.default;
    const blob=await remove(file,AI_CONFIG);
    if(await hasTransparentPixels(blob))return blob;
    throw new Error("No transparent background was detected in the result.");
  }catch(error){console.warn("ISNet backup failed; trying the browser SDK.",error);}
  // Third engine: BgRemove's browser SDK (RMBG-1.4). It runs on the visitor's
  // device and does not upload the photo.
  try{
    progress(true,"Trying another free AI model…",72);
    if(!window.BgRemove){
      await new Promise((resolve,reject)=>{
        const existing=document.querySelector('script[data-bgremove-sdk]');
        if(existing){existing.addEventListener("load",resolve,{once:true});existing.addEventListener("error",()=>reject(new Error("SDK unavailable")),{once:true});return;}
        const script=document.createElement("script");
        script.src="https://bgremovers.org/sdk/v1.js";script.async=true;script.dataset.bgremoveSdk="1";
        script.onload=resolve;script.onerror=()=>reject(new Error("SDK unavailable"));
        document.head.appendChild(script);
      });
    }
    if(!window.BgRemove?.removeBackground)throw new Error("Browser SDK did not load.");
    const blob=await window.BgRemove.removeBackground(file,{maxDimension:4096,onProgress:p=>{
      const pct=p?.progress==null?78:Math.max(72,Math.min(94,Math.round(p.progress*100)));
      progress(true,"Trying browser AI model…",pct);
    }});
    if(blob&&await hasTransparentPixels(blob))return blob;
    throw new Error("Browser SDK did not return a transparent image.");
  }catch(error){console.warn("BgRemove browser SDK failed; trying free online services.",error);}
  // Last-resort free hosted APIs. These receive the image only after all
  // on-device AI engines fail. Both providers return a transparent PNG.
  const hosted=[
    {name:"BgRemove free service",url:"https://bgremovers.org/api/v1/remove-background",field:"image"},
    {name:"BGNinja free service",url:"https://bgninja.com/api/remove",field:"file"}
  ];
  for(let i=0;i<hosted.length;i++){
    const provider=hosted[i];
    try{
      progress(true,"Trying "+provider.name+"…",82+i*6);
      const form=new FormData();form.append(provider.field,file,file.name||"image.png");
      if(provider.name==="BGNinja free service")form.append("src","background-remove-studio");
      const response=await fetch(provider.url,{method:"POST",body:form});
      if(!response.ok)throw new Error(provider.name+" returned HTTP "+response.status);
      const blob=await response.blob();
      if(!blob.type.includes("image"))throw new Error(provider.name+" returned an invalid response.");
      if(await hasTransparentPixels(blob))return blob;
      throw new Error(provider.name+" returned an image without transparency.");
    }catch(error){console.warn(provider.name+" failed; trying next option.",error);}
  }
  console.error("All background-removal engines failed.",firstError);
  throw new Error("All free AI engines are unavailable right now. Please try again later or use a clearer photo.");
}
function canvasBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not create image. Try another format.")),type,quality));}
async function run(){if(!sourceFile)return showError("Choose an image first.");processBtn.disabled=true;processBtn.style.opacity=".65";$("#result-actions").classList.add("hidden");$("#error-message").classList.add("hidden");
if(activeTool==="remove"){$("#result-placeholder").classList.remove("hidden");$("#result-placeholder").innerHTML='<span class="loading-spinner" aria-hidden="true"></span><b>Loading…</b><small>Preparing AI background removal</small>';}
progress(true,"Preparing image…",5);try{let blob,filename="edited-image.png";
if(activeTool==="remove"||activeTool==="change"){progress(true,"Loading free AI background remover…",8);const cutout=await removeBg(sourceFile);if(activeTool==="remove"){blob=cutout;filename="background-removed.png";}else{progress(true,"Applying new background…",88);const cutImage=await createImageBitmap(cutout);const c=document.createElement("canvas");c.width=cutImage.width;c.height=cutImage.height;const ctx=c.getContext("2d");ctx.fillStyle=$("#bg-color").value;ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(cutImage,0,0);blob=await canvasBlob(c,"image/png");filename="background-changed.png";}}
else{progress(true,"Editing your image…",30);const c=document.createElement("canvas"),ctx=c.getContext("2d");if(activeTool==="resize"){const w=Math.round(+$("#width-input").value),h=Math.round(+$("#height-input").value);if(!w||!h||w>8000||h>8000)throw new Error("Enter a width and height between 1 and 8000 pixels.");c.width=w;c.height=h;ctx.drawImage(sourceImage,0,0,w,h);blob=await canvasBlob(c,"image/png");filename="resized-image.png";}else{c.width=sourceImage.naturalWidth;c.height=sourceImage.naturalHeight;ctx.drawImage(sourceImage,0,0);blob=await canvasBlob(c,"image/jpeg",+$("#quality-input").value/100);filename="compressed-image.jpg";}}
if(resultUrl)URL.revokeObjectURL(resultUrl);outputBlob=blob;resultUrl=URL.createObjectURL(blob);preview.src=resultUrl;$("#result-placeholder").classList.add("hidden");$(".compare-grid").classList.add("has-result");$("#download-btn").href=resultUrl;$("#download-btn").download=filename;$("#result-actions").classList.remove("hidden");$("#preview").alt="Processed image result";$("#preview").scrollIntoView({behavior:"smooth",block:"nearest"});progress(false);$("#setting-heading").textContent="Background removed — preview your image";$("#setting-help").textContent="Download your edited image below."; }catch(err){console.error(err);progress(false);if(activeTool==="remove"){$("#result-placeholder").classList.remove("hidden");$("#result-placeholder").innerHTML='<b>Background removal did not finish</b><small>Please try again with another photo.</small>';}showError(/decode|decod|image format|unsupported/i.test(err.message||"")?"This image format is not supported. Please try JPG, PNG, WEBP, GIF, BMP, AVIF or HEIC.":(err.message||"The image could not be processed. Please try another image or a smaller file."));}finally{processBtn.disabled=false;processBtn.style.opacity="1";}}
processBtn.addEventListener("click",run);
$("#download-btn").addEventListener("click",()=>{if(!outputBlob)return;});
document.querySelector(".menu-toggle").addEventListener("click",()=>document.querySelector(".site-header nav").classList.toggle("open"));
setTool("remove");

// Preload the background-removal engines after the page opens.
// Model files are cached by the browser; first-time visitors may download
// a substantial amount of data. Engines are warmed sequentially to reduce
// memory pressure on Android devices.
const preloadStatus = document.getElementById("ai-preload-status");
function setPreloadStatus(message) {
  if (preloadStatus) preloadStatus.textContent = message;
}
function loadBgRemoveSdk() {
  if (window.BgRemove?.preload) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-bgremove-sdk]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", () => reject(new Error("SDK unavailable")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://bgremovers.org/sdk/v1.js";
    script.async = true;
    script.dataset.bgremoveSdk = "1";
    script.onload = resolve;
    script.onerror = () => reject(new Error("SDK unavailable"));
    document.head.appendChild(script);
  });
}
async function warmBg0Model() {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#dcecff";
  ctx.fillRect(0, 0, 256, 256);
  ctx.fillStyle = "#263f70";
  ctx.beginPath();
  ctx.arc(128, 128, 70, 0, Math.PI * 2);
  ctx.fill();
  const sample = await canvasBlob(canvas, "image/png");
  const file = new File([sample], "model-warmup.png", { type: "image/png" });
  await (await import("https://esm.sh/@bg0/browser")).removeBackground(file, {
    quality: "quality",
    onProgress: p => {
      if (p?.progress != null) setPreloadStatus("Downloading AI model 1/3… " + Math.round(p.progress * 100) + "%");
    }
  });
}
async function preloadAiModels() {
  setPreloadStatus("Preparing the main AI model (BiRefNet)…");
  try {
    await warmBg0Model();
    setPreloadStatus("Main AI model is ready. Upload an image.");
  } catch (error) {
    console.warn("BiRefNet preloading failed; it will retry when you remove a background.", error);
    setPreloadStatus("AI model will load when you start Background Remove.");
  }
}
window.addEventListener("load", () => {
  // Start automatically on entry, after the page's visible content has loaded.
  preloadAiModels();
}, { once: true });
