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
    preview.src="";sourcePreview.src=sourceUrl;$("#result-placeholder").classList.remove("hidden");sourceImage=new Image();
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
function progress(show,msg="Processing image…",percent=0){$("#progress").classList.toggle("hidden",!show);$("#progress-text").textContent=msg;$("#progress-bar").style.width=percent+"%";}
const AI_CONFIG={model:"isnet_quint8",progress:(key,current,total)=>{if(total){const pct=Math.round(current/total*100);const status=$("#model-status");if(status)status.textContent="Downloading free AI model… "+pct+"%";}}};
let aiModulePromise=null,modelReady=false;
async function loadAiModel(){
  if(modelReady)return;
  if(!aiModulePromise)aiModulePromise=(async()=>{
    const mod=await import("https://esm.sh/@imgly/background-removal@1.7.0");
    if(typeof mod.preload!=="function")throw new Error("AI model preloader unavailable");
    await mod.preload(AI_CONFIG);
    return mod;
  })();
  try{await aiModulePromise;modelReady=true;const status=$("#model-status");if(status)status.textContent="✓ Free AI model ready — cached on this device";}
  catch(e){aiModulePromise=null;const status=$("#model-status");if(status)status.textContent="AI model will download when you remove a background.";}
}
async function removeBg(file){
  // Use BiRefNet-lite with mask refinement on WebGPU-capable devices.
  // Keep the smaller IS-Net engine as a reliable fallback for slower/mobile browsers.
  try{
    const gpu=typeof navigator!=="undefined"&&"gpu" in navigator;
    if(gpu){
      const mod=await import("https://esm.sh/@bg0/browser");
      const result=await mod.removeBackground(file,{model:"lite",quality:"quality",onProgress:p=>{
        const labels={preparing:"Preparing AI…",downloading:"Loading high-quality AI…",processing:"Removing background…",finishing:"Smoothing image edges…"};
        const pct=p.progress==null?35:Math.max(8,Math.min(95,Math.round(p.progress*100)));
        progress(true,labels[p.stage]||"Processing image…",pct);
      }});
      return result.blob;
    }
  }catch(error){console.warn("BiRefNet unavailable; using compact fallback.",error);}
  const mod=await import("https://esm.sh/@imgly/background-removal@1.7.0");
  const remove=mod.removeBackground||mod.default;
  return await remove(file,AI_CONFIG);
}
function canvasBlob(canvas,type,quality){return new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error("Could not create image. Try another format.")),type,quality));}
async function run(){if(!sourceFile)return showError("Choose an image first.");processBtn.disabled=true;processBtn.style.opacity=".65";$("#result-actions").classList.add("hidden");$("#error-message").classList.add("hidden");progress(true,"Preparing image…",5);try{let blob,filename="edited-image.png";
if(activeTool==="remove"||activeTool==="change"){progress(true,"Loading free AI background remover…",8);const cutout=await removeBg(sourceFile);if(activeTool==="remove"){blob=cutout;filename="background-removed.png";}else{progress(true,"Applying new background…",88);const cutImage=await createImageBitmap(cutout);const c=document.createElement("canvas");c.width=cutImage.width;c.height=cutImage.height;const ctx=c.getContext("2d");ctx.fillStyle=$("#bg-color").value;ctx.fillRect(0,0,c.width,c.height);ctx.drawImage(cutImage,0,0);blob=await canvasBlob(c,"image/png");filename="background-changed.png";}}
else{progress(true,"Editing your image…",30);const c=document.createElement("canvas"),ctx=c.getContext("2d");if(activeTool==="resize"){const w=Math.round(+$("#width-input").value),h=Math.round(+$("#height-input").value);if(!w||!h||w>8000||h>8000)throw new Error("Enter a width and height between 1 and 8000 pixels.");c.width=w;c.height=h;ctx.drawImage(sourceImage,0,0,w,h);blob=await canvasBlob(c,"image/png");filename="resized-image.png";}else{c.width=sourceImage.naturalWidth;c.height=sourceImage.naturalHeight;ctx.drawImage(sourceImage,0,0);blob=await canvasBlob(c,"image/jpeg",+$("#quality-input").value/100);filename="compressed-image.jpg";}}
if(resultUrl)URL.revokeObjectURL(resultUrl);outputBlob=blob;resultUrl=URL.createObjectURL(blob);preview.src=resultUrl;$("#result-placeholder").classList.add("hidden");$("#download-btn").href=resultUrl;$("#download-btn").download=filename;$("#result-actions").classList.remove("hidden");$("#preview").alt="Processed image result";$("#preview").scrollIntoView({behavior:"smooth",block:"nearest"});progress(false);$("#setting-heading").textContent="Background removed — preview your image";$("#setting-help").textContent="Download your edited image below."; }catch(err){console.error(err);progress(false);showError(/decode|decod|image format|unsupported/i.test(err.message||"")?"This image format is not supported. Please try JPG, PNG, WEBP, GIF, BMP, AVIF or HEIC.":"The image could not be processed. Please try another image or a smaller file.");}finally{processBtn.disabled=false;processBtn.style.opacity="1";}}
processBtn.addEventListener("click",run);
$("#download-btn").addEventListener("click",()=>{if(!outputBlob)return;});
document.querySelector(".menu-toggle").addEventListener("click",()=>document.querySelector(".site-header nav").classList.toggle("open"));
setTool("remove");
// Download the compact AI model as soon as the page opens, before an image is uploaded.
loadAiModel();