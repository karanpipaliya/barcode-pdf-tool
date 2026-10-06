(function(){
"use strict";

const input=document.getElementById("pdfInput");
const chooseBtn=document.getElementById("chooseBtn");
const drop=document.getElementById("dropZone");
const processBtn=document.getElementById("processBtn");
const status=document.getElementById("status");
const fileName=document.getElementById("fileName");
const resultCard=document.getElementById("resultCard");
const results=document.getElementById("results");
const downloadBtn=document.getElementById("downloadBtn");
const previewBtn=document.getElementById("previewBtn");
const printBtn=document.getElementById("printBtn");
const pdfPreview=document.getElementById("pdfPreview");
let outputUrl=null;

let selectedFile=null, outputBytes=null;

function setStatus(msg){ status.textContent=msg; }

chooseBtn.addEventListener("click", function(e){
  e.preventDefault(); e.stopPropagation(); input.click();
});

drop.addEventListener("click", function(e){
  if(e.target!==chooseBtn) input.click();
});

input.addEventListener("change", function(){
  if(this.files && this.files.length) selectFile(this.files[0]);
});

["dragenter","dragover"].forEach(function(ev){
  drop.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();drop.classList.add("drag");});
});
["dragleave","drop"].forEach(function(ev){
  drop.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();drop.classList.remove("drag");});
});
drop.addEventListener("drop",function(e){
  const f=e.dataTransfer.files && e.dataTransfer.files[0];
  if(f && (f.type==="application/pdf" || /\.pdf$/i.test(f.name))) selectFile(f);
  else setStatus("Please select a PDF file.");
});

function selectFile(f){
  if(!f || (!/\.pdf$/i.test(f.name) && f.type!=="application/pdf")){
    setStatus("Please select a PDF file.");
    return;
  }
  selectedFile=f;
  fileName.textContent=f.name+" ("+(f.size/1024/1024).toFixed(2)+" MB)";
  processBtn.disabled=false;
  setStatus("PDF selected successfully. Click Process PDF.");
}

function mm(v){return v*72/25.4;}

function detectTracking(text){
  const candidates=(text.toUpperCase().match(/[A-Z0-9]{12,24}/g)||[]);
  for(const c of candidates){
    if(/^VL\d{13}$/.test(c)) return c;
    if(/^SF[A-Z0-9]{8,}$/.test(c)) return c;
    if(/^\d{12,20}$/.test(c)) return c;
  }
  return null;
}

async function getPageText(page){
  const content=await page.getTextContent();
  return content.items.map(function(i){return i.str||"";}).join(" ");
}

function barcodeDataUrl(code){
  const canvas=document.createElement("canvas");
  bwipjs.toCanvas(canvas,{
    bcid:"code128", text:code, scale:3, height:12,
    includetext:false, padding:0, backgroundcolor:"FFFFFF"
  });
  return canvas.toDataURL("image/png");
}

function qrPngDataUrl(){
  const qr=qrcode(0,"M");
  qr.addData("https://www.meesho.com/RAMAGLOBALVENTURES");
  qr.make();

  // qrcode-generator returns a GIF data URL. Convert that GIF to a real PNG
  // before passing it to PDF-Lib's embedPng().
  const gifUrl=qr.createDataURL(8,0);
  return new Promise(function(resolve,reject){
    const img=new Image();
    img.onload=function(){
      const canvas=document.createElement("canvas");
      canvas.width=img.naturalWidth || img.width;
      canvas.height=img.naturalHeight || img.height;
      const ctx=canvas.getContext("2d");
      ctx.fillStyle="#FFFFFF";
      ctx.fillRect(0,0,canvas.width,canvas.height);
      ctx.drawImage(img,0,0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror=function(){reject(new Error("Could not convert QR code to PNG."));};
    img.src=gifUrl;
  });
}

async function processPdf(){
  if(!selectedFile) return;
  processBtn.disabled=true;
  resultCard.hidden=true;
  results.innerHTML="";
  try{
    if(!window.pdfjsLib) throw new Error("PDF library did not load. Check your internet connection and refresh.");
    if(!window.PDFLib) throw new Error("PDF editor library did not load. Check your internet connection and refresh.");
    if(!window.bwipjs) throw new Error("Barcode library did not load. Check your internet connection and refresh.");

    setStatus("Reading PDF...");
    // Keep separate copies: PDF.js may transfer/detach the ArrayBuffer it receives.
    // Reusing that same buffer in pdf-lib can cause "No PDF header found".
    const fileBuffer=await selectedFile.arrayBuffer();
    const pdfJsBytes=new Uint8Array(fileBuffer.slice(0));
    const pdfLibBytes=new Uint8Array(fileBuffer.slice(0));

    const loading=window.pdfjsLib.getDocument({data:pdfJsBytes});
    const pdf=await loading.promise;
    const out=await PDFLib.PDFDocument.load(pdfLibBytes);
    const font=await out.embedFont(PDFLib.StandardFonts.Helvetica);
    const found=[];

    for(let i=1;i<=pdf.numPages;i++){
      setStatus("Detecting tracking number: page "+i+"/"+pdf.numPages);
      const page=await pdf.getPage(i);
      const text=await getPageText(page);
      found.push(detectTracking(text));
    }

    for(let i=0;i<out.getPageCount();i++){
      const code=found[i];
      if(!code) continue;
      const page=out.getPage(i);
      const pw=page.getWidth(), ph=page.getHeight();
      const left=mm(Math.max(0,Number(document.getElementById("leftMargin").value)||0));
      const right=mm(Math.max(0,Number(document.getElementById("rightMargin").value)||0));
      const bottom=mm(Math.max(0,Number(document.getElementById("bottomMargin").value)||8));
      const bh=mm(Math.max(5,Number(document.getElementById("barcodeHeight").value)||20));
      const textPx=Math.max(7,Number(document.getElementById("textSize").value)||16);
      const show=document.getElementById("showText").value==="yes";
      const qrEnabled=document.getElementById("qrEnabled").value==="yes";

      // Reserve 35 mm QR + 5 mm gap on the right. The QR keeps a 5 mm right margin.
      const qrSize=mm(35);
      const qrGap=mm(5);
      const barcodeWidth=Math.max(20,pw-left-right-(qrEnabled ? qrSize+qrGap : 0));

      const png=await out.embedPng(barcodeDataUrl(code));
      page.drawImage(png,{x:left,y:bottom,width:barcodeWidth,height:bh});

      if(show){
        // Requested text size is in CSS-like px; convert to PDF points.
        // 16 px ≈ 12 pt, i.e. about 5 px larger than the old ~11 px visual size.
        const fontSize=Math.max(5,textPx*0.75);
        const tw=font.widthOfTextAtSize(code,fontSize);
        page.drawText(code,{
          x:Math.max(left,(pw-tw)/2),
          y:Math.max(1,bottom-fontSize-3),
          size:fontSize,font:font,color:PDFLib.rgb(0,0,0)
        });
      }

      if(qrEnabled){
        const qrPng=await out.embedPng(await qrPngDataUrl());
        const qrX=pw-right-qrSize;
        page.drawImage(qrPng,{x:qrX,y:bottom,width:qrSize,height:qrSize});

        const qrTextSize=Math.max(7,textPx*0.75);
        const follow="FOLLOW PLEASE";
        const fw=font.widthOfTextAtSize(follow,qrTextSize);
        page.drawText(follow,{
          x:qrX+(qrSize-fw)/2,
          y:Math.max(1,bottom-qrTextSize-3),
          size:qrTextSize,
          font:font,
          color:PDFLib.rgb(0,0,0)
        });
      }
    }

    setStatus("Creating final PDF...");
    outputBytes=await out.save();
    resultCard.hidden=false;
    results.innerHTML=found.map(function(c,i){
      return '<div class="row"><span>Page '+(i+1)+'</span>'+
        (c?'<span class="ok">'+c+'</span>':'<span class="warn">Tracking number not detected</span>')+
        '</div>';
    }).join("");
    const count=found.filter(Boolean).length;
    setStatus("Done — "+count+" of "+found.length+" pages received a barcode.");
  }catch(err){
    console.error(err);
    setStatus("Error: "+(err && err.message ? err.message : String(err)));
  }finally{
    processBtn.disabled=!selectedFile;
  }
}

processBtn.addEventListener("click",processPdf);

function getOutputUrl(){
  if(!outputBytes) return null;
  if(outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl=URL.createObjectURL(new Blob([outputBytes],{type:"application/pdf"}));
  return outputUrl;
}

previewBtn.addEventListener("click",function(){
  const url=getOutputUrl();
  if(!url) return;
  // Show the generated PDF directly inside the page.
  pdfPreview.src=url;
  pdfPreview.style.display="block";
  pdfPreview.scrollIntoView({behavior:"smooth",block:"start"});
});

printBtn.addEventListener("click",function(){
  const url=getOutputUrl();
  if(!url) return;
  // Open the generated PDF in a browser tab; from there Ctrl+P / Print works
  // without first downloading the PDF file.
  const tab=window.open(url,"_blank");
  if(!tab){
    // Popup blocked: show the embedded preview instead.
    pdfPreview.src=url;
    pdfPreview.style.display="block";
    pdfPreview.scrollIntoView({behavior:"smooth",block:"start"});
    setStatus("Popup was blocked. Use the PDF preview and press Ctrl+P to print.");
    return;
  }
  setTimeout(function(){
    try{tab.focus();}catch(e){}
  },300);
});

downloadBtn.addEventListener("click",function(){
  const url=getOutputUrl();
  if(!url) return;
  const a=document.createElement("a");
  a.href=url;
  a.download=selectedFile.name.replace(/\.pdf$/i,"")+"_barcoded.pdf";
  document.body.appendChild(a);
  a.click();
  a.remove();
});
})();
