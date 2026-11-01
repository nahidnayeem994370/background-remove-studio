const $=s=>document.querySelector(s);
const toolNames={remove:"Background Remove",change:"Background Changer",resize:"Image Resize",compress:"Image Compress"};
const toolDescriptions={remove:"Remove image background automatically",change:"Cut out your subject and choose a new background",resize:"Resize your image to exact dimensions",compress:"Make your image file smaller"};
let activeTool="remove",sourceFile=null,sourceUrl=null,resultUrl=null,sourceImage=null,outputBlob=null;
const fileInput=$("#file-input"),upload=$("#upload-panel"),edit=$("#edit-panel"),preview=$("#preview"),sourcePreview=$("#source-preview"),processBtn=$("#process-btn");
function setTool(tool){activeTool=tool;document.querySelectorAll("[data-tool]").forEach(b=>b.classList.toggle("active",b.dataset.tool===tool));document.querySelectorAll(".tool-card").forEach(b=>b.classList.toggle("selected",b.dataset.tool===tool));$("#active-title").textContent=toolNames[tool];$("#active-desc").textContent=toolDescriptions[tool];$("#setting-heading").textContent=tool==="remove"?"Ready to remove?":tool==="change"?"Choose a new background":"Ready to edit?";$("#setting-help").textContent=tool==="remove"?"AI will detect the subject and remove the background.":tool==="change"?"AI will isolate the subject before applying your chosen color.": "Your original image will be kept unchanged.";$("#change-settings").classList.toggle("hidden",tool!=="change");$("#resize-settings").classList.toggle("hidden",tool!=="resize");$("#compress-settings").classList.toggle("hidden",tool!=="compress");processBtn.innerHTML=({remove:"Remove background",change:"Change background",resize:"Resize image",compress:"Compress image"}[tool])+" <span>→</span>";$("#result-actions").classList.add("hidden");$("#error-message").classList.add("hidden");if(outputBlob){outputBlob=null;if(resultUrl)URL.revokeObjectURL(resultUrl);resultUrl=null;}}
async function decodeToPng(file){
  const ext=(file.name.split(".").pop()||"").toLowerCase();
  const mime=(file.type||"").toLowerCase();

  // Keep formats accepted directly by BiRefNet; do not inflate them to PNG.
  if(["png","jpg","jpeg","webp"].includes(ext) || /image\/(png|jpeg|webp)/i.test(mime)) return file;

  // HEIC/HEIF needs a dedicated decoder on browsers that do not support it.
  if(["heic","heif"].includes(ext)||/image\/(heic|heif)/i.test(mime)){
    const mod=await import("https://esm.sh/heic2any@0.0.4");
    const convert=mod.default||mod;
    const converted=await convert({blob:file,toType:"image/png",quality:1});
    const blob=Array.isArray(converted)?converted[0]:converted;
    if(blob)return blob;
  }

  // TIFF is not consistently supported by mobile browsers. Decode it locally.
  if(["tif","tiff"].includes(ext)||/image\/tiff/i.test(mime)){
    const mod=await import("https://esm.sh/utif@3.1.0");
    const bytes=new Uint8Array(await file.arrayBuffer());
    const ifds=mod.decode(bytes);
    if(!ifds?.length)throw new Error("The TIFF file contains no readable image.");
    mod.decodeImage(bytes,ifds[0]);
    const rgba=mod.toRGBA8(ifds[0]);
    const canvas=document.createElement("canvas");
    canvas.width=ifds[0].width;canvas.height=ifds[0].height;
    const ctx=canvas.getContext("2d");
    ctx.putImageData(new ImageData(new Uint8ClampedArray(rgba),canvas.width,canvas.height),0,0);
    return await canvasBlob(canvas,"image/png");
  }

  // Use the browser's native decoders for AVIF, GIF, BMP, SVG and other
  // formats supported by the device, then normalize them for the AI engine.
  if(typeof createImageBitmap==="function"){
    try{
      const bitmap=await createImageBitmap(file);
      const canvas=document.createElement("canvas");canvas.width=bitmap.width;canvas.height=bitmap.height;
      canvas.getContext("2d").drawImage(bitmap,0,0);bitmap.close?.();
      return await canvasBlob(canvas,"image/png");
    }catch(e){}
  }
  return await new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file),img=new Image();
    img.onload=async()=>{try{
      const c=document.createElement("canvas");c.width=img.naturalWidth;c.height=img.naturalHeight;
      c.getContext("2d").drawImage(img,0,0);URL.revokeObjectURL(url);
      resolve(await canvasBlob(c,"image/png"));
    }catch(e){URL.revokeObjectURL(url);reject(e);}};
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
    sourceFile=normalized instanceof File ? normalized : new File([normalized],(file.name.replace(/\.[^.]+$/,"")||"image")+".png",{type:"image/png"});
    sourceUrl&&URL.revokeObjectURL(sourceUrl);sourceUrl=URL.createObjectURL(normalized);
    preview.src="";sourcePreview.src=sourceUrl;$("#result-placeholder").classList.remove("hidden");$(".compare-grid").classList.remove("has-result");sourceImage=new Image();
    await new Promise((resolve,reject)=>{sourceImage.onload=resolve;sourceImage.onerror=()=>reject(new Error("This image format is not supported by your browser."));sourceImage.src=sourceUrl;});
    $("#width-input").value=sourceImage.naturalWidth;$("#height-input").value=sourceImage.naturalHeight;
    upload.classList.add("hidden");edit.classList.remove("hidden");
    $("#result-actions").classList.add("hidden");$("#error-message").classList.add("hidden");
  }catch(err){showError("This image format could not be opened. Supported formats include JPG, PNG, WEBP, GIF, BMP, AVIF, HEIC/HEIF, TIFF and SVG.");}
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
    for(let i=3;i<pixels.length;i+=4){if(pixels[i]<250)transparent++;if(pixels[i]>8)visible++;}
    const total=pixels.length/4;
    return transparent/total>0.0001 && visible/total>0.001;
  }finally{bitmap.close?.();}
}
async function removeBg(file){
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
  if(!(await hasTransparentPixels(result.blob)))throw new Error("The AI could not separate the subject clearly in this photo. Try a photo with the subject clearly visible against its background.");
  console.info("Background removal engine:",result.model,result.provider,"in",result.durationMs,"ms");
  return result.blob;
}
function canvasBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not create image. Try another format.")),type,quality));}
async function run(){if(!sourceFile)return showError("Choose an image first.");processBtn.disabled=true;processBtn.style.opacity=".65";$("#result-actions").classList.add("hidden");$("#error-message").classList.add("hidden");
if(activeTool==="remove"){$("#result-placeholder").classList.remove("hidden");$("#result-placeholder").innerHTML='<span class="loading-spinner" aria-hidden="true"></span><b>Loading…</b><small>Preparing AI background removal</small>';}
progress(true,"Preparing image…",5);try{let blob,filename="edited-image.png";
if(activeTool==="remove"||activeTool==="change"){progress(true,"Loading free AI background remover…",8);const cutout=await removeBg(sourceFile);if(activeTool==="remove"){blob=cutout;filename="background-removed.png";}else{progress(true,"Applying new background…",88);const cutImage=await createImageBitmap(cutout);const c=document.createElement("canvas");c.width=cutImage.width;c.height=cutImage.height;const ctx=c.getContext("2d");ctx.fillStyle=$("#bg-color").value;ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(cutImage,0,0);blob=await canvasBlob(c,"image/png");filename="background-changed.png";}}
else{progress(true,"Editing your image…",30);const c=document.createElement("canvas"),ctx=c.getContext("2d");if(activeTool==="resize"){const w=Math.round(+$("#width-input").value),h=Math.round(+$("#height-input").value);if(!w||!h||w>8000||h>8000)throw new Error("Enter a width and height between 1 and 8000 pixels.");c.width=w;c.height=h;ctx.drawImage(sourceImage,0,0,w,h);blob=await canvasBlob(c,"image/png");filename="resized-image.png";}else{c.width=sourceImage.naturalWidth;c.height=sourceImage.naturalHeight;ctx.drawImage(sourceImage,0,0);blob=await canvasBlob(c,"image/jpeg",+$("#quality-input").value/100);filename="compressed-image.jpg";}}
if(resultUrl)URL.revokeObjectURL(resultUrl);outputBlob=blob;resultUrl=URL.createObjectURL(blob);preview.src=resultUrl;$("#result-placeholder").classList.add("hidden");$(".compare-grid").classList.add("has-result");$("#download-btn").href=resultUrl;$("#download-btn").download=filename;$("#result-actions").classList.remove("hidden");$("#preview").alt="Processed image result";$("#preview").scrollIntoView({behavior:"smooth",block:"nearest"});progress(false);$("#setting-heading").textContent="Background removed — preview your image";$("#setting-help").textContent="Download your edited image below."; }catch(err){console.error(err);progress(false);if(activeTool==="remove"){$("#result-placeholder").classList.remove("hidden");$("#result-placeholder").innerHTML='<b>Background removal did not finish</b><small>Please try again with another photo.</small>';}showError(/decode|decod|image format|unsupported/i.test(err.message||"")?"This format could not be decoded by your browser. Try JPG, PNG, WEBP, GIF, BMP, AVIF, HEIC/HEIF, TIFF or SVG.":(err.message||"The image could not be processed. Please try another image or a smaller file."));}finally{processBtn.disabled=false;processBtn.style.opacity="1";}}
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
async function warmBg0Model() {
  const mod=await import("https://esm.sh/@bg0/browser");
  if(typeof mod.prepareBackgroundRemoval==="function"){
    await mod.prepareBackgroundRemoval({model:"auto"});
  } else {
    const canvas=document.createElement("canvas");canvas.width=64;canvas.height=64;
    const ctx=canvas.getContext("2d");ctx.fillStyle="#fff";ctx.fillRect(0,0,64,64);
    const sample=await canvasBlob(canvas,"image/png");
    await mod.removeBackground(new File([sample],"warmup.png",{type:"image/png"}),{model:"auto",quality:"fast"});
  }
}
async function preloadAiModels() {
  setPreloadStatus("Preparing free on-device BiRefNet AI…");
  try {
    await warmBg0Model();
    setPreloadStatus("AI model ready. Upload an image.");
  } catch (error) {
    console.warn("BiRefNet preloading failed; it will retry when you remove a background.", error);
    setPreloadStatus("AI model will load when you start Background Remove.");
  }
}
window.addEventListener("load", () => {
  // Start automatically on entry, after the page's visible content has loaded.
  preloadAiModels();
}, { once: true });
